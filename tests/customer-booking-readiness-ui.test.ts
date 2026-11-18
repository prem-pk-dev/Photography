import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("customer booking UI requires explicit booking capability, not core API readiness", () => {
  const source = readFileSync(new URL("../src/Pages.tsx", import.meta.url), "utf8");
  assert.match(source, /readiness\s*===\s*"ready"/);
  assert.match(source, /capabilities\?\.customerBooking\s*===\s*true/);
  assert.doesNotMatch(source, /d\.status\s*===\s*"ready"/);
});
