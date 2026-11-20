import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/index.ts";

const admin = { id: "admin-1", email: "owner@example.test", role: "owner" as const };

function makeDb() {
  const batches: number[] = [];
  return {
    batches,
    prepare(query: string) {
      return {
        bind(..._values: unknown[]) { return this; },
        async first<T>() {
          if (query.includes("SELECT u.id, u.email, u.role FROM admin_sessions")) return admin as T;
          if (query.includes("SELECT id, status FROM projects")) return { id: "project-1", status: "draft" } as T;
          if (query.includes("SELECT id FROM project_media WHERE id = ?")) return { id: "media-1" } as T;
          return null as T | null;
        },
        async run() { return { success: true, meta: { changes: 1 } }; },
        async all<T>() { return { success: true, results: [] as T[] }; },
      };
    },
    async batch(statements: unknown[]) {
      batches.push(statements.length);
      return statements.map(() => ({ success: true, meta: { changes: 1 } }));
    },
  };
}

function uploadRequest(bytes: number[], mime = "image/png") {
  const form = new FormData();
  form.set("projectId", "project-1");
  form.set("file", new File([Uint8Array.from(bytes)], "portfolio.png", { type: mime }));
  form.set("altEn", "Portfolio image");
  form.set("altHi", "पोर्टफोलियो चित्र");
  form.set("sortOrder", "0");
  form.set("isPublic", "false");
  form.set("isCover", "false");
  return new Request("https://example.test/api/admin/projects/media/upload", {
    method: "POST",
    headers: { cookie: "__Host-gf_admin=test-session" },
    body: form,
  });
}

test("GitHub media upload requires an authenticated admin", async () => {
  const response = await worker.fetch(
    new Request("https://example.test/api/admin/projects/media/upload", { method: "POST" }),
    { DB: makeDb(), MEDIA_GITHUB_TOKEN: "test-token" },
  );
  assert.equal(response.status, 401);
});

test("GitHub media upload rejects invalid file signatures before external writes", async () => {
  const originalFetch = globalThis.fetch;
  let externalCalls = 0;
  globalThis.fetch = async () => {
    externalCalls += 1;
    return new Response("unexpected", { status: 500 });
  };
  try {
    const response = await worker.fetch(uploadRequest([0, 1, 2, 3, 4, 5, 6, 7]), {
      DB: makeDb(),
      MEDIA_GITHUB_TOKEN: "test-token",
    });
    assert.equal(response.status, 415);
    assert.deepEqual(await response.json(), { error: "file_signature_mismatch" });
    assert.equal(externalCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("GitHub media upload writes the validated file and stores its immutable raw URL", async () => {
  const originalFetch = globalThis.fetch;
  const db = makeDb();
  let uploadedUrl = "";
  let uploadedBody: Record<string, unknown> | undefined;
  let authorization = "";
  globalThis.fetch = async (input, init) => {
    uploadedUrl = String(input);
    authorization = new Headers(init?.headers).get("authorization") ?? "";
    uploadedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({
      content: { sha: "blob-sha" },
      commit: { sha: "commit-sha" },
    }), { status: 201, headers: { "content-type": "application/json" } });
  };
  try {
    const response = await worker.fetch(
      uploadRequest([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]),
      { DB: db, MEDIA_GITHUB_TOKEN: "test-token" },
    );
    assert.equal(response.status, 201);
    const result = await response.json() as { previewUrl: string; isPublic: boolean; mediaType: string };
    assert.match(uploadedUrl, /^https:\/\/api\.github\.com\/repos\/prem-pk-dev\/PHOTOGRAPHY-MEDIA\/contents\/projects\/project-1\//);
    assert.equal(authorization, "Bearer test-token");
    assert.equal(uploadedBody?.branch, "main");
    assert.equal(typeof uploadedBody?.content, "string");
    assert.match(result.previewUrl, /^https:\/\/raw\.githubusercontent\.com\/prem-pk-dev\/PHOTOGRAPHY-MEDIA\/commit-sha\/projects\/project-1\//);
    assert.equal(result.isPublic, false);
    assert.equal(result.mediaType, "image");
    assert.deepEqual(db.batches, [2]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("GitHub media upload retries a transient branch ref conflict", async () => {
  const originalFetch = globalThis.fetch;
  const db = makeDb();
  let attempts = 0;
  globalThis.fetch = async (_input, init) => {
    attempts += 1;
    assert.equal(new Headers(init?.headers).get("user-agent"), "Photography-Media-Uploader/1.0");
    if (attempts === 1) {
      return new Response(JSON.stringify({
        message: "Reference update failed: is at newer-sha but expected older-sha",
      }), { status: 409, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({
      content: { sha: "blob-sha" },
      commit: { sha: "commit-sha" },
    }), { status: 201, headers: { "content-type": "application/json" } });
  };
  try {
    const response = await worker.fetch(
      uploadRequest([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]),
      { DB: db, MEDIA_GITHUB_TOKEN: "test-token" },
    );
    assert.equal(response.status, 201);
    assert.equal(attempts, 2);
    assert.deepEqual(db.batches, [2]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


function projectSaveDb(hasLanguageColumn: boolean, hasLegacyProjectColumns: boolean) {
  const translationQueries: string[] = [];
  const projectInsertQueries: string[] = [];
  const projectId = "11111111-1111-4111-8111-111111111111";
  return {
    translationQueries,
    projectInsertQueries,
    prepare(query: string) {
      return {
        bind(..._values: unknown[]) { return this; },
        async first<T>() {
          if (query.includes("SELECT u.id, u.email, u.role FROM admin_sessions")) return admin as T;
          if (query.includes("SELECT id, status FROM projects")) return null as T | null;
          if (query.includes("SELECT slug FROM categories")) return { slug: "wedding-photography" } as T;
          if (query.includes("INSERT INTO projects")) {
            projectInsertQueries.push(query);
            return { id: projectId } as T;
          }
          return null as T | null;
        },
        async all<T>() {
          if (query.includes("PRAGMA table_info(project_translations)")) {
            const columns = ["project_id", "locale", "title", "description"];
            if (hasLanguageColumn) columns.push("language");
            return { success: true, results: columns.map((name) => ({ name })) as T[] };
          }
          if (query.includes("PRAGMA table_info(projects)")) {
            const columns = ["id", "slug", "category_slug", "cover_image_url", "status", "is_featured", "location", "project_date", "demo_label", "updated_at"];
            if (hasLegacyProjectColumns) columns.push("category_id", "cover_object_key");
            return { success: true, results: columns.map((name) => ({ name })) as T[] };
          }
          return { success: true, results: [] as T[] };
        },
        async run() {
          if (query.includes("INSERT INTO project_translations")) translationQueries.push(query);
          return { success: true, meta: { changes: 1 } };
        },
      };
    },
  };
}

async function saveProject(db: ReturnType<typeof projectSaveDb>) {
  const response = await worker.fetch(new Request("https://example.test/api/admin/projects/save", {
    method: "POST",
    headers: {
      cookie: "__Host-gf_admin=test-session",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      slug: "jaipur-wedding-2026",
      categorySlug: "wedding-photography",
      titleEn: "Jaipur Wedding",
      titleHi: "जयपुर वेडिंग",
      descriptionEn: "",
      descriptionHi: "",
      coverImageUrl: "/api/media/projects/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.jpg",
      status: "draft",
    }),
  }), { DB: db });
  return response;
}

test("project save supports legacy D1 required project columns and language translations", async () => {
  const db = projectSaveDb(true, true);
  const response = await saveProject(db);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    id: "11111111-1111-4111-8111-111111111111",
    slug: "jaipur-wedding-2026",
    status: "draft",
  });
  assert.equal(db.translationQueries.length, 2);
  assert.ok(db.translationQueries.every((query) => query.includes("language")));
  assert.match(db.projectInsertQueries[0], /category_id/);
  assert.match(db.projectInsertQueries[0], /cover_object_key/);
});

test("project save supports the modern D1 schema without legacy project columns", async () => {
  const db = projectSaveDb(false, false);
  const response = await saveProject(db);
  assert.equal(response.status, 200);
  assert.equal(db.translationQueries.length, 2);
  assert.ok(db.translationQueries.every((query) => !query.includes("language")));
  assert.doesNotMatch(db.projectInsertQueries[0], /category_id|cover_object_key/);
});


test("media alt text update requires an authenticated admin and updates both locales", async () => {
  const db = makeDb();
  const response = await worker.fetch(new Request("https://example.test/api/admin/projects/media/alt-text", {
    method: "POST",
    headers: { cookie: "__Host-gf_admin=test-session", "content-type": "application/json" },
    body: JSON.stringify({ id: "media-1", altEn: "Wedding celebration", altHi: "शादी का समारोह" }),
  }), { DB: db });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, id: "media-1" });
  assert.deepEqual(db.batches, [2]);
});

test("media alt text update rejects unauthenticated requests", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/admin/projects/media/alt-text", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "media-1", altEn: "Wedding", altHi: "शादी" }),
  }), { DB: makeDb() });
  assert.equal(response.status, 401);
});


function deleteMediaDb(record: { project_id: string; preview_url: string; original_key: string | null; cover_image_url: string }, role: "owner" | "editor" = "owner") {
  const batchQueries: string[] = [];
  return {
    batchQueries,
    prepare(query: string) {
      return {
        bind(..._values: unknown[]) { return this; },
        async first<T>() {
          if (query.includes("SELECT u.id, u.email, u.role FROM admin_sessions")) return { ...admin, role } as T;
          if (query.includes("SELECT m.project_id, m.preview_url, m.original_key, p.cover_image_url")) return record as T;
          return null as T | null;
        },
      };
    },
    async batch(_statements: unknown[]) {
      batchQueries.push("2");
      return [{ success: true, meta: { changes: 1 } }, { success: true, meta: { changes: 1 } }];
    },
  };
}

const deleteProjectId = "11111111-1111-4111-8111-111111111111";
const deleteMediaId = "22222222-2222-4222-8222-222222222222";
const deleteKey = "projects/" + deleteProjectId + "/" + deleteMediaId + ".jpg";
const deleteRecord = {
  project_id: deleteProjectId,
  preview_url: "https://raw.githubusercontent.com/prem-pk-dev/PHOTOGRAPHY-MEDIA/commit-sha/" + deleteKey,
  original_key: deleteKey,
  cover_image_url: "https://example.test/another-cover.jpg",
};

function deleteRequest() {
  return new Request("https://example.test/api/admin/projects/media/delete", {
    method: "POST",
    headers: { cookie: "__Host-gf_admin=test-session", "content-type": "application/json" },
    body: JSON.stringify({ id: deleteMediaId }),
  });
}

test("permanent media deletion requires an authenticated owner", async () => {
  const unauthenticated = await worker.fetch(new Request("https://example.test/api/admin/projects/media/delete", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: deleteMediaId }),
  }), { DB: deleteMediaDb(deleteRecord), MEDIA_GITHUB_TOKEN: "test-token" });
  assert.equal(unauthenticated.status, 401);
  const forbidden = await worker.fetch(deleteRequest(), {
    DB: deleteMediaDb(deleteRecord, "editor"), MEDIA_GITHUB_TOKEN: "test-token",
  });
  assert.equal(forbidden.status, 403);
});

test("permanent media deletion refuses project covers and legacy URL media before GitHub calls", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return new Response("unexpected", { status: 500 }); };
  try {
    const cover = await worker.fetch(deleteRequest(), {
      DB: deleteMediaDb({ ...deleteRecord, cover_image_url: deleteRecord.preview_url }),
      MEDIA_GITHUB_TOKEN: "test-token",
    });
    assert.equal(cover.status, 409);
    const legacy = await worker.fetch(deleteRequest(), {
      DB: deleteMediaDb({ ...deleteRecord, original_key: null, preview_url: "https://media-assets.example.test/legacy.jpg" }),
      MEDIA_GITHUB_TOKEN: "test-token",
    });
    assert.equal(legacy.status, 409);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("permanent media deletion removes the exact GitHub object then D1 metadata", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; method: string; authorization: string }> = [];
  const db = deleteMediaDb(deleteRecord);
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), method: init?.method || "GET", authorization: new Headers(init?.headers).get("authorization") || "" });
    if (init?.method === "DELETE") return new Response(JSON.stringify({ commit: { sha: "deleted-commit" } }), { status: 200 });
    return new Response(JSON.stringify({ sha: "blob-sha" }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const response = await worker.fetch(deleteRequest(), { DB: db, MEDIA_GITHUB_TOKEN: "test-token" });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, id: deleteMediaId, deletedFromRepository: true });
    assert.deepEqual(calls.map((call) => call.method), ["GET", "DELETE"]);
    assert.ok(calls.every((call) => call.url.endsWith(deleteKey.split("/").map(encodeURIComponent).join("/"))));
    assert.ok(calls.every((call) => call.authorization === "Bearer test-token"));
    assert.deepEqual(db.batchQueries, ["2"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("permanent media deletion can finish D1 cleanup after a previous GitHub deletion", async () => {
  const originalFetch = globalThis.fetch;
  const db = deleteMediaDb(deleteRecord);
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return new Response("not found", { status: 404 }); };
  try {
    const response = await worker.fetch(deleteRequest(), { DB: db, MEDIA_GITHUB_TOKEN: "test-token" });
    assert.equal(response.status, 200);
    assert.equal(calls, 1);
    assert.deepEqual(db.batchQueries, ["2"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("permanent media deletion retains D1 metadata when GitHub refuses deletion", async () => {
  const originalFetch = globalThis.fetch;
  const db = deleteMediaDb(deleteRecord);
  globalThis.fetch = async (_input, init) => init?.method === "DELETE"
    ? new Response("conflict", { status: 409 })
    : new Response(JSON.stringify({ sha: "blob-sha" }), { status: 200 });
  try {
    const response = await worker.fetch(deleteRequest(), { DB: db, MEDIA_GITHUB_TOKEN: "test-token" });
    assert.equal(response.status, 503);
    assert.deepEqual(db.batchQueries, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
