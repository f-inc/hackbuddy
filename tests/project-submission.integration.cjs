/* eslint-disable @typescript-eslint/no-require-imports */
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
// These tests must never touch an environment's configured database.
delete process.env.SUPABASE_DB_HOST;
process.env.NODE_ENV = "test";
const directory = mkdtempSync(join(tmpdir(), "hackbuddy-submissions-"));
process.env.HACKBUDDY_DB = join(directory, "test.sqlite");
const {
  insertEvent,
  readEvent,
  changeEvent,
} = require("../infrastructure/database/events.ts");
const {
  saveProject,
  submissionFields,
} = require("../application/project-submission.ts");
const { parseEventSettings } = require("../server/http/validation.ts");
after(() => rmSync(directory, { recursive: true, force: true }));
function answers(overrides = {}) {
  return {
    requestId: randomUUID(),
    projectName: "Robot helper",
    teamName: "Builders",
    teamNumber: "007",
    submitterNames: "Alex, Sam, Jo",
    contactEmail: "test@example.com",
    oneLiner: "A voice-controlled robot assistant",
    description: "A robot that sorts objects using voice instructions.",
    progressOutline:
      "1. Collected demos. 2. Integrated voice. 3. Tested recovery.",
    track: "Creative Applications",
    toolsUsed: "Dream-1, LiveKit, Dimensional, LiveKit",
    demoVideoUrl: "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
    ...overrides,
  };
}
async function fixture(settings = {}) {
  const id = randomUUID();
  await insertEvent({
    config: {
      id,
      slug: "test-" + id,
      name: "Test",
      active: true,
      storage: "database",
      scoringPolicy: "normalized-v1",
      baseId: "",
      tableName: "",
      reviewsTableName: "",
      imageUrl: "",
      squareImageUrl: "",
      settings: {
        requiredReviews: 2,
        finalistCount: 7,
        scoreMax: 10,
        collections: [],
        submissionsOpen: true,
        submissionForm: "makermods-physical-ai",
        ...settings,
      },
    },
    submissions: [],
    drafts: {},
    publication: null,
  });
  return id;
}
test("MakerMods answers persist with every field mapped and duplicate tools normalized", async () => {
  const event = await fixture();
  const input = answers({
    demoUrl: "https://example.com/demo",
    repositoryUrl: "https://github.com/example/robot",
    teamPhotoUrl: "https://example.com/team.png",
    previewImageUrl: "https://example.com/robot.png",
  });
  const id = await saveProject(event, input);
  const project = (await readEvent(event)).data.submissions[0];
  assert.equal(project.id, id);
  for (const [key, value] of Object.entries(
    submissionFields(input, "makermods-physical-ai"),
  ))
    assert.deepEqual(project[key], value, key);
  assert.deepEqual(project.toolsUsed, ["Dream-1", "LiveKit", "Dimensional"]);
  assert.equal(project.status, "available");
  assert.deepEqual(project.reviews, []);
  assert.equal(project.totalScore, null);
});
test("retries are idempotent; changed payload under a used token is rejected", async () => {
  const event = await fixture(),
    input = answers();
  const id = await saveProject(event, input);
  assert.equal(await saveProject(event, input), id);
  await assert.rejects(
    saveProject(event, { ...input, description: "Different answers" }),
    /different answers/,
  );
  assert.equal((await readEvent(event)).data.submissions.length, 1);
});
test("simultaneous duplicate and distinct submissions preserve all writes", async () => {
  const event = await fixture(),
    input = answers();
  const same = await Promise.all(
    Array.from({ length: 10 }, () => saveProject(event, input)),
  );
  assert.equal(new Set(same).size, 1);
  const distinct = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      saveProject(event, answers({ projectName: "Robot " + i })),
    ),
  );
  assert.equal(new Set(distinct).size, 10);
  assert.equal((await readEvent(event)).data.submissions.length, 11);
});
test("server validates required answers, track, video, lengths, types, email and unsafe links", async () => {
  const event = await fixture();
  for (const change of [
    { projectName: "" },
    { teamName: " " },
    { submitterNames: "" },
    { contactEmail: "a@@b.com" },
    { description: "" },
    { description: null },
    { progressOutline: "" },
    { oneLiner: "" },
    { oneLiner: "a".repeat(51) },
    { track: "Invalid track" },
    { demoVideoUrl: "" },
    { demoVideoUrl: "javascript:alert(1)" },
    { repositoryUrl: "https://user:password@example.com" },
    { toolsUsed: ["MakerMods"] },
    { contactEmail: "a".repeat(255) },
    { requestId: "bad" },
    { teamNumber: "12a" },
    { teamNumber: "1.5" },
    { teamNumber: "-2" },
    { teamNumber: "12345678901" },
    { teamNumber: 7 },
  ])
    await assert.rejects(saveProject(event, answers(change)), { status: 400 });
  assert.equal((await readEvent(event)).data.submissions.length, 0);
});
test("MakerMods preserves the Creative Applications default and requires its video", async () => {
  const event = await fixture();
  await saveProject(event, answers({ track: "" }));
  await saveProject(event, answers({ track: undefined }));
  const submissions = (await readEvent(event)).data.submissions;
  assert.equal(submissions.length, 2);
  assert.ok(
    submissions.every((project) => project.track === "Creative Applications"),
  );
  await assert.rejects(
    saveProject(event, answers({ track: "", demoVideoUrl: "" })),
    { status: 400 },
  );
  assert.equal((await readEvent(event)).data.submissions.length, 2);
});
test("closed, inactive and published events reject new writes while retries confirm prior receipt", async () => {
  for (const close of [
    (e) => {
      e.config.settings.submissionsOpen = false;
    },
    (e) => {
      e.config.active = false;
    },
    (e) => {
      e.publication = { publishedAt: new Date().toISOString() };
    },
  ]) {
    const event = await fixture(),
      input = answers();
    const id = await saveProject(event, input);
    await changeEvent(event, close);
    await assert.rejects(saveProject(event, answers()), { status: 409 });
    assert.equal(await saveProject(event, input), id);
    assert.equal((await readEvent(event)).data.submissions.length, 1);
  }
});
test("participants cannot overwrite a submission, and IDs stay isolated between events", async () => {
  const a = await fixture(),
    b = await fixture(),
    input = answers();
  const id = await saveProject(a, input);
  await assert.rejects(
    saveProject(a, { ...input, id, teamName: "Overwrite" }),
    /Only organizers/,
  );
  await assert.rejects(saveProject(b, { ...input, id }, true), { status: 404 });
  assert.equal((await readEvent(b)).data.submissions.length, 0);
  await saveProject(
    a,
    { ...input, id, teamName: "Organizer correction" },
    true,
  );
  assert.equal(
    (await readEvent(a)).data.submissions[0].teamName,
    "Organizer correction",
  );
});
test("event settings preserve template through editing and reject unknown templates", () => {
  assert.equal(
    parseEventSettings({ submissionForm: "makermods-physical-ai" })
      .submissionForm,
    "makermods-physical-ai",
  );
  assert.throws(
    () => parseEventSettings({ submissionForm: "typo" }),
    /Invalid submission form/,
  );
  assert.equal(parseEventSettings({}).submissionForm, undefined);
});

test("team numbers preserve leading zeros, are required for both MakerMods tracks, and cannot change under a used token", async () => {
  const event = await fixture(),
    input = answers({ teamNumber: "007" });
  const id = await saveProject(event, input);
  assert.equal((await readEvent(event)).data.submissions[0].teamNumber, "007");
  await assert.rejects(saveProject(event, { ...input, teamNumber: "008" }), {
    status: 409,
  });
  for (const track of ["Creative Applications", "Hill Climb"]) {
    for (const teamNumber of [undefined, "", "   "]) {
      await assert.rejects(saveProject(event, answers({ track, teamNumber })), { status: 400 });
    }
  }
  assert.equal((await readEvent(event)).data.submissions.length, 1);
  await saveProject(event, { ...input, id, teamNumber: "008" }, true);
  assert.equal((await readEvent(event)).data.submissions[0].teamNumber, "008");
});

test("Hill Climb needs model improvements but no one-liner, video or hackathon progress", async () => {
  const event = await fixture();
  const input = answers({
    track: "Hill Climb",
    description: "Collected 120 episodes and trained for 5000 steps.",
    oneLiner: "",
    demoVideoUrl: "",
    progressOutline: "",
    teamPhotoUrl: "https://example.com/team.png",
  });
  const id = await saveProject(event, input);
  const project = (await readEvent(event)).data.submissions.find(
    (s) => s.id === id,
  );
  assert.equal(project.track, "Hill Climb");
  assert.equal(project.description, input.description);
  assert.equal(project.teamPhotoUrl, input.teamPhotoUrl);
  assert.deepEqual(project.toolsUsed, ["Dream-1", "LiveKit", "Dimensional"]);
  assert.equal(project.teamNumber, "007");
  for (const key of ["oneLiner", "demoVideoUrl", "progressOutline"])
    assert.equal(project[key], "");
  await assert.rejects(
    saveProject(event, { ...input, requestId: randomUUID(), description: "" }),
    { status: 400 },
  );
  assert.equal(await saveProject(event, input), id);
});
test("switching a draft to Hill Climb discards hidden creative answers on the server and cannot change a used receipt", async () => {
  const event = await fixture();
  const input = answers({
    track: "Hill Climb",
    oneLiner: "x".repeat(100),
    progressOutline: "Hidden progress",
    demoVideoUrl: "invalid hidden URL",
    demoUrl: "invalid hidden URL",
    repositoryUrl: "invalid hidden URL",
    previewImageUrl: "invalid hidden URL",
  });
  const id = await saveProject(event, input);
  const project = (await readEvent(event)).data.submissions[0];
  for (const key of [
    "oneLiner",
    "progressOutline",
    "demoVideoUrl",
    "demoUrl",
    "repositoryUrl",
    "previewImageUrl",
  ])
    assert.equal(project[key], "");
  assert.equal(await saveProject(event, input), id);
  await assert.rejects(
    saveProject(event, answers({ requestId: input.requestId })),
    { status: 409 },
  );
});

test("standard events keep accepting submissions without a team number", async () => {
  const event = await fixture({ submissionForm: "standard" });
  const id = await saveProject(event, answers({ teamNumber: undefined }));
  assert.equal((await readEvent(event)).data.submissions.find((s) => s.id === id).teamNumber, "");
});
