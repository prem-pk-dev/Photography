import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/index.ts";

type StatementRecord = { query: string; values: unknown[] };

function authenticatedDb(role: "owner" | "editor" = "editor") {
  const writes: StatementRecord[] = [];
  const batches: StatementRecord[][] = [];
  return {
    writes,
    batches,
    prepare(query: string) {
      const statement: StatementRecord & {
        bind(...args: unknown[]): typeof statement;
        first<T>(): Promise<T | null>;
        run(): Promise<{ success: boolean; meta: { changes: number } }>;
      } = {
        query,
        values: [],
        bind(...args: unknown[]) {
          this.values = args;
          return this;
        },
        async first<T>() {
          if (query.includes("JOIN admin_users u ON u.id = s.admin_user_id")) {
            return { id: "admin-1", email: "editor@example.test", role } as T;
          }
          if (query.includes("SELECT id FROM project_media")) {
            return { id: "media-1" } as T;
          }
          if (query.includes("SELECT id FROM projects")) {
            return { id: "project-1" } as T;
          }
          return null as T | null;
        },
        async run() {
          writes.push({ query, values: [...this.values] });
          return { success: true, meta: { changes: 1 } };
        },
      };
      return statement;
    },
    async batch(statements: StatementRecord[]) {
      batches.push(statements.map(statement => ({ query: statement.query, values: [...statement.values] })));
      return statements.map(() => ({ success: true, meta: { changes: 1 } }));
    },
  };
}

function adminPost(path: string, body: unknown) {
  return new Request("https://example.test" + path, {
    method: "POST",
    headers: {
      cookie: "__Host-gf_admin=valid-unit-test-session",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

test("authenticated editor can update bilingual media alt text with an audit event", async () => {
  const db = authenticatedDb("editor");
  const response = await worker.fetch(adminPost("/api/admin/projects/media/alt-text", {
    id: "media-1",
    altEn: "A bride standing beside a floral wedding stage",
    altHi: "फूलों से सजे विवाह मंच के पास खड़ी दुल्हन",
  }), { DB: db });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, id: "media-1" });
  assert.equal(db.batches.length, 1);
  assert.equal(db.batches[0].length, 2);
  assert.match(db.batches[0][0].query, /UPDATE project_media SET alt_en = \?, alt_hi = \? WHERE id = \?/);
  assert.deepEqual(db.batches[0][0].values, [
    "A bride standing beside a floral wedding stage",
    "फूलों से सजे विवाह मंच के पास खड़ी दुल्हन",
    "media-1",
  ]);
  assert.match(db.batches[0][1].query, /media_alt_text_updated/);
  assert.deepEqual(db.batches[0][1].values.slice(1), ["admin-1", "media-1"]);
});

test("authenticated editor can add a safe external media URL as a private draft", async () => {
  const db = authenticatedDb("editor");
  const response = await worker.fetch(adminPost("/api/admin/projects/media", {
    projectId: "project-1",
    mediaType: "image",
    previewUrl: "https://cdn.example.test/portfolio/wedding.jpg",
    altEn: "Wedding portrait",
    altHi: "विवाह चित्र",
    sortOrder: 4,
    isPublic: false,
  }), { DB: db });

  assert.equal(response.status, 201);
  const payload = await response.json() as { ok: boolean; id: string; isPublic: boolean };
  assert.equal(payload.ok, true);
  assert.equal(payload.isPublic, false);
  assert.match(payload.id, /^[0-9a-f-]{36}$/i);
  const insert = db.writes.find(write => write.query.includes("INSERT INTO project_media"));
  const audit = db.writes.find(write => write.query.includes("INSERT INTO audit_logs"));
  assert.ok(insert);
  assert.ok(audit);
  assert.deepEqual(insert.values.slice(1), [
    "project-1",
    "image",
    "https://cdn.example.test/portfolio/wedding.jpg",
    null,
    "Wedding portrait",
    "विवाह चित्र",
    4,
    0,
  ]);
  assert.equal(audit.values[1], "admin-1");
  assert.equal(audit.values[2], "media_added_draft");
  assert.equal(audit.values[3], payload.id);
});

test("external media rejects localhost URLs before any project or media write", async () => {
  const db = authenticatedDb("editor");
  const response = await worker.fetch(adminPost("/api/admin/projects/media", {
    projectId: "project-1",
    mediaType: "image",
    previewUrl: "https://localhost/private/photo.jpg",
  }), { DB: db });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "validation_failed" });
  assert.equal(db.writes.length, 0);
  assert.equal(db.batches.length, 0);
});
