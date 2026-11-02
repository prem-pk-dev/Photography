import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/index.ts";

test("customer auth routes reject unsupported methods", async () => {
  const cases = [
    ["https://example.test/api/customer/register", "GET", "POST"],
    ["https://example.test/api/customer/login", "GET", "POST"],
    ["https://example.test/api/customer/logout", "GET", "POST"],
    ["https://example.test/api/customer/session", "POST", "GET"],
    ["https://example.test/api/customer/session", "PUT", "GET, POST, OPTIONS"],
    ["https://example.test/api/customer/profile", "POST", "GET, PUT"],
  ] as const;

  for (const [url, method, allow] of cases) {
    const response = await worker.fetch(new Request(url, { method }), {});
    assert.equal(response.status, 405, `${method} ${new URL(url).pathname} should reject the method`);
    assert.equal(response.headers.get("Allow"), allow);
  }
});

test("customer auth fails closed when Preview D1 binding is missing", async () => {
  for (const path of [
    "/api/customer/register",
    "/api/customer/login",
    "/api/customer/session",
    "/api/customer/profile",
  ]) {
    const method = path.endsWith("/session") ? "GET" : path.endsWith("/profile") ? "GET" : "POST";
    const response = await worker.fetch(new Request("https://example.test" + path, { method }), {});
    assert.equal(response.status, 503, `${path} must fail closed without a database`);
    assert.deepEqual(await response.json(), { error: "database_not_configured" });
  }
});

test("customer logout is idempotent without a session and clears the cookie", async () => {
  const db = {
    prepare(_query: string) {
      return {
        bind(..._args: unknown[]) { return this; },
        async first<T>() { return null as T | null; },
        async run() { return { success: true, meta: { changes: 0 } }; },
        async all<T>() { return { success: true, results: [] as T[] }; },
      };
    },
  };
  const response = await worker.fetch(
    new Request("https://example.test/api/customer/logout", { method: "POST" }),
    { DB: db },
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.match(response.headers.get("set-cookie") ?? "", /Max-Age=0/);
});


test("customer registration accepts email addresses containing the letter s", async () => {
  const db = {
    prepare(_query: string) {
      return {
        bind(..._args: unknown[]) { return this; },
        async first<T>() { return { request_count: 1 } as T; },
        async run() { return { success: true, meta: { changes: 1 } }; },
        async all<T>() { return { success: true, results: [] as T[] }; },
      };
    },
  };
  const response = await worker.fetch(
    new Request("https://example.test/api/customer/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Sunil",
        email: "sunil@example.com",
        phone: "",
        password: "GoldenFilms!2026",
      }),
    }),
    { DB: db },
  );
  assert.equal(response.status, 201);
  const cookie = response.headers.get("set-cookie") ?? "";
  assert.match(cookie, /^__Host-gf_customer=/, "session cookie must use the __Host- prefix");
  assert.match(cookie, /Path=\//, "session cookie must be scoped to the site root");
  assert.match(cookie, /Secure/, "session cookie must only be sent over HTTPS");
  assert.match(cookie, /HttpOnly/, "session cookie must not be readable by browser JavaScript");
  assert.match(cookie, /SameSite=Lax/, "session cookie must use SameSite protection");
  assert.match(cookie, /Max-Age=\d+/, "session cookie must have a finite lifetime");
  const body = await response.json() as { customer: Record<string, unknown> };
  assert.equal("password_hash" in body.customer, false);
  assert.equal("password_salt" in body.customer, false);
  assert.equal("token" in body.customer, false);
});

test("customer session and profile endpoints reject requests without a valid session", async () => {
  const db = {
    prepare(_query: string) {
      return {
        bind(..._args: unknown[]) { return this; },
        async first<T>() { return null as T | null; },
        async run() { return { success: true, meta: { changes: 0 } }; },
        async all<T>() { return { success: true, results: [] as T[] }; },
      };
    },
  };

  const requests = [
    new Request("https://example.test/api/customer/session", { method: "GET" }),
    new Request("https://example.test/api/customer/profile", { method: "GET" }),
    new Request("https://example.test/api/customer/profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Unauthorized Update", phone: "123" }),
    }),
  ];

  for (const request of requests) {
    const response = await worker.fetch(request, { DB: db });
    assert.equal(response.status, 401, `${request.method} ${new URL(request.url).pathname} must require a session`);
    assert.deepEqual(await response.json(), { error: "unauthorized" });
  }
});

test("customer registration rejects weak passwords before creating an account", async () => {
  const executed: string[] = [];
  const db = {
    prepare(query: string) {
      return {
        bind(..._args: unknown[]) { return this; },
        async first<T>() {
          if (query.includes("auth_rate_limits")) return { request_count: 1 } as T;
          return null as T | null;
        },
        async run() {
          executed.push(query);
          return { success: true, meta: { changes: 1 } };
        },
        async all<T>() { return { success: true, results: [] as T[] }; },
      };
    },
  };

  const response = await worker.fetch(
    new Request("https://example.test/api/customer/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Test Customer",
        email: "customer@example.com",
        phone: "",
        password: "short",
      }),
    }),
    { DB: db },
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "validation_failed",
    requirements: "Use a name, valid email, and a 12–128 character password.",
  });
  assert.equal(executed.some((query) => query.includes("INSERT INTO customer_users")), false);
});

test("customer registration rejects malformed email addresses", async () => {
  const accountWrites: string[] = [];
  const db = {
    prepare(query: string) {
      return {
        bind(..._args: unknown[]) { return this; },
        async first<T>() {
          if (query.includes("auth_rate_limits")) return { request_count: 1 } as T;
          return null as T | null;
        },
        async run() {
          accountWrites.push(query);
          return { success: true, meta: { changes: 1 } };
        },
        async all<T>() { return { success: true, results: [] as T[] }; },
      };
    },
  };

  const response = await worker.fetch(
    new Request("https://example.test/api/customer/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Test Customer",
        email: "not-an-email",
        phone: "",
        password: "GoldenFilms!2026",
      }),
    }),
    { DB: db },
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "validation_failed",
    requirements: "Use a name, valid email, and a 12–128 character password.",
  });
  assert.equal(accountWrites.some((query) => query.includes("INSERT INTO customer_users")), false);
});

test("customer login rejects malformed email without creating a session", async () => {
  const writes: string[] = [];
  const db = {
    prepare(query: string) {
      return {
        bind(..._args: unknown[]) { return this; },
        async first<T>() {
          if (query.includes("auth_rate_limits")) return { request_count: 1 } as T;
          return null as T | null;
        },
        async run() {
          writes.push(query);
          return { success: true, meta: { changes: 1 } };
        },
        async all<T>() { return { success: true, results: [] as T[] }; },
      };
    },
  };

  const response = await worker.fetch(
    new Request("https://example.test/api/customer/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "not-an-email", password: "GoldenFilms!2026" }),
    }),
    { DB: db },
  );

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "invalid_credentials" });
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(writes.some((query) => query.includes("INSERT INTO customer_sessions")), false);
});

test("customer login uses generic credentials error for unknown accounts", async () => {
  const writes: string[] = [];
  const db = {
    prepare(query: string) {
      return {
        bind(..._args: unknown[]) { return this; },
        async first<T>() {
          if (query.includes("auth_rate_limits")) return { request_count: 1 } as T;
          if (query.includes("FROM customer_users")) return null as T | null;
          return null as T | null;
        },
        async run() {
          writes.push(query);
          return { success: true, meta: { changes: 1 } };
        },
        async all<T>() { return { success: true, results: [] as T[] }; },
      };
    },
  };

  const response = await worker.fetch(
    new Request("https://example.test/api/customer/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "unknown@example.com", password: "GoldenFilms!2026" }),
    }),
    { DB: db },
  );

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "invalid_credentials" });
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(writes.some((query) => query.includes("INSERT INTO customer_sessions")), false);
});

test("customer session rejects oversized cookies before querying the session store", async () => {
  let sessionLookups = 0;
  const db = {
    prepare(query: string) {
      return {
        bind(..._args: unknown[]) {
          if (query.includes("FROM customer_sessions")) sessionLookups += 1;
          return this;
        },
        async first<T>() { return null as T | null; },
        async run() { return { success: true, meta: { changes: 0 } }; },
        async all<T>() { return { success: true, results: [] as T[] }; },
      };
    },
  };
  const response = await worker.fetch(
    new Request("https://example.test/api/customer/session", {
      method: "GET",
      headers: { cookie: "__Host-gf_customer=" + "x".repeat(257) },
    }),
    { DB: db },
  );
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "unauthorized" });
  assert.equal(sessionLookups, 0, "oversized cookie must not reach the session query");
});

test("customer session rejects an invalid session cookie", async () => {
  const db = {
    prepare(_query: string) {
      return {
        bind(..._args: unknown[]) { return this; },
        async first<T>() { return null as T | null; },
        async run() { return { success: true, meta: { changes: 0 } }; },
        async all<T>() { return { success: true, results: [] as T[] }; },
      };
    },
  };

  const response = await worker.fetch(
    new Request("https://example.test/api/customer/session", {
      method: "GET",
      headers: { cookie: "__Host-gf_customer=invalid-session-token" },
    }),
    { DB: db },
  );

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "unauthorized" });
});

test("customer logout clears oversized session cookies without querying by token", async () => {
  let deleteQueries = 0;
  const db = {
    prepare(query: string) {
      return {
        bind(..._args: unknown[]) { return this; },
        async first<T>() { return null as T | null; },
        async run() {
          if (query.includes("DELETE FROM customer_sessions")) deleteQueries += 1;
          return { success: true, meta: { changes: 0 } };
        },
        async all<T>() { return { success: true, results: [] as T[] }; },
      };
    },
  };
  const oversizedToken = "x".repeat(257);
  const response = await worker.fetch(
    new Request("https://example.test/api/customer/logout", {
      method: "POST",
      headers: { cookie: "__Host-gf_customer=" + oversizedToken },
    }),
    { DB: db },
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.match(response.headers.get("set-cookie") ?? "", /Max-Age=0/);
  assert.equal(deleteQueries, 0, "oversized token must not be hashed or queried");
});

test("customer logout clears a stale or invalid session cookie", async () => {
  const db = {
    prepare(_query: string) {
      return {
        bind(..._args: unknown[]) { return this; },
        async first<T>() { return null as T | null; },
        async run() { return { success: true, meta: { changes: 0 } }; },
        async all<T>() { return { success: true, results: [] as T[] }; },
      };
    },
  };

  const response = await worker.fetch(
    new Request("https://example.test/api/customer/logout", {
      method: "POST",
      headers: { cookie: "__Host-gf_customer=expired-or-invalid-token" },
    }),
    { DB: db },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.match(response.headers.get("set-cookie") ?? "", /Max-Age=0/);
});

test("customer login rejects malformed JSON without creating a session", async () => {
  const writes: string[] = [];
  const db = {
    prepare(query: string) {
      return {
        bind(..._args: unknown[]) { return this; },
        async first<T>() {
          if (query.includes("auth_rate_limits")) return { request_count: 1 } as T;
          return null as T | null;
        },
        async run() {
          writes.push(query);
          return { success: true, meta: { changes: 1 } };
        },
        async all<T>() { return { success: true, results: [] as T[] }; },
      };
    },
  };

  const response = await worker.fetch(
    new Request("https://example.test/api/customer/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{ malformed json",
    }),
    { DB: db },
  );

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "invalid_credentials" });
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(writes.some((query) => query.includes("INSERT INTO customer_sessions")), false);
});

test("customer login is rate limited before account lookup", async () => {
  const queries: string[] = [];
  const db = {
    prepare(query: string) {
      queries.push(query);
      return {
        bind(..._args: unknown[]) { return this; },
        async first<T>() {
          if (query.includes("auth_rate_limits")) return { request_count: 11 } as T;
          throw new Error("Account lookup must not run after rate limiting");
        },
        async run() { return { success: true, meta: { changes: 1 } }; },
        async all<T>() { return { success: true, results: [] as T[] }; },
      };
    },
  };

  const response = await worker.fetch(
    new Request("https://example.test/api/customer/login", {
      method: "POST",
      headers: { "content-type": "application/json", "cf-connecting-ip": "192.0.2.10" },
      body: JSON.stringify({ email: "customer@example.com", password: "GoldenFilms!2026" }),
    }),
    { DB: db },
  );

  assert.equal(response.status, 429);
  assert.deepEqual(await response.json(), { error: "temporarily_unavailable" });
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(queries.some((query) => query.includes("FROM customer_users")), false);
});

test("customer registration rate limit returns 429", async () => {
  const db = {
    prepare(query: string) {
      return {
        bind(..._args: unknown[]) { return this; },
        async first<T>() {
          if (query.includes("auth_rate_limits")) return { request_count: 11 } as T;
          return null as T | null;
        },
        async run() { return { success: true, meta: { changes: 1 } }; },
        async all<T>() { return { success: true, results: [] as T[] }; },
      };
    },
  };
  const response = await worker.fetch(
    new Request("https://example.test/api/customer/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Test Customer", email: "customer@example.com", phone: "", password: "GoldenFilms!2026" }),
    }),
    { DB: db },
  );
  assert.equal(response.status, 429);
  assert.deepEqual(await response.json(), { error: "temporarily_unavailable" });
  assert.equal(response.headers.get("set-cookie"), null);
});


test("customer session lookup excludes expired sessions and inactive accounts", async () => {
  const queries: string[] = [];
  const db = {
    prepare(query: string) {
      queries.push(query);
      return {
        bind(..._args: unknown[]) { return this; },
        async first<T>() { return null as T | null; },
        async run() { return { success: true, meta: { changes: 0 } }; },
        async all<T>() { return { success: true, results: [] as T[] }; },
      };
    },
  };

  const response = await worker.fetch(
    new Request("https://example.test/api/customer/session", {
      method: "GET",
      headers: { cookie: "__Host-gf_customer=expired-session-token" },
    }),
    { DB: db },
  );

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "unauthorized" });
  const sessionQuery = queries.find((query) => query.includes("FROM customer_sessions"));
  assert.ok(sessionQuery, "customer session query should run");
  assert.match(sessionQuery, /s\.expires_at > datetime\('now'\)/);
  assert.match(sessionQuery, /u\.is_active = 1/);
});
