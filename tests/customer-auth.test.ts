import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/index.ts";

test("customer auth routes reject unsupported methods", async () => {
  const cases = [
    ["https://example.test/api/customer/register", "GET", "POST"],
    ["https://example.test/api/customer/login", "GET", "POST"],
    ["https://example.test/api/customer/logout", "GET", "POST"],
    ["https://example.test/api/customer/session", "POST", "GET"],
    ["https://example.test/api/customer/session", "PUT", "GET"],
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
        async first<T>() { return null as T | null; },
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
