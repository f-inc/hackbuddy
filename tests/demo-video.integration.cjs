/* eslint-disable @typescript-eslint/no-require-imports -- Isolated Airtable adapter tests. */
const assert = require("node:assert/strict");
const test = require("node:test");
const { AirtableClient } = require("../infrastructure/airtable/client.ts");
const {
  AirtableSubmissionRepository,
} = require("../infrastructure/airtable/submission-repository.ts");

test("video upload and submitted link are both preserved, with either usable on its own", async () => {
  const originalRequest = AirtableClient.prototype.request;
  const originalList = AirtableClient.prototype.list;
  const fields = {
    "Team Name": "Demo test",
    "Demo Video URL": "https://www.loom.com/share/test-video",
  };
  AirtableClient.prototype.request = async function () {
    return { records: [] };
  };
  AirtableClient.prototype.list = async function () {
    return [{ id: "demo", createdTime: "2026-10-30T00:00:00Z", fields }];
  };
  try {
    const repository = new AirtableSubmissionRepository(
      "appTest",
      "Submissions",
      "Reviews",
    );
    let [submission] = await repository.list();
    assert.equal(submission.demoUrl, fields["Demo Video URL"]);
    assert.equal(submission.demoType, "");
    fields.Demo = [];
    [submission] = await repository.list();
    assert.equal(submission.demoUrl, fields["Demo Video URL"]);
    fields["Demo Video URL"] = "https://www.youtube.com/watch?v=test-video";
    [submission] = await repository.list();
    assert.equal(submission.demoUrl, fields["Demo Video URL"]);
    fields.Demo = [
      {
        url: "https://example.com/demo.mp4",
        type: "video/mp4",
        filename: "demo.mp4",
      },
    ];
    [submission] = await repository.list();
    assert.equal(submission.demoUrl, fields.Demo[0].url);
    assert.equal(submission.demoType, "video/mp4");
    assert.equal(submission.demoFilename, "demo.mp4");
    assert.equal(submission.demoVideoUrl, fields["Demo Video URL"]);
    delete fields["Demo Video URL"];
    [submission] = await repository.list();
    assert.equal(submission.demoUrl, fields.Demo[0].url);
    assert.equal(submission.demoVideoUrl, "");
    delete fields.Demo;
    [submission] = await repository.list();
    assert.equal(submission.demoUrl, "");
    assert.equal(submission.demoVideoUrl, "");
  } finally {
    AirtableClient.prototype.request = originalRequest;
    AirtableClient.prototype.list = originalList;
  }
});
