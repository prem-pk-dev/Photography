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

function mockDbForEnquiryStatusUpdate(changes = 1) {
  const statements: Array<{ query: string; values: unknown[] }> = [];
  const db = {
    statements,
    prepare(query: string) {
      const values: unknown[] = [];
      return {
        bind(...args: unknown[]) { values.push(...args); statements.push({ query, values }); return this; },
        async first<T>() {
          if (query.includes("JOIN admin_users u ON u.id = s.admin_user_id")) {
            return { id: "owner-1", email: "owner@example.test", role: "owner" } as T;
          }
          if (query.includes("sqlite_master") && query.includes("name = 'enquiries'")) {
            return { sql: "CREATE TABLE enquiries (status TEXT CHECK(status IN ('new', 'read', 'archived')))" } as T;
          }
          return null as T | null;
        },
        async run() {
          return { success: true, meta: { changes: query.includes("UPDATE enquiries") ? changes : 1 } };
        },
        async all<T>() {
          if (query.includes("PRAGMA table_info(enquiries)")) {
            return { success: true, results: ["id", "status", "updated_at"].map(name => ({ name })) as T[] };
          }
          return { success: true, results: [] as T[] };
        }
      };
    }
  };
  return db;
}

test("private enquiry inbox rejects requests without an admin session", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/admin/enquiries"), { DB: mockDb() });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "unauthorized" });
});

test("enquiry status updates reject requests without an admin session", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/admin/enquiries/status", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "enquiry-1", status: "read" })
  }), { DB: mockDb() });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "unauthorized" });
});

test("enquiry inbox rejects unsupported HTTP methods", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/admin/enquiries", { method: "DELETE" }), { DB: mockDb() });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("Allow"), "GET, POST, OPTIONS");
});

test("authenticated admin status update records the matching enquiry audit event", async () => {
  const db = mockDbForEnquiryStatusUpdate();
  const response = await worker.fetch(new Request("https://example.test/api/admin/enquiries/status", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: "__Host-gf_admin=sample-session-token"
    },
    body: JSON.stringify({ id: "enquiry-1", status: "read" })
  }), { DB: db });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, id: "enquiry-1", status: "read" });

  const update = db.statements.find(statement => statement.query.includes("UPDATE enquiries SET status"));
  assert.ok(update);
  assert.deepEqual(update.values, ["read", "enquiry-1"]);

  const audit = db.statements.find(statement => statement.query.includes("INSERT INTO audit_logs"));
  assert.ok(audit);
  assert.match(audit.query, /'enquiry'/);
  assert.deepEqual(audit.values.slice(1), ["owner-1", "enquiry_status_read", "enquiry-1"]);
});

test("enquiry status update rejects unsupported statuses before writing", async () => {
  const db = mockDbForEnquiryStatusUpdate();
  const response = await worker.fetch(new Request("https://example.test/api/admin/enquiries/status", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: "__Host-gf_admin=sample-session-token"
    },
    body: JSON.stringify({ id: "enquiry-1", status: "deleted" })
  }), { DB: db });

  assert.equal(response.status, 400);
  assert.equal(db.statements.some(statement => statement.query.includes("UPDATE enquiries SET status")), false);
  assert.equal(db.statements.some(statement => statement.query.includes("INSERT INTO audit_logs")), false);
});
