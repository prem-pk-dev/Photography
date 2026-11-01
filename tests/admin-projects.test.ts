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
        async all<T>() { return { success: true, results: [] as T[] }; }
      };
    }
  };
}

test("admin project list requires a verified session", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/admin/projects"), { DB: mockDb() });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "unauthorized" });
});

test("admin project save requires a verified session", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/admin/projects/save", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ slug: "sample-project", categorySlug: "wedding-photography", titleEn: "Sample", titleHi: "नमूना" })
  }), { DB: mockDb() });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "unauthorized" });
});

test("external media URL management requires a verified session", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/admin/projects/media", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ projectId: "project-1", mediaType: "image", previewUrl: "https://images.example.test/photo.jpg" })
  }), { DB: mockDb() });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "unauthorized" });
});

test("media replacement and hiding require a verified session", async () => {
  for (const path of ["/api/admin/projects/media/replace", "/api/admin/projects/media/hide"]) {
    const response = await worker.fetch(new Request("https://example.test" + path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "media-1", previewUrl: "https://images.example.test/new.jpg" })
    }), { DB: mockDb() });
    assert.equal(response.status, 401, path);
    assert.deepEqual(await response.json(), { error: "unauthorized" }, path);
  }
});

test("R2 upload route requires an admin session before checking storage configuration", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/admin/projects/media/upload", {
    method: "POST",
    headers: { "content-type": "multipart/form-data; boundary=invalid" },
    body: "--invalid--"
  }), { DB: mockDb() });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "unauthorized" });
});

test("public media route fails closed when R2 is not configured", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/media/projects/00000000-0000-0000-0000-000000000000/00000000-0000-0000-0000-000000000001.jpg"), { DB: mockDb() });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "media_storage_not_configured" });
});


test("admin project save batches project, bilingual translations, and audit atomically", async () => {
  const statements: string[] = [];
  const projectId = "11111111-1111-4111-8111-111111111111";
  let batchCalls = 0;
  const db = {
    prepare(query: string) {
      return {
        bind(..._args: unknown[]) { statements.push(query); return this; },
        async first<T>() {
          if (query.includes("JOIN admin_users u ON u.id = s.admin_user_id")) {
            return { id: "owner-1", email: "owner@example.test", role: "owner" } as T;
          }
          if (query.includes("SELECT id, status FROM projects WHERE slug")) return null as T | null;
          if (query.includes("SELECT id, slug FROM categories WHERE slug")) {
            return { id: "category-1", slug: "wedding-photography" } as T;
          }
          return null as T | null;
        },
        async run() { return { success: true, meta: { changes: 1 } }; },
        async all<T>() {
          if (query.includes("PRAGMA table_info(projects)")) {
            return { success: true, results: ["id", "slug", "category_slug", "cover_image_url", "status", "is_featured", "location", "project_date", "demo_label", "updated_at"].map(name => ({ name })) as T[] };
          }
          return { success: true, results: [] as T[] };
        },
      };
    },
    async batch(batchStatements: unknown[]) {
      batchCalls += 1;
      return batchStatements.map(() => ({ success: true, meta: { changes: 1 } }));
    },
  };

  const response = await worker.fetch(new Request("https://example.test/api/admin/projects/save", {
    method: "POST",
    headers: { "content-type": "application/json", Cookie: "__Host-gf_admin=valid-session" },
    body: JSON.stringify({
      slug: "wedding-day-2026",
      categorySlug: "wedding-photography",
      titleEn: "Wedding Day",
      titleHi: "शादी का दिन",
      descriptionEn: "Wedding portfolio",
      descriptionHi: "शादी का पोर्टफोलियो",
      coverImageUrl: "https://images.example.test/wedding.jpg",
      status: "draft",
      isFeatured: false,
    }),
  }), { DB: db });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, id: projectId, slug: "wedding-day-2026", status: "draft" });
  assert.equal(batchCalls, 1, "all four database writes must share one D1 transaction");
  assert.equal(statements.filter(query => query.includes("INSERT INTO project_translations")).length, 2);
  assert.equal(statements.filter(query => query.includes("INSERT INTO audit_logs")).length, 1);
  assert.ok(statements.some(query => query.includes("INSERT INTO projects")));
});
