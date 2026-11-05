/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test"),
  assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("node:fs"),
  { join } = require("node:path"),
  { tmpdir } = require("node:os");
const dir = mkdtempSync(join(tmpdir(), "hackbuddy-managed-"));
process.env.HACKBUDDY_DB = join(dir, "events.sqlite");
delete process.env.SUPABASE_DB_HOST;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.AIRTABLE_API_KEY;
delete process.env.AIRTABLE_BASE_ID;
delete process.env.AIRTABLE_TABLE_NAME;
const { createHackathon, updateHackathon, listHackathons } = require("../lib/hackathons.ts");
const { withEventConfig } = require("../lib/event-context.ts");
const { readEvent, changeEvent } = require("../infrastructure/database/events.ts");
const { draftDatabaseReview } = require("../infrastructure/database/submission-repository.ts");
const { parseEventSettings, parseReviewRequest } = require("../server/http/validation.ts");
const { saveProject } = require("../application/project-submission.ts");
const api = require("../lib/airtable.ts");
const settings = {
  requiredReviews: 1,
  finalistCount: 5,
  scoreMax: 5,
  submissionsOpen: true,
  collections: [],
};
const fields = {
  projectName: "Project",
  teamName: "Team",
  submitterNames: "Builder",
  contactEmail: "builder@example.com",
  description: "Working demo",
  toolsUsed: "Photon, React",
};
test.after(() => {
  globalThis.hackbuddyEventsDb?.close();
  delete globalThis.hackbuddyEventsDb;
  rmSync(dir, { recursive: true, force: true });
});
test("event rules accept requested bounds and reject unsupported score scales and finalists", () => {
  assert.deepEqual(parseEventSettings(settings), settings);
  for (const invalid of [
    { finalistCount: 4 },
    { finalistCount: 21 },
    { scoreMax: 7 },
    { requiredReviews: 0 },
  ])
    assert.throws(() => parseEventSettings({ ...settings, ...invalid }));
});
test("form submissions are event scoped, retry safely, close, and require organizer rights to edit", async () => {
  const event = await createHackathon({
    name: "Submission flow",
    slug: "submission-flow",
    settings,
  });
  const token = "11111111-1111-4111-8111-111111111111";
  const id = await saveProject(event.id, { ...fields, requestId: token });
  assert.equal(await saveProject(event.id, { ...fields, requestId: token }), id);
  assert.equal((await readEvent(event.id)).data.submissions.length, 1);
  await assert.rejects(() => saveProject(event.id, { ...fields, id }), /organizers/);
  await saveProject(event.id, { ...fields, id, projectName: "Corrected" }, true);
  assert.equal((await readEvent(event.id)).data.submissions[0].projectName, "Corrected");
  await updateHackathon(event.id, { ...event, settings: { ...settings, submissionsOpen: false } });
  await assert.rejects(() => saveProject(event.id, fields), /closed/);
  const other = await createHackathon({ name: "Other event", slug: "other-event", settings });
  assert.equal(await withEventConfig(other, () => api.getSubmissionById(id)), null);
});
test("concurrent judges cannot claim the same project; drafts recover and submitted retries count once", async () => {
  const event = await createHackathon({ name: "Judge flow", slug: "judge-flow", settings });
  const id = await saveProject(event.id, fields);
  await withEventConfig(event, async () => {
    const claims = await Promise.all([
      api.claimNextSubmission("alex"),
      api.claimNextSubmission("sam"),
    ]);
    assert.equal(claims.filter(Boolean).length, 1);
    const judge = claims[0] ? "alex" : "sam";
    assert.equal((await api.claimNextSubmission(judge)).id, id);
    await draftDatabaseReview(id, judge, { progress: 4, notes: "In progress" });
    assert.equal((await draftDatabaseReview(id, judge)).scores.notes, "In progress");
    assert.equal((await api.getQueueStats()).completed, 0);
    assert.throws(
      () => parseReviewRequest({ id, progress: 6, practicality: 4, complexity: 4 }),
      /between/,
    );
    const scores = { progress: 4, practicality: 4, complexity: 4, notes: "Done" };
    await api.completeSubmission(id, judge, scores);
    await api.completeSubmission(id, judge, scores);
    assert.equal((await api.getQueueStats()).completed, 1);
    assert.equal((await api.getSubmissionById(id)).reviews.length, 1);
    assert.equal(await draftDatabaseReview(id, judge), null);
  });
  await assert.rejects(
    () => updateHackathon(event.id, { ...event, settings: { ...settings, scoreMax: 10 } }),
    /locked/,
  );
});
test("expired reservations can be reassigned without losing saved drafts", async () => {
  const event = await createHackathon({ name: "Recovery", slug: "recovery", settings });
  const id = await saveProject(event.id, fields);
  await withEventConfig(event, async () => {
    await api.claimNextSubmission("alex");
    await draftDatabaseReview(id, "alex", { notes: "Keep this" });
    await changeEvent(event.id, (data) => {
      data.submissions[0].claimedAt = "2000-01-01T00:00:00Z";
    });
    assert.equal((await api.claimNextSubmission("sam")).id, id);
    await assert.rejects(
      () =>
        api.completeSubmission(id, "alex", {
          progress: 4,
          practicality: 4,
          complexity: 4,
          notes: "",
        }),
      /expired/,
    );
    assert.equal((await draftDatabaseReview(id, "alex")).scores.notes, "Keep this");
  });
});
test("the original finals and publication flow honors the event finalist count", async () => {
  const event = await createHackathon({
    name: "Finals",
    slug: "final-flow",
    settings,
    scoringPolicy: "raw-v1",
  });
  await withEventConfig(event, async () => {
    for (let i = 0; i < 6; i++) {
      const id = await saveProject(event.id, { ...fields, projectName: `Project ${i}` });
      assert.equal((await api.claimNextSubmission("alex")).id, id);
      await api.completeSubmission(id, "alex", {
        progress: 5,
        practicality: 5,
        complexity: 5,
        notes: "",
      });
    }
    const state = await api.startFinalRound("organizer", ["alex"]);
    assert.equal(state.finalists.length, 5);
    const picks = state.finalists.slice(0, 3).map((s) => s.id);
    await api.submitFinalBallot("alex", picks);
    const published = await api.publishResults("organizer", picks);
    assert.ok(published.publishedAt);
    assert.equal(published.topThree.length, 3);
    await assert.rejects(() => api.claimNextSubmission("sam"), /locked/);
    await assert.rejects(() => saveProject(event.id, { ...fields, id: picks[0] }, true), /locked/);
  });
});

test("managed event catalog stays available without contacting Airtable", async () => {
  const event = await createHackathon({ name: "Native catalog", slug: "native-catalog", settings });
  const originalFetch = global.fetch;
  const keys = ["AIRTABLE_API_KEY", "AIRTABLE_BASE_ID", "AIRTABLE_HACKATHONS_TABLE"];
  const previous = keys.map((k) => process.env[k]);
  let requests = 0;
  try {
    process.env.AIRTABLE_API_KEY = "test-key";
    process.env.AIRTABLE_BASE_ID = "test-base";
    process.env.AIRTABLE_HACKATHONS_TABLE = "Hackathons";
    global.fetch = async () => {
      requests++;
      throw new Error("Airtable unavailable");
    };
    const events = await listHackathons();
    assert.ok(events.some((e) => e.id === event.id));
    assert.equal(requests, 0);
  } finally {
    global.fetch = originalFetch;
    keys.forEach((k, i) => {
      if (previous[i] === undefined) delete process.env[k];
      else process.env[k] = previous[i];
    });
  }
});

test("sponsors save independently of filtered awards and reject unsafe logos", async () => {
  const sponsors = [
    { id: "bolt", name: "bolt.new", logo: "/sponsors/bolt-new.svg" },
    { id: "custom", name: "Custom sponsor", logo: "https://example.com/logo.png" },
  ];
  const parsed = parseEventSettings({ ...settings, sponsors });
  assert.deepEqual(parsed.sponsors, sponsors);
  assert.deepEqual(parsed.collections, []);
  const event = await createHackathon({ name: "Sponsors", slug: "sponsors", settings: parsed });
  await updateHackathon(event.id, {
    ...event,
    settings: { ...parsed, sponsors: sponsors.slice(0, 1) },
  });
  assert.deepEqual((await readEvent(event.id)).data.config.settings.sponsors, sponsors.slice(0, 1));
  assert.throws(
    () =>
      parseEventSettings({
        ...settings,
        sponsors: [{ id: "bad", name: "Bad", logo: "javascript:alert(1)" }],
      }),
    /URL/,
  );
  assert.throws(
    () => parseEventSettings({ ...settings, sponsors: [sponsors[0], sponsors[0]] }),
    /unique/,
  );
});
