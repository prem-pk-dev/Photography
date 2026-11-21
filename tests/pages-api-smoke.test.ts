import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const script = new URL("../scripts/smoke-pages-api.mjs", import.meta.url);

function runSmokeTest(args: string[]) {
  return spawnSync(process.execPath, [script.pathname, ...args], {
    encoding: "utf8",
    env: { ...process.env, PAGES_BASE_URL: "" },
  });
}

test("Pages API smoke test requires an explicit deployment URL", () => {
  const result = runSmokeTest([]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Usage: node scripts\/smoke-pages-api\.mjs/);
});

test("Pages API smoke test refuses non-HTTPS URLs before making requests", () => {
  const result = runSmokeTest(["http://example.test"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Refusing to test a non-HTTPS URL/);
});

test("Pages API smoke test rejects malformed URLs before making requests", () => {
  const result = runSmokeTest(["not-a-valid-url"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Base URL is invalid/);
});

import { validateReadiness, validateUnauthenticatedAdminSession } from "../scripts/pages-api-smoke-contract.mjs";

test("readiness accepts the actual core-ready API response and reports optional booking as a warning", () => {
  const warnings = validateReadiness({
    status: "ok",
    readiness: "ready",
    schema: "legacy-compatible",
    capabilities: { customerBooking: false },
    disabledFeatures: ["customer_booking"],
  });
  assert.deepEqual(warnings, ["customer_booking"]);
});

test("readiness rejects a non-ready API response", () => {
  assert.throws(
    () => validateReadiness({ status: "ok", readiness: "not_ready", schema: "legacy-compatible" }),
    /expected readiness="ready"/,
  );
});

test("readiness rejects an incompatible core schema", () => {
  assert.throws(
    () => validateReadiness({ status: "ok", readiness: "ready", schema: "incompatible" }),
    /schema="legacy-compatible"/,
  );
});


test("unauthenticated admin session accepts the expected response", () => {
  assert.doesNotThrow(() => validateUnauthenticatedAdminSession({ authenticated: false }));
});

test("unauthenticated admin session rejects an authenticated response", () => {
  assert.throws(
    () => validateUnauthenticatedAdminSession({ authenticated: true, admin: { role: "owner" } }),
    /expected authenticated=false/,
  );
});

test("unauthenticated admin session rejects malformed responses", () => {
  assert.throws(() => validateUnauthenticatedAdminSession(null), /expected a JSON object/);
});
