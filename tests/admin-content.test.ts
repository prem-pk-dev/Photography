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

test("public content API returns an explicit error if the database is unavailable", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/content?page=home"), {});
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "database_not_configured" });
});

test("admin content list requires a verified session", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/admin/content"), { DB: mockDb() });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "unauthorized" });
});

test("saving homepage content requires a verified session", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/admin/content/save", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ page: "home", content: { heroTitleEn: "A new title" } })
  }), { DB: mockDb() });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "unauthorized" });
});

test("publishing page content requires a verified session", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/admin/content/publish", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ page: "home" })
  }), { DB: mockDb() });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "unauthorized" });
});

test("draft preview endpoint requires a verified admin session", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/admin/content/preview?page=home"), { DB: mockDb() });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "unauthorized" });
});

test("content revision history requires a verified admin session", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/admin/content/revisions?page=home"), { DB: mockDb() });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "unauthorized" });
});

test("restoring a content revision requires a verified admin session", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/admin/content/restore", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ revisionId: "revision-1" })
  }), { DB: mockDb() });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "unauthorized" });
});

function authenticatedContentDb(role: "owner" | "editor", revision?: { id: string; page_slug: string; content_json: string }) {
  const writes: Array<{ query: string; values: unknown[] }> = [];
  const reads: string[] = [];
  return {
    writes,
    reads,
    prepare(query: string) {
      let values: unknown[] = [];
      return {
        bind(...args: unknown[]) { values = args; return this; },
        async first<T>() {
          reads.push(query);
          if (query.includes("SELECT u.id, u.email, u.role FROM admin_sessions")) {
            return { id: role + "-1", email: role + "@example.test", role } as T;
          }
          if (query.includes("SELECT id, page_slug, content_json FROM site_content_revisions")) {
            return (revision ?? null) as T | null;
          }
          return null as T | null;
        },
        async run() {
          writes.push({ query, values });
          return { success: true, meta: { changes: 1 } };
        },
        async all<T>() { return { success: true, results: [] as T[] }; }
      };
    }
  };
}

function authenticatedContentRequest(path: string, body: unknown) {
  return new Request("https://example.test" + path, {
    method: "POST",
    headers: {
      cookie: "__Host-gf_admin=unit-test-session",
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

test("authenticated editor can save a validated CMS draft and records revision plus audit event", async () => {
  const db = authenticatedContentDb("editor");
  const response = await worker.fetch(authenticatedContentRequest("/api/admin/content/save", {
    page: "home",
    content: { heroTitleEn: "  A new title  ", heroTitleHi: "नया शीर्षक" }
  }), { DB: db });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, page: "home", status: "draft" });
  assert.equal(db.writes.length, 3);
  assert.match(db.writes[0].query, /INSERT INTO site_content/);
  assert.deepEqual(db.writes[0].values.slice(0, 2), [
    "home",
    JSON.stringify({ heroTitleEn: "A new title", heroTitleHi: "नया शीर्षक" })
  ]);
  assert.match(db.writes[1].query, /INSERT INTO site_content_revisions/);
  assert.match(db.writes[1].query, /'draft'/);
  assert.match(db.writes[2].query, /INSERT INTO audit_logs/);
  assert.match(db.writes[2].query, /'content_saved_draft'/);
});

test("CMS draft save rejects unknown fields and markup without writing content", async () => {
  for (const content of [
    { heroTitleEn: "Valid", unexpectedField: "Not allowed" },
    { heroTitleEn: "<script>alert(1)</script>" }
  ]) {
    const db = authenticatedContentDb("owner");
    const response = await worker.fetch(authenticatedContentRequest("/api/admin/content/save", {
      page: "home",
      content
    }), { DB: db });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: "validation_failed",
      allowedPages: ["home", "about", "services", "showreel", "contact"]
    });
    assert.equal(db.writes.length, 0);
  }
});

test("authenticated editor can restore a valid CMS revision as a draft without publishing it", async () => {
  const revision = {
    id: "revision-1",
    page_slug: "home",
    content_json: JSON.stringify({ heroTitleEn: "Restored title", heroTitleHi: "पुनर्स्थापित शीर्षक" })
  };
  const db = authenticatedContentDb("editor", revision);
  const response = await worker.fetch(authenticatedContentRequest("/api/admin/content/restore", {
    revisionId: "revision-1"
  }), { DB: db });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    page: "home",
    status: "draft",
    content: { heroTitleEn: "Restored title", heroTitleHi: "पुनर्स्थापित शीर्षक" }
  });
  assert.equal(db.writes.length, 3);
  assert.match(db.writes[0].query, /INSERT INTO site_content/);
  assert.match(db.writes[0].query, /'draft'/);
  assert.match(db.writes[1].query, /INSERT INTO site_content_revisions/);
  assert.match(db.writes[1].query, /'draft'/);
  assert.match(db.writes[2].query, /'content_restored_as_draft'/);
});

test("CMS revision restore rejects invalid stored JSON without creating a draft", async () => {
  const db = authenticatedContentDb("owner", {
    id: "revision-2",
    page_slug: "home",
    content_json: "{invalid-json"
  });
  const response = await worker.fetch(authenticatedContentRequest("/api/admin/content/restore", {
    revisionId: "revision-2"
  }), { DB: db });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "revision_invalid" });
  assert.equal(db.writes.length, 0);
});

