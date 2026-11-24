import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/index.ts";

const expectedHeaders: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()"
};

test("Worker applies baseline security headers to API errors and static-asset fallback responses", async () => {
  const cases = [
    { url: "https://example.test/api/not-a-real-endpoint", expectedStatus: 404 },
    { url: "https://example.test/unknown-static-path", expectedStatus: 503 }
  ];

  for (const item of cases) {
    const response = await worker.fetch(new Request(item.url), {});
    assert.equal(response.status, item.expectedStatus);
    for (const [name, value] of Object.entries(expectedHeaders)) {
      assert.equal(response.headers.get(name), value, `missing ${name} on ${item.url}`);
    }
    assert.equal(response.headers.get("strict-transport-security"), "max-age=31536000");
  }
});

test("Worker omits HSTS on non-HTTPS requests while retaining other baseline headers", async () => {
  const response = await worker.fetch(new Request("http://example.test/api/not-a-real-endpoint"), {});
  assert.equal(response.status, 404);
  for (const [name, value] of Object.entries(expectedHeaders)) {
    assert.equal(response.headers.get(name), value);
  }
  assert.equal(response.headers.get("strict-transport-security"), null);
});
