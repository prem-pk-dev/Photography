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
