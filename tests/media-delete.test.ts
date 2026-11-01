import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/index.ts";

const MEDIA_ID = "media_123";
const PROJECT_ID = "project_123";
const KEY = `projects/${PROJECT_ID}/${MEDIA_ID}.jpg`;
const ENV_STORAGE = {
  SUPABASE_URL: "https://photography-test.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "test-only-not-a-real-secret",
  SUPABASE_STORAGE_BUCKET: "golden-films-media",
};

function makeDb(options: { role?: "owner" | "editor"; cover?: boolean; external?: boolean } = {}) {
  const state = {
    role: options.role ?? "owner",
    cover: options.cover ?? false,
    external: options.external ?? false,
    hidden: false,
    mediaExists: true,
    job: null as null | { id: string; media_id: string; project_id: string; storage_key: string; status: string },
    audit: [] as string[],
    statements: [] as string[],
    failFinalBatch: false,
  };
  const db = {
    prepare(query: string) {
      let args: unknown[] = [];
      const stmt = {
        bind(...values: unknown[]) { args = values; return stmt; },
        async first<T>() {
          if (query.includes("SELECT u.id, u.email, u.role FROM admin_sessions")) {
            return { id: "admin-id", email: "owner@example.test", role: state.role } as T;
          }
          if (query.includes("FROM project_media m JOIN projects p") && query.includes("WHERE m.id = ?")) {
            if (!state.mediaExists) return null as T | null;
            return {
              id: MEDIA_ID,
              project_id: PROJECT_ID,
              preview_url: state.cover ? "/api/media/" + KEY : "/api/media/" + KEY,
              original_key: state.external ? null : KEY,
              cover_image_url: state.cover ? "/api/media/" + KEY : "/api/media/other.jpg",
            } as T;
          }
          if (query.includes("FROM gf_media_cleanup_jobs") && query.includes("WHERE media_id = ?")) {
            return state.job as T | null;
          }
          if (query.includes("FROM gf_media_cleanup_jobs WHERE id = ?")) {
            return state.job as T | null;
          }
          return null as T | null;
        },
        async run() {
          state.statements.push(query);
          if (query.includes("UPDATE gf_media_cleanup_jobs SET status = 'failed'")) {
            if (state.job) {
              state.job.status = "failed";
            }
            return { success: true, meta: { changes: 1 } };
          }
          if (query.includes("DELETE FROM project_media WHERE id = ? AND project_id = ? AND original_key IS NULL")) {
            state.mediaExists = false;
            return { success: true, meta: { changes: 1 } };
          }
          return { success: true, meta: { changes: 1 } };
        },
        async all<T>() { return { success: true, results: [] as T[] }; },
      };
      return stmt;
    },
    async batch(statements: Array<{ bind?: (...args: unknown[]) => unknown; [key: string]: unknown }>) {
      if (state.failFinalBatch && statements.some((s) => String((s as { query?: string }).query ?? "").includes("DELETE FROM project_media"))) {
        throw new Error("injected final D1 failure");
      }
      // D1Statement mocks don't expose query; capture behavior from the ordered batch length
      // and the route's job state to emulate the two transaction phases.
      if (state.external && !state.job) {
        state.mediaExists = false;
      } else if (!state.job) {
        state.job = { id: "job_123", media_id: MEDIA_ID, project_id: PROJECT_ID, storage_key: KEY, status: "pending" };
        state.hidden = true;
      } else {
        state.mediaExists = false;
        state.job.status = "complete";
        state.audit.push("media_deleted");
      }
      return statements.map(() => ({ success: true, meta: { changes: 1 } }));
    },
  };
  return { db, state };
}

function request(id = MEDIA_ID, roleCookie = "test-session") {
  return new Request("https://example.test/api/admin/projects/media/delete", {
    method: "POST",
    headers: {
      cookie: `__Host-gf_admin=${roleCookie}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ id }),
  });
}

test("media delete requires an authenticated admin", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/admin/projects/media/delete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: MEDIA_ID }),
  }), { DB: makeDb().db } as never);
  assert.equal(response.status, 401);
});

test("editor cannot permanently delete media and Storage is untouched", async () => {
  const { db } = makeDb({ role: "editor" });
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response(null, { status: 200 }); };
  try {
    const response = await worker.fetch(request(), { DB: db, ...ENV_STORAGE } as never);
    assert.equal(response.status, 403);
    assert.equal(calls, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test("current cover media cannot be deleted", async () => {
  const { db } = makeDb({ cover: true });
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response(null, { status: 200 }); };
  try {
    const response = await worker.fetch(request(), { DB: db, ...ENV_STORAGE } as never);
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: "replace_cover_before_deleting" });
    assert.equal(calls, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test("invalid media ID is rejected before database mutation", async () => {
  const { db } = makeDb();
  const response = await worker.fetch(request("../bad"), { DB: db, ...ENV_STORAGE } as never);
  assert.equal(response.status, 400);
});

test("uploaded media is removed through Storage and cleanup ledger", async () => {
  const { db, state } = makeDb();
  const originalFetch = globalThis.fetch;
  const calls: Array<{ method: string; url: string; body: string }> = [];
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ method: init?.method ?? "GET", url: String(input), body: String(init?.body ?? "") });
    return new Response(null, { status: 200 });
  };
  try {
    const response = await worker.fetch(request(), { DB: db, ...ENV_STORAGE } as never);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, id: MEDIA_ID, storageDeleted: true });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, "DELETE");
    assert.match(calls[0].url, /\/storage\/v1\/object\/golden-films-media$/);
    assert.deepEqual(JSON.parse(calls[0].body), { prefixes: [KEY] });
    assert.equal(state.hidden, true);
    assert.equal(state.mediaExists, false);
    assert.equal(state.job?.status, "complete");
    assert.ok(state.audit.includes("media_deleted"));
    assert.equal(state.statements.some((q) => q.includes("gf_monthly_media_usage")), false);
  } finally { globalThis.fetch = originalFetch; }
});

test("Storage failure keeps media hidden and cleanup job retryable", async () => {
  const { db, state } = makeDb();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("failure", { status: 500 });
  try {
    const response = await worker.fetch(request(), { DB: db, ...ENV_STORAGE } as never);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "media_delete_cleanup_pending", retryable: true });
    assert.equal(state.hidden, true);
    assert.equal(state.mediaExists, true);
    assert.equal(state.job?.status, "failed");
  } finally { globalThis.fetch = originalFetch; }
});

test("external media deletes its database row without calling Supabase Storage", async () => {
  const { db, state } = makeDb({ external: true });
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response(null, { status: 200 }); };
  try {
    const response = await worker.fetch(request(), { DB: db } as never);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, id: MEDIA_ID, storageDeleted: false });
    assert.equal(calls, 0);
    assert.equal(state.statements.some((q) => q.includes("gf_monthly_media_usage")), false);
  } finally { globalThis.fetch = originalFetch; }
});
