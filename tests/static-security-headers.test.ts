import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const headers = readFileSync("public/_headers", "utf8");

test("static Pages responses ship baseline browser security headers", () => {
  for (const header of [
    "X-Content-Type-Options: nosniff",
    "X-Frame-Options: DENY",
    "Referrer-Policy: strict-origin-when-cross-origin",
    "Strict-Transport-Security: max-age=31536000",
    "Permissions-Policy: camera=(), microphone=(), geolocation=()",
    "X-Permitted-Cross-Domain-Policies: none",
    "X-XSS-Protection: 0"
  ]) assert.ok(headers.includes(header), `missing security header: ${header}`);
});

