/* eslint-disable @typescript-eslint/no-require-imports -- Script tests use the existing integration runner. */
const assert = require("node:assert/strict");
const test = require("node:test");

async function fixture(options = {}) {
  const { releaseReservations } = await import("../scripts/release-all-judges.mjs");
  const records = [
    { id: "rec1", fields: { Status: "in progress", "Claimed By": "one", "Claimed At": "now", "Claim Token": "token", Score: 25, Reviews: "saved" } },
    { id: "rec2", fields: { Status: "completed", Score: 50 } },
    { id: "rec3", fields: { Status: "available" } },
    { id: "rec4", fields: { Status: "in progress", "Claimed By": "two" } },
  ];
  const writes = [];
  const result = await releaseReservations(
    { baseId: "test-base", table: "Event / Submissions", apiKey: "test-key", env: {}, apply: options.apply },
    { log: () => {}, pause: async () => {}, fetchImpl: async (url, init) => {
      const parsed = new URL(url);
      if (parsed.search) {
        // Exercise pagination, including a page with no active reservations.
        const secondPage = parsed.searchParams.has("offset");
        return { ok: true, json: async () => ({ records: structuredClone(secondPage ? records.slice(2) : records.slice(0, 2)), offset: secondPage ? undefined : "next-page" }) };
      }
      const id = parsed.pathname.split("/").at(-1);
      const record = records.find((r) => r.id === id);
      if (init.method === "PATCH") {
        if (options.fail === id) return { ok: false, status: 500 };
        const body = JSON.parse(init.body);
        writes.push({ id, ...body });
        Object.assign(record.fields, body.fields);
      } else if (options.change === id) {
        record.fields["Claim Token"] = "new-reservation";
      }
      return { ok: true, json: async () => structuredClone(record) };
    } },
  );
  return { result, writes, records };
}

test("bulk release defaults to a dry run and never writes", async () => {
  const { result, writes } = await fixture();
  assert.deepEqual(result, { found: 2, released: 0, skipped: 0, failed: 0 });
  assert.deepEqual(writes, []);
});

test("apply releases every active reservation and preserves saved scores and reviews", async () => {
  const { result, writes, records } = await fixture({ apply: true });
  assert.deepEqual(result, { found: 2, released: 2, skipped: 0, failed: 0 });
  assert.deepEqual(writes.map((w) => w.id), ["rec1", "rec4"]);
  for (const write of writes) assert.deepEqual(write.fields, {
    Status: "available", "Claimed By": null, "Claimed At": null, "Claim Token": null,
  });
  assert.equal(records[0].fields.Score, 25);
  assert.equal(records[0].fields.Reviews, "saved");
  assert.equal(records[1].fields.Status, "completed");
});

test("apply skips reservations that changed after the initial scan", async () => {
  const { result, writes } = await fixture({ apply: true, change: "rec1" });
  assert.deepEqual(result, { found: 2, released: 1, skipped: 1, failed: 0 });
  assert.deepEqual(writes.map((w) => w.id), ["rec4"]);
});

test("partial failures are reported and do not prevent releasing other judges", async () => {
  const { result, writes } = await fixture({ apply: true, fail: "rec1" });
  assert.deepEqual(result, { found: 2, released: 1, skipped: 0, failed: 1 });
  assert.deepEqual(writes.map((w) => w.id), ["rec4"]);
});
