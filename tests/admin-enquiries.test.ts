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

function authenticatedEnquiryDb() {
  const queries: Array<{ sql: string; args: unknown[] }> = [];
  const db = {
    queries,
    prepare(sql: string) {
      let args: unknown[] = [];
      return {
        bind(...values: unknown[]) { args = values; return this; },
        async first<T>() {
          if (sql.includes("SELECT u.id, u.email, u.role FROM admin_sessions")) {
            return { id: "owner-id", email: "owner@example.test", role: "owner" } as T;
          }
          if (sql.includes("SELECT sql FROM sqlite_master")) {
            return { sql: "CREATE TABLE enquiries (status TEXT CHECK(status IN ('new','read','archived')))" } as T;
          }
          return null as T | null;
        },
        async all<T>() {
          queries.push({ sql, args });
          if (sql.includes("PRAGMA table_info(enquiries)")) {
            return { success: true, results: ["id", "name", "email", "phone", "service", "preferred_date", "budget_range", "message", "status", "created_at", "updated_at"].map(name => ({ name })) as T[] };
          }
          if (sql.includes("SELECT status, COUNT(*) AS count FROM enquiries")) {
            return { success: true, results: [{ status: "new", count: 2 }] as T[] };
          }
          if (sql.includes("SELECT id, name, email, phone, service")) {
            return { success: true, results: [{ id: "enquiry-1", name: "Test Customer", status: "new" }] as T[] };
          }
          return { success: true, results: [] as T[] };
        },
        async run() {
          queries.push({ sql, args });
          return { success: true, meta: { changes: sql.includes("UPDATE enquiries SET status") ? 0 : 1 } };
        },
      };
    },
  };
  return db;
}

test("authenticated enquiry inbox validates pagination before querying enquiry data", async () => {
  const db = authenticatedEnquiryDb();
  const response = await worker.fetch(new Request("https://example.test/api/admin/enquiries?limit=101", {
    headers: { cookie: "__Host-gf_admin=valid-test-session" },
  }), { DB: db });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "invalid_pagination" });
  assert.equal(db.queries.some(entry => entry.sql.includes("SELECT id, name, email, phone, service")), false);
});

test("authenticated enquiry inbox applies status filter and bounded pagination", async () => {
  const db = authenticatedEnquiryDb();
  const response = await worker.fetch(new Request("https://example.test/api/admin/enquiries?status=new&limit=20&offset=5", {
    headers: { cookie: "__Host-gf_admin=valid-test-session" },
  }), { DB: db });
  assert.equal(response.status, 200);
  const body = await response.json() as { enquiries: Array<{ id: string }>; counts: Array<{ count: number }>; limit: number; offset: number };
  assert.equal(body.enquiries[0].id, "enquiry-1");
  assert.equal(body.counts[0].count, 2);
  assert.equal(body.limit, 20);
  assert.equal(body.offset, 5);
  const listing = db.queries.find(entry => entry.sql.includes("SELECT id, name, email, phone, service"));
  assert.ok(listing);
  assert.deepEqual(listing.args, ["new", 20, 5]);
});

test("enquiry status update rejects unsupported status without writing", async () => {
  const db = authenticatedEnquiryDb();
  const response = await worker.fetch(new Request("https://example.test/api/admin/enquiries/status", {
    method: "POST",
    headers: { cookie: "__Host-gf_admin=valid-test-session", "content-type": "application/json" },
    body: JSON.stringify({ id: "enquiry-1", status: "deleted" }),
  }), { DB: db });
  assert.equal(response.status, 400);
  assert.equal(db.queries.some(entry => entry.sql.includes("UPDATE enquiries SET status")), false);
});

