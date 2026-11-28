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

function ownerDb(targetRole: "owner" | "editor" | null = null) {
  const writes: Array<{ query: string; values: unknown[] }> = [];
  const ownerUsers = [{ id: "owner-1", email: "owner@example.test", role: "owner", is_active: 1 }];
  return {
    writes,
    prepare(query: string) {
      let values: unknown[] = [];
      return {
        bind(...args: unknown[]) { values = args; return this; },
        async first<T>() {
          if (query.includes("INSERT INTO auth_rate_limits")) return { request_count: 1 } as T;
          if (query.includes("FROM admin_sessions s JOIN admin_users u")) {
            return { id: "owner-1", email: "owner@example.test", role: "owner" } as T;
          }
          if (query.includes("SELECT id, role FROM admin_users")) {
            return targetRole ? { id: "target-1", role: targetRole } as T : null;
          }
          return null as T | null;
        },
        async run() {
          writes.push({ query, values });
          return { success: true, meta: { changes: 1 } };
        },
        async all<T>() {
          if (query.includes("SELECT id, email, role, is_active")) return { success: true, results: ownerUsers as T[] };
          return { success: true, results: [] as T[] };
        }
      };
    }
  };
}

function ownerRequest(path: string, body?: unknown) {
  return new Request("https://example.test" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      cookie: "__Host-gf_admin=unit-test-owner-session",
      ...(body === undefined ? {} : { "content-type": "application/json" })
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
}

test("admin user listing requires a verified owner session", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/admin/users"), { DB: mockDb() });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "unauthorized" });
});

test("creating an editor account requires a verified owner session", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/admin/users/create", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "editor@example.test", password: "a-secure-temporary-password" })
  }), { DB: mockDb() });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "unauthorized" });
});

test("disabling an editor account requires a verified owner session", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/admin/users/disable", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "editor-1" })
  }), { DB: mockDb() });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "unauthorized" });
});

test("owner can list admin users without exposing password material", async () => {
  const db = ownerDb();
  const response = await worker.fetch(ownerRequest("/api/admin/users"), { DB: db });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    users: [{ id: "owner-1", email: "owner@example.test", role: "owner", is_active: 1 }]
  });
});

test("owner editor creation validates input before inserting an account", async () => {
  const db = ownerDb();
  const response = await worker.fetch(ownerRequest("/api/admin/users/create", {
    email: "not-an-email",
    password: "too-short"
  }), { DB: db });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "validation_failed",
    requirements: "Use a valid email and a 14–128 character password."
  });
  assert.equal(db.writes.some(write => write.query.includes("INSERT INTO admin_users")), false);
  assert.equal(db.writes.some(write => write.query.includes("INSERT INTO audit_logs")), false);
});

test("owner can create an editor with a normalized email, salted password hash, and audit event", async () => {
  const db = ownerDb();
  const password = "a-secure-temporary-password";
  const response = await worker.fetch(ownerRequest("/api/admin/users/create", {
    email: "  EDITOR@EXAMPLE.TEST ",
    password
  }), { DB: db });

  assert.equal(response.status, 201);
  const payload = await response.json() as { ok: boolean; user: { id: string; email: string; role: string } };
  assert.equal(payload.ok, true);
  assert.equal(payload.user.email, "editor@example.test");
  assert.equal(payload.user.role, "editor");

  const insert = db.writes.find(write => write.query.includes("INSERT INTO admin_users"));
  const audit = db.writes.find(write => write.query.includes("admin_editor_created"));
  assert.ok(insert);
  assert.ok(audit);
  assert.equal(insert.values[1], "editor@example.test");
  assert.notEqual(insert.values[2], password);
  assert.ok(typeof insert.values[2] === "string" && insert.values[2].length > 20);
  assert.ok(typeof insert.values[3] === "string" && insert.values[3].length >= 20);
  assert.equal(insert.values.includes(password), false);
  assert.equal(audit.values[1], "owner-1");
  assert.equal(audit.values[2], payload.user.id);
});

test("owner cannot disable another owner account", async () => {
  const db = ownerDb("owner");
  const response = await worker.fetch(ownerRequest("/api/admin/users/disable", { id: "target-1" }), { DB: db });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "owner_cannot_be_disabled" });
  assert.equal(db.writes.length, 0);
});

test("owner disabling an editor revokes sessions and records an audit event", async () => {
  const db = ownerDb("editor");
  const response = await worker.fetch(ownerRequest("/api/admin/users/disable", { id: "target-1" }), { DB: db });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, id: "target-1", is_active: false });

  assert.equal(db.writes.length, 3);
  assert.match(db.writes[0].query, /UPDATE admin_users SET is_active = 0 WHERE id = \?/);
  assert.deepEqual(db.writes[0].values, ["target-1"]);
  assert.match(db.writes[1].query, /DELETE FROM admin_sessions WHERE admin_user_id = \?/);
  assert.deepEqual(db.writes[1].values, ["target-1"]);
  assert.match(db.writes[2].query, /admin_editor_disabled/);
  assert.equal(db.writes[2].values[1], "owner-1");
  assert.equal(db.writes[2].values[2], "target-1");
});
