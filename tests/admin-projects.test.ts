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
  const body = await response.json() as { ok: boolean; id: string; slug: string; status: string };
  assert.deepEqual({ ...body, id: undefined }, { ok: true, id: undefined, slug: "wedding-day-2026", status: "draft" });
  assert.match(body.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.equal(batchCalls, 1, "all four database writes must share one D1 transaction");
  assert.equal(statements.filter(query => query.includes("INSERT INTO project_translations")).length, 2);
  assert.equal(statements.filter(query => query.includes("INSERT INTO audit_logs")).length, 1);
  assert.ok(statements.some(query => query.includes("INSERT INTO projects")));
});

function ownerDb(options: { categoryExists?: boolean; batchFails?: boolean } = {}) {
  const statements: string[] = [];
  let batchCalls = 0;
  return {
    statements,
    get batchCalls() { return batchCalls; },
    prepare(query: string) {
      return {
        bind(..._args: unknown[]) { statements.push(query); return this; },
        async first<T>() {
          if (query.includes("JOIN admin_users u ON u.id = s.admin_user_id")) {
            return { id: "owner-1", email: "owner@example.test", role: "owner" } as T;
          }
          if (query.includes("SELECT id, status FROM projects WHERE slug")) return null as T | null;
          if (query.includes("SELECT id, slug FROM categories WHERE slug")) {
            return options.categoryExists === false ? null as T | null : { id: "category-1", slug: "wedding-photography" } as T;
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
      return batchStatements.map(() => ({ success: options.batchFails !== true, meta: { changes: options.batchFails ? 0 : 1 } }));
    },
  };
}

const validProjectPayload = {
  slug: "safe-project",
  categorySlug: "wedding-photography",
  titleEn: "Safe project",
  titleHi: "सुरक्षित प्रोजेक्ट",
  coverImageUrl: "https://images.example.test/cover.jpg",
  status: "draft",
};

test("project save rejects unsafe cover URLs and invalid slugs before any write batch", async () => {
  for (const patch of [
    { coverImageUrl: "http://images.example.test/cover.jpg" },
    { coverImageUrl: "https://127.0.0.1/private.jpg" },
    { coverImageUrl: "javascript:alert(1)" },
    { slug: "../private-project" },
  ]) {
    const db = ownerDb();
    const response = await worker.fetch(new Request("https://example.test/api/admin/projects/save", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: "__Host-gf_admin=valid-session" },
      body: JSON.stringify({ ...validProjectPayload, ...patch }),
    }), { DB: db });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "validation_failed" });
    assert.equal(db.batchCalls, 0, "invalid project data must not reach the write batch");
  }
});

test("project save rejects unknown categories without writing project data", async () => {
  const db = ownerDb({ categoryExists: false });
  const response = await worker.fetch(new Request("https://example.test/api/admin/projects/save", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: "__Host-gf_admin=valid-session" },
    body: JSON.stringify(validProjectPayload),
  }), { DB: db });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "invalid_category" });
  assert.equal(db.batchCalls, 0);
});

test("project save fails closed when the atomic D1 batch reports a failed statement", async () => {
  const db = ownerDb({ batchFails: true });
  const response = await worker.fetch(new Request("https://example.test/api/admin/projects/save", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: "__Host-gf_admin=valid-session" },
    body: JSON.stringify(validProjectPayload),
  }), { DB: db });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "project_save_unavailable" });
  assert.equal(db.batchCalls, 1);
});

