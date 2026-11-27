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

function mockDbWithAvailableAuthRateLimit() {
  return {
    prepare(query: string) {
      return {
        bind(..._args: unknown[]) { return this; },
        async first<T>() {
          if (query.includes("INSERT INTO auth_rate_limits")) {
            return { request_count: 1 } as T;
          }
          return null as T | null;
        },
        async run() { return { success: true, meta: { changes: 0 } }; },
        async all<T>() { return { success: true, results: [] as T[] }; }
      };
    }
  };
}


function mockDbWithBlockedAuthRateLimit() {
  const queries: string[] = [];
  return {
    queries,
    prepare(query: string) {
      return {
        bind(..._args: unknown[]) { queries.push(query); return this; },
        async first<T>() {
          if (query.includes("INSERT INTO auth_rate_limits")) {
            return { request_count: 11 } as T;
          }
          return null as T | null;
        },
        async run() { return { success: true, meta: { changes: 0 } }; },
        async all<T>() { return { success: true, results: [] as T[] }; }
      };
    }
  };
}

function mockDbWithAuthenticatedSession() {
  const queries: string[] = [];
  return {
    queries,
    prepare(query: string) {
      return {
        bind(..._args: unknown[]) { queries.push(query); return this; },
        async first<T>() {
          if (query.includes("JOIN admin_users u ON u.id = s.admin_user_id")) {
            return { id: "admin-1", email: "owner@example.test", role: "owner" } as T;
          }
          return null as T | null;
        },
        async run() { return { success: true, meta: { changes: 1 } }; },
        async all<T>() { return { success: true, results: [] as T[] }; }
      };
    }
  };
}

function mockDbWithSetupValidation() {
  let batchCalls = 0;
  const queries: string[] = [];
  return {
    queries,
    get batchCalls() { return batchCalls; },
    prepare(query: string) {
      return {
        bind(..._args: unknown[]) { queries.push(query); return this; },
        async first<T>() {
          if (query.includes("INSERT INTO auth_rate_limits")) return { request_count: 1 } as T;
          return null as T | null;
        },
        async run() { return { success: true, meta: { changes: 0 } }; },
        async all<T>() { return { success: true, results: [] as T[] }; }
      };
    },
    async batch(_statements: unknown[]) { batchCalls += 1; return []; }
  };
}

function mockDbWithOwnerSetupBatch(insertChanges = 1) {
  const statements: string[] = [];
  return {
    statements,
    prepare(query: string) {
      return {
        bind(..._args: unknown[]) { statements.push(query); return this; },
        async first<T>() {
          if (query.includes("INSERT INTO auth_rate_limits")) return { request_count: 1 } as T;
          return null as T | null;
        },
        async run() { return { success: true, meta: { changes: 0 } }; },
        async all<T>() { return { success: true, results: [] as T[] }; }
      };
    },
    async batch(_batchStatements: unknown[]) {
      return [
        { success: true, meta: { changes: insertChanges } },
        { success: true, meta: { changes: insertChanges } },
        { success: true, meta: { changes: insertChanges } }
      ];
    }
  };
}

test("admin setup is unavailable until a server-side setup secret is configured", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/admin/setup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "owner@example.test", password: "long-secure-password-123" })
  }), { DB: mockDb() });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "admin_setup_not_configured" });
});

test("admin setup rejects a wrong server-side setup secret before parsing owner data", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/admin/setup", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-admin-setup-secret": "incorrect-secret"
    },
    body: JSON.stringify({ email: "owner@example.test", password: "long-secure-password-123" })
  }), { DB: mockDbWithAvailableAuthRateLimit(), ADMIN_SETUP_SECRET: "expected-secret" });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "setup_not_authorized" });
});

test("admin session endpoint never authenticates without a valid server-side session", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/admin/session"), { DB: mockDb() });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { authenticated: false });
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("admin session returns the verified admin for a valid session cookie", async () => {
  const db = mockDbWithAuthenticatedSession();
  const response = await worker.fetch(new Request("https://example.test/api/admin/session", {
    headers: { cookie: "__Host-gf_admin=sample-session-token" }
  }), { DB: db });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    authenticated: true,
    admin: { id: "admin-1", email: "owner@example.test", role: "owner" }
  });
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.ok(db.queries.some(query => query.includes("JOIN admin_users u ON u.id = s.admin_user_id")));
});

test("admin login does not accept GET requests", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/admin/login"), { DB: mockDb() });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("Allow"), "POST");
});

test("admin login rate limit blocks attempts before querying credentials", async () => {
  const db = mockDbWithBlockedAuthRateLimit();
  const response = await worker.fetch(new Request("https://example.test/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "owner@example.test", password: "not-the-password" })
  }), { DB: db });

  assert.equal(response.status, 429);
  assert.deepEqual(await response.json(), { error: "temporarily_unavailable" });
  assert.ok(db.queries.some(query => query.includes("INSERT INTO auth_rate_limits")));
  assert.equal(db.queries.some(query => query.includes("FROM admin_users")), false);
  assert.equal(db.queries.some(query => query.includes("INSERT INTO admin_sessions")), false);
});

test("admin logout requires an authenticated session", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/admin/logout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}"
  }), { DB: mockDb() });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "unauthorized" });
});

test("authenticated admin logout revokes the session and expires the secure cookie", async () => {
  const db = mockDbWithAuthenticatedSession();
  const response = await worker.fetch(new Request("https://example.test/api/admin/logout", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: "__Host-gf_admin=sample-session-token"
    },
    body: "{}"
  }), { DB: db });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  const cookie = response.headers.get("set-cookie") ?? "";
  assert.match(cookie, /__Host-gf_admin=;/);
  assert.match(cookie, /Max-Age=0/);
  assert.match(cookie, /Path=\//);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.ok(db.queries.some(query => query.includes("DELETE FROM admin_sessions")));
  assert.ok(db.queries.some(query => query.includes("'logout'")));
});

test("admin CMS content is never exposed without an authenticated session", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/admin/content"), { DB: mockDb() });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "unauthorized" });
});

test("admin system status requires an authenticated session", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/admin/system-status"), { DB: mockDb() });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "unauthorized" });
});

test("public content endpoint rejects unknown page slugs", async () => {
  const response = await worker.fetch(new Request("https://example.test/api/content?page=admin"), { DB: mockDb() });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "invalid_page" });
});


test("initial owner setup rejects invalid email and short passwords before database writes", async () => {
  const invalidInputs = [
    { email: "not-an-email", password: "long-secure-password-123" },
    { email: "owner@example.test", password: "short" }
  ];

  for (const input of invalidInputs) {
    const db = mockDbWithSetupValidation();
    const response = await worker.fetch(new Request("https://example.test/api/admin/setup", {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-setup-secret": "expected-secret" },
      body: JSON.stringify(input)
    }), { DB: db, ADMIN_SETUP_SECRET: "expected-secret" });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: "validation_failed",
      requirements: "Use a valid email and a 14–128 character password."
    });
    assert.equal(db.batchCalls, 0);
    assert.equal(db.queries.some(query => query.includes("INSERT INTO admin_users")), false);
  }
});

test("initial owner setup fails closed when transactional D1 batch is unavailable", async () => {
  const db = mockDbWithAvailableAuthRateLimit();
  const response = await worker.fetch(new Request("https://example.test/api/admin/setup", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-admin-setup-secret": "expected-secret"
    },
    body: JSON.stringify({ email: "owner@example.test", password: "long-secure-password-123" })
  }), { DB: db, ADMIN_SETUP_SECRET: "expected-secret" });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "admin_setup_unavailable" });
});

test("initial owner setup explicitly grants owner only when no admin exists and setup is incomplete", async () => {
  const db = mockDbWithOwnerSetupBatch(1);
  const response = await worker.fetch(new Request("https://example.test/api/admin/setup", {
    method: "POST",
    headers: { "content-type": "application/json", "x-admin-setup-secret": "expected-secret" },
    body: JSON.stringify({ email: "owner@example.test", password: "long-secure-password-123" })
  }), { DB: db, ADMIN_SETUP_SECRET: "expected-secret" });
  assert.equal(response.status, 201);
  const setupInsert = db.statements.find(query => query.includes("INSERT INTO admin_users"));
  assert.ok(setupInsert);
  assert.match(setupInsert, /'owner'/);
  assert.match(setupInsert, /NOT EXISTS \(SELECT 1 FROM admin_users\)/);
  assert.match(setupInsert, /completed_at IS NULL/);

  const setupCompletion = db.statements.find(query => query.includes("UPDATE admin_setup"));
  assert.ok(setupCompletion);
  assert.match(setupCompletion, /completed_at IS NULL/);
  assert.match(setupCompletion, /EXISTS \(SELECT 1 FROM admin_users WHERE id = \?\)/);

  const setupAudit = db.statements.find(query => query.includes("INSERT INTO audit_logs"));
  assert.ok(setupAudit);
  assert.match(setupAudit, /SELECT \?/);
  assert.match(setupAudit, /WHERE EXISTS \(SELECT 1 FROM admin_users WHERE id = \?\)/);
});

test("initial owner setup rejects when the guarded owner insert creates no row", async () => {
  const db = mockDbWithOwnerSetupBatch(0);
  const response = await worker.fetch(new Request("https://example.test/api/admin/setup", {
    method: "POST",
    headers: { "content-type": "application/json", "x-admin-setup-secret": "expected-secret" },
    body: JSON.stringify({ email: "owner@example.test", password: "long-secure-password-123" })
  }), { DB: db, ADMIN_SETUP_SECRET: "expected-secret" });
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: "initial_setup_already_completed" });
});


async function loginFixture(password: string) {
  const salt = Uint8Array.from({ length: 16 }, (_, index) => index + 1);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: 100_000 },
    key,
    256
  );
  const base64Url = (bytes: Uint8Array) =>
    btoa(String.fromCharCode(...bytes)).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/g, "");
  const statements: Array<{ query: string; values: unknown[] }> = [];
  const db = {
    statements,
    prepare(query: string) {
      const values: unknown[] = [];
      return {
        bind(...args: unknown[]) { values.push(...args); statements.push({ query, values }); return this; },
        async first<T>() {
          if (query.includes("INSERT INTO auth_rate_limits")) return { request_count: 1 } as T;
          if (query.includes("FROM admin_users WHERE email = ?")) {
            return {
              id: "owner-1",
              email: "owner@example.test",
              password_hash: base64Url(new Uint8Array(bits)),
              password_salt: base64Url(salt),
              role: "owner"
            } as T;
          }
          return null as T | null;
        },
        async run() { return { success: true, meta: { changes: 1 } }; },
        async all<T>() { return { success: true, results: [] as T[] }; }
      };
    }
  };
  return db;
}

test("admin login creates a hashed session and returns a secure owner cookie for valid credentials", async () => {
  const password = "correct-horse-battery-staple";
  const db = await loginFixture(password);
  const response = await worker.fetch(new Request("https://example.test/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": "192.0.2.10" },
    body: JSON.stringify({ email: "OWNER@example.test", password })
  }), { DB: db });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    admin: { id: "owner-1", email: "owner@example.test", role: "owner" }
  });
  const cookie = response.headers.get("set-cookie") ?? "";
  const token = cookie.match(/__Host-gf_admin=([^;]+)/)?.[1] ?? "";
  assert.ok(token.length >= 40);
  assert.match(cookie, /Path=\\//);
  assert.match(cookie, /Max-Age=28800/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);

  const sessionInsert = db.statements.find(item => item.query.includes("INSERT INTO admin_sessions"));
  assert.ok(sessionInsert);
  assert.notEqual(sessionInsert.values[2], token);
  const expectedTokenHash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const expectedHex = Array.from(new Uint8Array(expectedTokenHash), byte => byte.toString(16).padStart(2, "0")).join("");
  assert.equal(sessionInsert.values[2], expectedHex);
  assert.ok(db.statements.some(item => item.query.includes("UPDATE admin_users SET last_login_at")));
  assert.ok(db.statements.some(item => item.query.includes("'login_success'")));
  assert.equal(db.statements.some(item => item.values.includes(password)), false);
});

test("admin login rejects an incorrect password without creating a session or updating last login", async () => {
  const db = await loginFixture("correct-horse-battery-staple");
  const response = await worker.fetch(new Request("https://example.test/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": "192.0.2.11" },
    body: JSON.stringify({ email: "owner@example.test", password: "incorrect-password-value" })
  }), { DB: db });

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "invalid_credentials" });
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(db.statements.some(item => item.query.includes("INSERT INTO admin_sessions")), false);
  assert.equal(db.statements.some(item => item.query.includes("UPDATE admin_users SET last_login_at")), false);
  assert.ok(db.statements.some(item => item.query.includes("'login_failed'")));
  assert.equal(db.statements.some(item => item.query.includes("'login_success'")), false);
});
