import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/index.ts";

const token = "unit-test-editor-session";

function editorDb() {
  const queries: string[] = [];
  return {
    queries,
    prepare(query: string) {
      return {
        bind(..._args: unknown[]) { queries.push(query); return this; },
        async first<T>() {
          if (query.includes("FROM admin_sessions s JOIN admin_users u")) {
            return { id: "editor-1", email: "editor@example.test", role: "editor" } as T;
          }
          return null as T | null;
        },
        async run() { return { success: true, meta: { changes: 0 } }; },
        async all<T>() { return { success: true, results: [] as T[] }; }
      };
    }
  };
}

function editorRequest(url: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  headers.set("cookie", "__Host-gf_admin=" + token);
  return new Request(url, { ...init, headers });
}

test("editor cannot publish CMS content", async () => {
  const response = await worker.fetch(editorRequest("https://example.test/api/admin/content/publish", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ page: "home" })
  }), { DB: editorDb() });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "forbidden" });
});

test("editor cannot view owner-only audit logs", async () => {
  const response = await worker.fetch(editorRequest("https://example.test/api/admin/audit"), { DB: editorDb() });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "forbidden" });
});

test("editor cannot manage admin accounts", async () => {
  const response = await worker.fetch(editorRequest("https://example.test/api/admin/users"), { DB: editorDb() });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "forbidden" });
});

test("editor cannot publish a project", async () => {
  const response = await worker.fetch(editorRequest("https://example.test/api/admin/projects/save", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      slug: "sample-project", categorySlug: "wedding-photography", titleEn: "Sample", titleHi: "नमूना",
      coverImageUrl: "https://images.example.test/cover.jpg", status: "published"
    })
  }), { DB: editorDb() });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "forbidden" });
});


test("editor cannot permanently delete project media", async () => {
  const db = editorDb();
  const response = await worker.fetch(editorRequest("https://example.test/api/admin/projects/media/delete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "00000000-0000-4000-8000-000000000001" })
  }), { DB: db, MEDIA_GITHUB_TOKEN: "unit-test-token" });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "forbidden" });
  assert.equal(db.queries.some(query => /DELETE FROM project_media|DELETE FROM audit_logs/.test(query)), false);
});

test("editor cannot hide project media", async () => {
  const db = editorDb();
  const response = await worker.fetch(editorRequest("https://example.test/api/admin/projects/media/hide", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "media-1" })
  }), { DB: db });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "forbidden" });
  assert.equal(db.queries.some(query => /UPDATE project_media/.test(query)), false);
});

test("editor cannot create admin accounts", async () => {
  const db = editorDb();
  const response = await worker.fetch(editorRequest("https://example.test/api/admin/users/create", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "new-editor@example.test", password: "long-secure-password-123" })
  }), { DB: db });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "forbidden" });
  assert.equal(db.queries.some(query => /INSERT INTO admin_users|INSERT INTO audit_logs/.test(query)), false);
  assert.equal(db.queries.some(query => query.includes("INSERT INTO auth_rate_limits")), false);
});

test("editor cannot disable admin accounts", async () => {
  const db = editorDb();
  const response = await worker.fetch(editorRequest("https://example.test/api/admin/users/disable", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "admin-2" })
  }), { DB: db });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "forbidden" });
  assert.equal(db.queries.some(query => /UPDATE admin_users|DELETE FROM admin_sessions|INSERT INTO audit_logs/.test(query)), false);
});
