import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/index.ts";

test("available booking slots exclude dates before today", async () => {
  let executedSql = "";
  const DB = {
    prepare(query: string) {
      executedSql = query;
      return {
        bind(..._values: unknown[]) { return this; },
        async all<T>() { return { success: true, results: [] as T[] }; },
      };
    },
  };
  const response = await worker.fetch(
    new Request("https://example.test/api/booking/slots?service=wedding-photography&from=2026-01-01&to=2026-12-31"),
    { DB },
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { slots: [] });
  assert.match(executedSql, /s\.slot_date\s*>=\s*date\('now'\)/);
});
