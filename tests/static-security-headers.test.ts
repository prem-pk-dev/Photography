import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("Cloudflare Pages static responses declare baseline browser security headers", () => {
  const headers = readFileSync(new URL("../public/_headers", import.meta.url), "utf8");
  assert.match(headers, /^\/\*\s*\n/m);
  assert.match(headers, /^\s+X-Content-Type-Options:\s*nosniff\s*$/mi);
  assert.match(headers, /^\s+X-Frame-Options:\s*DENY\s*$/mi);
  assert.match(headers, /^\s+Referrer-Policy:\s*strict-origin-when-cross-origin\s*$/mi);
  assert.match(headers, /^\s+Permissions-Policy:\s*camera=\(\), microphone=\(\), geolocation=\(\)\s*$/mi);
  assert.match(headers, /^\s+Strict-Transport-Security:\s*max-age=31536000\s*$/mi);
});
