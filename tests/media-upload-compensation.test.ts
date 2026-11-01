import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/index.ts";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

function compensationDb() {
  let batchCalls = 0;
  let quotaReleaseCalls = 0;
  const db = {
    prepare(query: string) {
      return {
        bind(..._args: unknown[]) { return this; },
        async first<T>() {
          if (query.includes("SELECT u.id, u.email, u.role FROM admin_sessions")) {
            return { id: "owner-id", email: "owner@example.test", role: "owner" } as T;
          }
          if (query.includes("SELECT id, status FROM projects")) {
            return { id: PROJECT_ID, status: "draft" } as T;
          }
          return null as T | null;
        },
        async run() {
          if (query.includes("UPDATE gf_monthly_media_usage SET used_bytes = MAX")) quotaReleaseCalls += 1;
          return { success: true, meta: { changes: 1 } };
        },
        async all<T>() { return { success: true, results: [] as T[] }; },
      };
    },
    async batch(_statements: unknown[]) {
      batchCalls += 1;
      if (batchCalls === 1) {
        return [
          { success: true, meta: { changes: 0 } },
          { success: true, meta: { changes: 1 } },
        ];
      }
      throw new Error("injected D1 media-record failure");
    },
    get quotaReleaseCalls() { return quotaReleaseCalls; },
  };
  return db;
}

function uploadRequest() {
  const form = new FormData();
  form.set("projectId", PROJECT_ID);
  form.set(
    "file",
    new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01])], {
      type: "image/jpeg",
    }),
    "compensation-test.jpg",
  );
  return new Request("https://example.test/api/admin/projects/media/upload", {
    method: "POST",
    headers: { Cookie: "__Host-gf_admin=test-session-token" },
    body: form,
  });
}

const storageEnv = {
  SUPABASE_URL: "https://photography-test.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "server-only-test-secret",
  SUPABASE_STORAGE_BUCKET: "golden-films-media",
};

test("media upload releases reserved quota after D1 failure when Storage cleanup succeeds", async () => {
  const db = compensationDb();
  const originalFetch = globalThis.fetch;
  const storageMethods: string[] = [];
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    storageMethods.push(method);
    if (method === "POST") return new Response(null, { status: 200 });
    if (method === "DELETE") return new Response(null, { status: 200 });
    throw new Error("Unexpected Storage request");
  };

  try {
    const response = await worker.fetch(uploadRequest(), { DB: db, ...storageEnv } as never);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "media_upload_unavailable" });
    assert.deepEqual(storageMethods, ["POST", "DELETE"]);
    assert.equal(db.quotaReleaseCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("media upload retains quota and reports pending cleanup when Storage deletion fails", async () => {
  const db = compensationDb();
  const originalFetch = globalThis.fetch;
  const storageMethods: string[] = [];
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    storageMethods.push(method);
    if (method === "POST") return new Response(null, { status: 200 });
    if (method === "DELETE") return new Response("injected cleanup failure", { status: 500 });
    throw new Error("Unexpected Storage request");
  };

  try {
    const response = await worker.fetch(uploadRequest(), { DB: db, ...storageEnv } as never);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "media_upload_cleanup_pending" });
    assert.deepEqual(storageMethods, ["POST", "DELETE"]);
    assert.equal(db.quotaReleaseCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
