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
