/* eslint-disable @typescript-eslint/no-require-imports -- Isolated Airtable adapter tests. */
const assert = require("node:assert/strict");
const test = require("node:test");
const { photonEntries, usesPhoton } = require("../domain/photon.ts");
const { demoSubmissions } = require("../lib/demo-data.ts");
const { AirtableClient } = require("../infrastructure/airtable/client.ts");
const { AirtableSubmissionRepository } = require("../infrastructure/airtable/submission-repository.ts");

test("Photon matching uses only Tools Used, accepts variants and excludes substrings", () => {
  for (const toolsUsed of [["Photon"], [" photon "], ["Cursor", "PHOTON"], ["Photon tools"], ["Claude, Photon"]]) {
    assert.equal(usesPhoton({ toolsUsed }), true);
  }
  for (const toolsUsed of [undefined, [], ["Cursor"], ["Photonics"], ["SuperPhoton"]]) {
    assert.equal(usesPhoton({ toolsUsed }), false);
  }
  assert.equal(usesPhoton({ description: "Photon", toolsUsed: [] }), false);
});

test("Photon entries include every judging stage and builder identity without leaking review data", () => {
  const submissions = ["available", "in progress", "completed"].map((status, index) => ({
    ...demoSubmissions[0], id: String(index), status, toolsUsed: ["Photon"],
    submitterNames: "Andy and Ada", createdAt: `2026-10-${20 + index}T00:00:00Z`,
  }));
  const entries = photonEntries([...submissions, { ...demoSubmissions[0], toolsUsed: ["Cursor"] }]);
  assert.deepEqual(entries.map((entry) => entry.id), ["2", "1", "0"]);
  assert.equal(entries[0].submitterNames, "Andy and Ada");
  for (const entry of entries) {
    assert.equal("notes" in entry, false);
    assert.equal("reviews" in entry, false);
    assert.equal("contactEmail" in entry, false);
  }
});

test("Airtable tools and progress survive mapping, including tables without those fields", async () => {
  const originalRequest = AirtableClient.prototype.request;
  const originalList = AirtableClient.prototype.list;
  const fields = { "Tools Used": ["Cursor", "Photon"], "Progress Outline": "Built a working prototype." };
  AirtableClient.prototype.request = async () => ({ records: [] });
  AirtableClient.prototype.list = async () => [{ id: "photon", createdTime: "2026-10-30T00:00:00Z", fields }];
  try {
    const repository = new AirtableSubmissionRepository("appTest", "Submissions", "Reviews");
    let [submission] = await repository.list();
    assert.deepEqual(submission.toolsUsed, ["Cursor", "Photon"]);
    assert.equal(submission.progressOutline, fields["Progress Outline"]);
    assert.equal(photonEntries([submission]).length, 1);
    fields["Tools Used"] = "Photon";
    [submission] = await repository.list();
    assert.deepEqual(submission.toolsUsed, ["Photon"]);
    delete fields["Tools Used"];
    delete fields["Progress Outline"];
    [submission] = await repository.list();
    assert.deepEqual(submission.toolsUsed, []);
    assert.equal(submission.progressOutline, "");
    assert.equal(photonEntries([submission]).length, 0);
  } finally {
    AirtableClient.prototype.request = originalRequest;
    AirtableClient.prototype.list = originalList;
  }
});
