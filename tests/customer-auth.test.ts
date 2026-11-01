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

test("customer logout requires a valid customer session", async () => {
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
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "unauthorized" });
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
  assert.match(response.headers.get("set-cookie") ?? "", /HttpOnly/);
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

test("customer logout clears the session cookie when the session is invalid", async () => {
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

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "unauthorized" });
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
