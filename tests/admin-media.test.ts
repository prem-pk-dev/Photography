import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/index.ts";

function mockDb() {
  return {
    prepare(_query: string) {
      return {
        bind(..._args: unknown[]) { return this; },
        async first<T>() { return null as T | null; },
        async run() { return { success: true, meta: { changes: 0 } }; },
        async all<T>() { return { success: true, results: [] as T[] }; },
      };
    },
  };
}

test("public media route fails closed when Supabase Storage is not configured", async () => {
  const response = await worker.fetch(
    new Request("https://example.test/api/media/projects/00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002.jpg"),
    { DB: mockDb() },
  );
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "media_storage_not_configured" });
});

test("media upload requires an authenticated admin before checking Supabase Storage configuration", async () => {
  const response = await worker.fetch(
    new Request("https://example.test/api/admin/projects/media/upload", {
      method: "POST",
      body: new FormData(),
    }),
    { DB: mockDb() },
  );
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "unauthorized" });
});

test("media upload rejects an invalid session before checking Supabase Storage configuration", async () => {
  const response = await worker.fetch(
    new Request("https://example.test/api/admin/projects/media/upload", {
      method: "POST",
      headers: { cookie: "__Host-gf_admin=invalid-session" },
      body: new FormData(),
    }),
    { DB: mockDb() },
  );
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "unauthorized" });
});

test("media replacement requires an authenticated admin", async () => {
  const response = await worker.fetch(
    new Request("https://example.test/api/admin/projects/media/replace", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "media-id", previewUrl: "https://example.test/image.jpg" }),
    }),
    { DB: mockDb() },
  );
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "unauthorized" });
});

test("media hiding requires an authenticated admin", async () => {
  const response = await worker.fetch(
    new Request("https://example.test/api/admin/projects/media/hide", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "media-id" }),
    }),
    { DB: mockDb() },
  );
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "unauthorized" });
});

test("editor cannot hide media because the route is owner-only", async () => {
  const db = {
    prepare(query: string) {
      return {
        bind(..._args: unknown[]) { return this; },
        async first<T>() {
          if (query.includes("SELECT u.id, u.email, u.role FROM admin_sessions")) {
            return { id: "editor-id", email: "editor@example.test", role: "editor" } as T;
          }
          return null as T | null;
        },
        async run() { return { success: true, meta: { changes: 0 } }; },
        async all<T>() { return { success: true, results: [] as T[] }; },
      };
    },
  };
  const response = await worker.fetch(
    new Request("https://example.test/api/admin/projects/media/hide", {
      method: "POST",
      headers: {
        cookie: "__Host-gf_admin=valid-test-session",
        "content-type": "application/json",
      },
      body: JSON.stringify({ id: "media-id" }),
    }),
    { DB: db },
  );
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "forbidden" });
});

test("media upload rejects a file whose bytes do not match its declared image MIME type", async () => {
  const db = {
    prepare(query: string) {
      return {
        bind(..._args: unknown[]) { return this; },
        async first<T>() {
          if (query.includes("SELECT u.id, u.email, u.role FROM admin_sessions")) {
            return { id: "owner-id", email: "owner@example.test", role: "owner" } as T;
          }
          return null as T | null;
        },
        async run() { return { success: true, meta: { changes: 0 } }; },
        async all<T>() { return { success: true, results: [] as T[] }; },
        async batch<T>() { return [] as T[]; },
      };
    },
  };
  const form = new FormData();
  form.set("projectId", "project-id");
  form.set("file", new Blob(["not actually a png"], { type: "image/png" }), "fake.png");
  const response = await worker.fetch(
    new Request("https://example.test/api/admin/projects/media/upload", {
      method: "POST",
      headers: { cookie: "__Host-gf_admin=valid-test-session" },
      body: form,
    }),
    {
      DB: db,
      SUPABASE_URL: "https://storage.example.test",
      SUPABASE_SERVICE_ROLE_KEY: "test-only-not-a-real-secret",
      SUPABASE_STORAGE_BUCKET: "test-bucket",
    },
  );
  assert.equal(response.status, 415);
  assert.deepEqual(await response.json(), { error: "file_signature_mismatch" });
});

test("owner cannot hide media that is currently the project's cover image", async () => {
  const db = {
    prepare(query: string) {
      return {
        bind(..._args: unknown[]) { return this; },
        async first<T>() {
          if (query.includes("SELECT u.id, u.email, u.role FROM admin_sessions")) {
            return { id: "owner-id", email: "owner@example.test", role: "owner" } as T;
          }
          if (query.includes("SELECT m.preview_url, p.cover_image_url FROM project_media")) {
            return { preview_url: "/api/media/projects/p/m.jpg", cover_image_url: "/api/media/projects/p/m.jpg" } as T;
          }
          return null as T | null;
        },
        async run() { return { success: true, meta: { changes: 1 } }; },
        async all<T>() { return { success: true, results: [] as T[] }; },
      };
    },
  };
  const response = await worker.fetch(
    new Request("https://example.test/api/admin/projects/media/hide", {
      method: "POST",
      headers: {
        cookie: "__Host-gf_admin=valid-test-session",
        "content-type": "application/json",
      },
      body: JSON.stringify({ id: "cover-media-id" }),
    }),
    { DB: db },
  );
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: "replace_cover_before_hiding" });
});

test("media upload rejects an oversized declared request before reading the body", async () => {
  const db = {
    prepare(query: string) {
      return {
        bind(..._args: unknown[]) { return this; },
        async first<T>() {
          if (query.includes("SELECT u.id, u.email, u.role FROM admin_sessions")) {
            return { id: "owner-id", email: "owner@example.test", role: "owner" } as T;
          }
          return null as T | null;
        },
        async run() { return { success: true, meta: { changes: 0 } }; },
        async all<T>() { return { success: true, results: [] as T[] }; },
        async batch<T>() { return [] as T[]; },
      };
    },
  };
  const response = await worker.fetch(
    new Request("https://example.test/api/admin/projects/media/upload", {
      method: "POST",
      headers: {
        cookie: "__Host-gf_admin=valid-test-session",
        "content-length": String(20 * 1024 * 1024 + 64 * 1024 + 1),
      },
    }),
    {
      DB: db,
      SUPABASE_URL: "https://storage.example.test",
      SUPABASE_SERVICE_ROLE_KEY: "test-only-not-a-real-secret",
      SUPABASE_STORAGE_BUCKET: "test-bucket",
    },
  );
  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), { error: "file_too_large" });
});

test("hiding non-cover media only marks it private and does not require Storage configuration", async () => {
  const executed: string[] = [];
  const db = {
    prepare(query: string) {
      return {
        bind(..._args: unknown[]) { return this; },
        async first<T>() {
          if (query.includes("SELECT u.id, u.email, u.role FROM admin_sessions")) {
            return { id: "owner-id", email: "owner@example.test", role: "owner" } as T;
          }
          if (query.includes("SELECT m.preview_url, p.cover_image_url FROM project_media")) {
            return { preview_url: "/api/media/projects/project-id/media-id.jpg", cover_image_url: "https://example.test/other-cover.jpg" } as T;
          }
          return null as T | null;
        },
        async run() {
          executed.push(query);
          return { success: true, meta: { changes: 1 } };
        },
        async all<T>() { return { success: true, results: [] as T[] }; },
      };
    },
  };
  const response = await worker.fetch(
    new Request("https://example.test/api/admin/projects/media/hide", {
      method: "POST",
      headers: {
        cookie: "__Host-gf_admin=valid-test-session",
        "content-type": "application/json",
      },
      body: JSON.stringify({ id: "media-id" }),
    }),
    { DB: db },
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, id: "media-id", isPublic: false });
  assert.ok(executed.some((query) => query.includes("UPDATE project_media SET is_public = 0")));
  assert.ok(executed.some((query) => query.includes("'media_hidden'")));
  assert.equal(executed.some((query) => query.includes("DELETE")), false);
});

test("owner cannot hide an unknown media id and no update or audit is written", async () => {
  const executed: string[] = [];
  const db = {
    prepare(query: string) {
      return {
        bind(..._args: unknown[]) { return this; },
        async first<T>() {
          if (query.includes("SELECT u.id, u.email, u.role FROM admin_sessions")) {
            return { id: "owner-id", email: "owner@example.test", role: "owner" } as T;
          }
          return null as T | null;
        },
        async run() {
          executed.push(query);
          return { success: true, meta: { changes: 1 } };
        },
        async all<T>() { return { success: true, results: [] as T[] }; },
      };
    },
  };
  const response = await worker.fetch(
    new Request("https://example.test/api/admin/projects/media/hide", {
      method: "POST",
      headers: {
        cookie: "__Host-gf_admin=valid-test-session",
        "content-type": "application/json",
      },
      body: JSON.stringify({ id: "unknown-media-id" }),
    }),
    { DB: db },
  );
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "media_not_found" });
  assert.deepEqual(executed, []);
});

test("editor cannot replace public media or the current cover image", async () => {
  const executed: string[] = [];
  const db = {
    prepare(query: string) {
      return {
        bind(..._args: unknown[]) { return this; },
        async first<T>() {
          if (query.includes("SELECT u.id, u.email, u.role FROM admin_sessions")) {
            return { id: "editor-id", email: "editor@example.test", role: "editor" } as T;
          }
          if (query.includes("SELECT m.project_id, m.preview_url, m.is_public, p.cover_image_url FROM project_media")) {
            return {
              project_id: "project-id",
              preview_url: "https://cdn.example.test/current.jpg",
              is_public: 1,
              cover_image_url: "https://cdn.example.test/current.jpg",
            } as T;
          }
          return null as T | null;
        },
        async run() {
          executed.push(query);
          return { success: true, meta: { changes: 1 } };
        },
        async all<T>() { return { success: true, results: [] as T[] }; },
      };
    },
  };
  const response = await worker.fetch(
    new Request("https://example.test/api/admin/projects/media/replace", {
      method: "POST",
      headers: {
        cookie: "__Host-gf_admin=valid-test-session",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        id: "media-id",
        previewUrl: "https://cdn.example.test/replacement.jpg",
        altEn: "Replacement",
        altHi: "Replacement",
      }),
    }),
    { DB: db },
  );
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "forbidden" });
  assert.deepEqual(executed, []);
});

test("editor can replace private non-cover media without changing project cover", async () => {
  const executed: string[] = [];
  const db = {
    prepare(query: string) {
      return {
        bind(..._args: unknown[]) { return this; },
        async first<T>() {
          if (query.includes("SELECT u.id, u.email, u.role FROM admin_sessions")) {
            return { id: "editor-id", email: "editor@example.test", role: "editor" } as T;
          }
          if (query.includes("SELECT m.project_id, m.preview_url, m.is_public, p.cover_image_url FROM project_media")) {
            return {
              project_id: "project-id",
              preview_url: "https://cdn.example.test/private-old.jpg",
              is_public: 0,
              cover_image_url: "https://cdn.example.test/current-cover.jpg",
            } as T;
          }
          return null as T | null;
        },
        async run() {
          executed.push(query);
          return { success: true, meta: { changes: 1 } };
        },
        async all<T>() { return { success: true, results: [] as T[] }; },
      };
    },
  };
  const response = await worker.fetch(
    new Request("https://example.test/api/admin/projects/media/replace", {
      method: "POST",
      headers: {
        cookie: "__Host-gf_admin=valid-test-session",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        id: "private-media-id",
        previewUrl: "https://cdn.example.test/private-new.jpg",
        altEn: "Private image",
        altHi: "Private image",
      }),
    }),
    { DB: db },
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, id: "private-media-id" });
  assert.ok(executed.some((query) => query.includes("UPDATE project_media SET preview_url")));
  assert.ok(executed.some((query) => query.includes("UPDATE projects SET cover_image_url")));
  assert.ok(executed.some((query) => query.includes("'media_replaced'")));
});

test("editor cannot create public media and no database write occurs", async () => {
  const executed: string[] = [];
  const db = {
    prepare(query: string) {
      return {
        bind(..._args: unknown[]) { return this; },
        async first<T>() {
          if (query.includes("SELECT u.id, u.email, u.role FROM admin_sessions")) {
            return { id: "editor-id", email: "editor@example.test", role: "editor" } as T;
          }
          return null as T | null;
        },
        async run() {
          executed.push(query);
          return { success: true, meta: { changes: 1 } };
        },
        async all<T>() { return { success: true, results: [] as T[] }; },
      };
    },
  };
  const response = await worker.fetch(
    new Request("https://example.test/api/admin/projects/media", {
      method: "POST",
      headers: {
        cookie: "__Host-gf_admin=valid-test-session",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        projectId: "project-id",
        mediaType: "image",
        previewUrl: "https://cdn.example.test/public.jpg",
        altEn: "Public image",
        altHi: "Public image",
        sortOrder: 0,
        isPublic: true,
      }),
    }),
    { DB: db },
  );
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "forbidden" });
  assert.deepEqual(executed, []);
});

test("editor can create private draft media with an audit entry", async () => {
  const executed: Array<{ query: string; args: unknown[] }> = [];
  const db = {
    prepare(query: string) {
      return {
        bind(...args: unknown[]) { (this as any).args = args; return this; },
        async first<T>() {
          if (query.includes("SELECT u.id, u.email, u.role FROM admin_sessions")) {
            return { id: "editor-id", email: "editor@example.test", role: "editor" } as T;
          }
          if (query.includes("SELECT id FROM projects WHERE id = ?")) {
            return { id: "project-id" } as T;
          }
          return null as T | null;
        },
        async run() {
          executed.push({ query, args: (this as any).args ?? [] });
          return { success: true, meta: { changes: 1 } };
        },
        async all<T>() { return { success: true, results: [] as T[] }; },
      };
    },
  };
  const response = await worker.fetch(
    new Request("https://example.test/api/admin/projects/media", {
      method: "POST",
      headers: {
        cookie: "__Host-gf_admin=valid-test-session",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        projectId: "project-id",
        mediaType: "image",
        previewUrl: "https://cdn.example.test/draft.jpg",
        altEn: "Draft image",
        altHi: "Draft image",
        sortOrder: 0,
        isPublic: false,
      }),
    }),
    { DB: db },
  );
  assert.equal(response.status, 201);
  const body = await response.json() as { ok: boolean; id: string; isPublic: boolean };
  assert.equal(body.ok, true);
  assert.equal(body.isPublic, false);
  assert.ok(body.id);
  assert.ok(executed.some((entry) => entry.query.includes("INSERT INTO project_media")));
  assert.ok(executed.some((entry) => entry.query.includes("INSERT INTO audit_logs") && entry.args.includes("media_added_draft")));
});


test("public media route does not fetch Storage objects unless D1 marks media public on a published project", async () => {
  let storageCalls = 0;
  const db = {
    prepare(query: string) {
      return {
        bind(..._args: unknown[]) { return this; },
        async first<T>() {
          if (query.includes("WHERE m.original_key = ? AND m.is_public = 1 AND p.status = 'published'")) {
            return null as T | null;
          }
          return null as T | null;
        },
        async run() { return { success: true, meta: { changes: 0 } }; },
        async all<T>() { return { success: true, results: [] as T[] }; },
      };
    },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    storageCalls += 1;
    return new Response("should not be fetched", { status: 200 });
  };

  try {
    const response = await worker.fetch(
      new Request("https://example.test/api/media/projects/00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002.jpg"),
      {
        DB: db,
        SUPABASE_URL: "https://storage.example.test",
        SUPABASE_SERVICE_ROLE_KEY: "test-only-not-a-real-secret",
        SUPABASE_STORAGE_BUCKET: "test-bucket",
      },
    );
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "media_not_found" });
    assert.equal(storageCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("public media route rejects malformed object keys before querying Storage", async () => {
  let storageCalls = 0;
  const db = {
    prepare(_query: string) {
      return {
        bind(..._args: unknown[]) { return this; },
        async first<T>() { return null as T | null; },
        async run() { return { success: true, meta: { changes: 0 } }; },
        async all<T>() { return { success: true, results: [] as T[] }; },
      };
    },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    storageCalls += 1;
    return new Response("should not be fetched", { status: 200 });
  };

  try {
    const response = await worker.fetch(
      new Request("https://example.test/api/media/projects/not-a-valid-object-key"),
      {
        DB: db,
        SUPABASE_URL: "https://storage.example.test",
        SUPABASE_SERVICE_ROLE_KEY: "test-only-not-a-real-secret",
        SUPABASE_STORAGE_BUCKET: "test-bucket",
      },
    );
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "media_not_found" });
    assert.equal(storageCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("media replacement rejects unsafe external URLs before database writes", async () => {
  const executed: string[] = [];
  const db = {
    prepare(query: string) {
      return {
        bind(..._args: unknown[]) { return this; },
        async first<T>() {
          if (query.includes("SELECT u.id, u.email, u.role FROM admin_sessions")) {
            return { id: "owner-id", email: "owner@example.test", role: "owner" } as T;
          }
          return null as T | null;
        },
        async run() {
          executed.push(query);
          return { success: true, meta: { changes: 1 } };
        },
        async all<T>() { return { success: true, results: [] as T[] }; },
      };
    },
  };
  for (const previewUrl of [
    "http://cdn.example.test/image.jpg",
    "https://localhost/image.jpg",
    "https://user:pass@cdn.example.test/image.jpg",
    "https://192.168.1.10/image.jpg",
    "https://172.16.0.5/image.jpg",
  ]) {
    const response = await worker.fetch(
      new Request("https://example.test/api/admin/projects/media/replace", {
        method: "POST",
        headers: {
          cookie: "__Host-gf_admin=valid-test-session",
          "content-type": "application/json",
        },
        body: JSON.stringify({ id: "media-id", previewUrl }),
      }),
      { DB: db },
    );
    assert.equal(response.status, 400, previewUrl);
    assert.deepEqual(await response.json(), { error: "validation_failed" }, previewUrl);
  }
  assert.deepEqual(executed, []);
});

test("owner replacing current cover media updates the cover URL and records the change", async () => {
  const executed: Array<{ query: string; args: unknown[] }> = [];
  const db = {
    prepare(query: string) {
      let args: unknown[] = [];
      return {
        bind(...values: unknown[]) { args = values; return this; },
        async first<T>() {
          if (query.includes("SELECT u.id, u.email, u.role FROM admin_sessions")) {
            return { id: "owner-id", email: "owner@example.test", role: "owner" } as T;
          }
          if (query.includes("SELECT m.project_id, m.preview_url, m.is_public, p.cover_image_url FROM project_media")) {
            return {
              project_id: "project-id",
              preview_url: "https://cdn.example.test/old-cover.jpg",
              is_public: 1,
              cover_image_url: "https://cdn.example.test/old-cover.jpg",
            } as T;
          }
          return null as T | null;
        },
        async run() {
          executed.push({ query, args });
          return { success: true, meta: { changes: 1 } };
        },
        async all<T>() { return { success: true, results: [] as T[] }; },
      };
    },
  };
  const response = await worker.fetch(
    new Request("https://example.test/api/admin/projects/media/replace", {
      method: "POST",
      headers: {
        cookie: "__Host-gf_admin=valid-test-session",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        id: "cover-media-id",
        previewUrl: "https://cdn.example.test/new-cover.jpg",
        altEn: "Updated cover",
        altHi: "अपडेट किया गया कवर",
      }),
    }),
    { DB: db },
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, id: "cover-media-id" });
  const coverUpdate = executed.find(entry => entry.query.includes("UPDATE projects SET cover_image_url"));
  assert.ok(coverUpdate, "cover URL update query should execute");
  assert.equal(coverUpdate.args[0], "https://cdn.example.test/new-cover.jpg");
  assert.equal(coverUpdate.args[1], "project-id");
  assert.equal(coverUpdate.args[2], "https://cdn.example.test/old-cover.jpg");
  assert.ok(executed.some(entry => entry.query.includes("'media_replaced'")));
});

test("owner can create public media and writes a public-media audit entry", async () => {
  const executed: Array<{ query: string; args: unknown[] }> = [];
  const db = {
    prepare(query: string) {
      let args: unknown[] = [];
      return {
        bind(...values: unknown[]) { args = values; return this; },
        async first<T>() {
          if (query.includes("SELECT u.id, u.email, u.role FROM admin_sessions")) {
            return { id: "owner-id", email: "owner@example.test", role: "owner" } as T;
          }
          if (query.includes("SELECT id FROM projects WHERE id = ?")) {
            return { id: "project-id" } as T;
          }
          return null as T | null;
        },
        async run() {
          executed.push({ query, args });
          return { success: true, meta: { changes: 1 } };
        },
        async all<T>() { return { success: true, results: [] as T[] }; },
      };
    },
  };
  const response = await worker.fetch(
    new Request("https://example.test/api/admin/projects/media", {
      method: "POST",
      headers: {
        cookie: "__Host-gf_admin=valid-test-session",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        projectId: "project-id",
        mediaType: "image",
        previewUrl: "https://cdn.example.test/public-owner-image.jpg",
        altEn: "Published image",
        altHi: "प्रकाशित तस्वीर",
        sortOrder: 1,
        isPublic: true,
      }),
    }),
    { DB: db },
  );
  assert.equal(response.status, 201);
  const body = await response.json() as { ok: boolean; id: string; isPublic: boolean };
  assert.equal(body.ok, true);
  assert.equal(body.isPublic, true);
  const insert = executed.find(entry => entry.query.includes("INSERT INTO project_media"));
  assert.ok(insert);
  assert.equal(insert.args[insert.args.length - 1], 1);
  assert.ok(executed.some(entry => entry.query.includes("INSERT INTO audit_logs") && entry.args[2] === "media_added_public"), "public media audit action should be bound to the audit insert");
});


test("media upload keeps the quota reservation and returns cleanup-pending when Storage deletion fails", async () => {
  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;
  const fetchMethods: string[] = [];
  const executedRuns: string[] = [];
  let batchCalls = 0;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    fetchMethods.push(init?.method ?? "GET");
    if (init?.method === "POST") return new Response("{}", { status: 200 });
    if (init?.method === "DELETE") return new Response("cleanup failed", { status: 500 });
    return new Response("unexpected request", { status: 500 });
  };
  console.error = () => {};
  const db = {
    prepare(query: string) {
      return {
        bind(..._args: unknown[]) { return this; },
        async first<T>() {
          if (query.includes("SELECT u.id, u.email, u.role FROM admin_sessions")) {
            return { id: "owner-id", email: "owner@example.test", role: "owner" } as T;
          }
          if (query.includes("SELECT id, status FROM projects")) return { id: "project-id", status: "published" } as T;
          return null as T | null;
        },
        async run() {
          executedRuns.push(query);
          return { success: true, meta: { changes: 1 } };
        },
        async all<T>() { return { success: true, results: [] as T[] }; },
      };
    },
    async batch<T>() {
      batchCalls += 1;
      if (batchCalls === 1) return [{ success: true }, { success: true, meta: { changes: 1 } }] as T[];
      throw new Error("simulated D1 media insert failure");
    },
  };
  try {
    const form = new FormData();
    form.set("projectId", "project-id");
    form.set("file", new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], { type: "image/png" }), "test.png");
    const response = await worker.fetch(
      new Request("https://example.test/api/admin/projects/media/upload", {
        method: "POST",
        headers: { cookie: "__Host-gf_admin=valid-test-session" },
        body: form,
      }),
      {
        DB: db,
        SUPABASE_URL: "https://storage.example.test",
        SUPABASE_SERVICE_ROLE_KEY: "test-only-not-a-real-secret",
        SUPABASE_STORAGE_BUCKET: "test-bucket",
      },
    );
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "media_upload_cleanup_pending" });
    assert.deepEqual(fetchMethods, ["POST", "DELETE"]);
    assert.equal(executedRuns.some((query) => query.includes("UPDATE gf_monthly_media_usage SET used_bytes = MAX")), false);
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
  }
});
