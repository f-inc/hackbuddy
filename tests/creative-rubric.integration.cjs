/* eslint-disable @typescript-eslint/no-require-imports */
const { test, after } = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { randomUUID } = require("node:crypto");
delete process.env.SUPABASE_DB_HOST;
process.env.NODE_ENV = "test";
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "creative-rubric-"));
process.env.HACKBUDDY_DB = path.join(dir, "test.sqlite");
after(() => fs.rmSync(dir, { recursive: true, force: true }));
const {
  sameCreative,
  creativeTotal,
  creativeError,
  EMPTY_CREATIVE,
} = require("../domain/creative-rubric.ts");
const { createReview, aggregateReviews } = require("../domain/scoring.ts");
const { withEventConfig } = require("../lib/event-context.ts");
const {
  insertEvent,
  readEvent,
} = require("../infrastructure/database/events.ts");
const { saveProject } = require("../application/project-submission.ts");
const { parseReviewRequest } = require("../server/http/validation.ts");
const api = require("../lib/airtable.ts");
const {
  draftDatabaseReview,
} = require("../infrastructure/database/submission-repository.ts");
const creative = (n = 5, extra = {}) => ({
  ...EMPTY_CREATIVE,
  originality: n,
  technicalDifficulty: n,
  robustness: n,
  demoQuality: n,
  presentation: n,
  ...extra,
});
test("hardcoded axes, exact weights, bounds and video cap", () => {
  assert.equal(creativeTotal(creative(5)), 100);
  assert.equal(creativeTotal(creative(1)), 20);
  assert.equal(
    creativeTotal(
      creative(5, {
        technicalDifficulty: 4,
        robustness: 3,
        demoQuality: 2,
        presentation: 1,
      }),
    ),
    66,
  );
  assert.equal(
    creativeTotal(creative(5, { demoFormat: "video", demoQuality: 3 })),
    92,
  );
  assert.equal(
    creativeError(creative(5, { demoFormat: "video" })),
    "Video demos are capped at 3 for Demo quality.",
  );
  for (const n of [0, 6, 2.5, NaN]) assert.ok(creativeError(creative(n)));
  assert.equal(creativeError({ ...EMPTY_CREATIVE }, true), null);
  assert.ok(creativeError(creative(4, { hardwareNotes: "x".repeat(5001) })));
});
test("legacy reviews keep old totals; Creative reviews retain all axes and average to /100", () => {
  const first = createReview(
    "alex",
    {
      progress: 0,
      practicality: 0,
      complexity: 0,
      notes: "",
      creative: creative(5),
    },
    "now",
  );
  const second = createReview(
    "sam",
    {
      progress: 0,
      practicality: 0,
      complexity: 0,
      notes: "",
      creative: creative(3),
    },
    "now",
  );
  assert.equal(first.totalScore, 100);
  assert.equal(aggregateReviews([first, second]).total, 80);
  assert.equal(first.creative.originality, 5);
  assert.equal(
    createReview(
      "old",
      { progress: 10, practicality: 8, complexity: 7, notes: "" },
      "now",
    ).totalScore,
    25,
  );
});
test("MakerMods requires five-axis requests while historical events accept their original rubric", async () => {
  const config = {
    settings: { submissionForm: "makermods-physical-ai", scoreMax: 10 },
  };
  await withEventConfig(config, async () => {
    assert.throws(
      () =>
        parseReviewRequest({
          id: "p",
          progress: 5,
          practicality: 5,
          complexity: 5,
        }),
      /five Creative/,
    );
    assert.throws(
      () =>
        parseReviewRequest({
          id: "p",
          creative: creative(5, { demoFormat: "video" }),
        }),
      /capped at 3/,
    );
    assert.equal(
      parseReviewRequest({ id: "p", creative: creative(5) }).scores.creative
        .originality,
      5,
    );
  });
  await withEventConfig({ settings: { scoreMax: 10 } }, async () => {
    assert.equal(
      parseReviewRequest({
        id: "p",
        progress: 5,
        practicality: 4,
        complexity: 3,
      }).scores.progress,
      5,
    );
  });
});
test("five-axis drafts and concurrent judge scores persist and drive weighted ranking", async () => {
  const config = {
    id: randomUUID(),
    slug: "creative-" + randomUUID(),
    name: "Test",
    storage: "database",
    active: true,
    scoringPolicy: "normalized-v1",
    baseId: "",
    tableName: "",
    reviewsTableName: "",
    imageUrl: "",
    squareImageUrl: "",
    settings: {
      submissionForm: "makermods-physical-ai",
      requiredReviews: 2,
      finalistCount: 5,
      scoreMax: 10,
      submissionsOpen: true,
      collections: [],
    },
  };
  await insertEvent({ config, submissions: [], publication: null, drafts: {} });
  const id = await saveProject(config.id, {
    requestId: randomUUID(),
    teamNumber: "001",
    projectName: "Creative",
    teamName: "Builders",
    submitterNames: "Alex",
    contactEmail: "a@example.com",
    track: "Creative Applications",
    oneLiner: "Robot assistant",
    description: "Physical AI",
    progressOutline: "Built and tested",
    demoVideoUrl: "https://youtu.be/aqz-KE-bpKQ",
    repositoryUrl: "https://github.com/example/robot",
  });
  await withEventConfig(config, async () => {
    assert.equal((await api.claimNextSubmission("alex")).id, id);
    const a = parseReviewRequest({
      id,
      creative: creative(5),
      notes: "good",
    }).scores;
    await draftDatabaseReview(id, "alex", a);
    assert.equal(
      (await draftDatabaseReview(id, "alex")).scores.creative.demoQuality,
      5,
    );
    await api.completeSubmission(id, "alex", a);
    await api.completeSubmission(id, "alex", a);
    await assert.rejects(
      api.completeSubmission(id, "alex", { ...a, creative: creative(4) }),
      { status: 409 },
    );
    assert.equal((await api.claimNextSubmission("sam")).id, id);
    await api.completeSubmission(
      id,
      "sam",
      parseReviewRequest({ id, creative: creative(3) }).scores,
    );
    const report = await api.getResultsReport();
    assert.equal(report.scoringPolicy, "raw-v1");
    assert.equal(report.results[0].totalScore, 80);
    assert.equal(report.results[0].reviews[0].creative.originality, 5);
    assert.equal(
      (await readEvent(config.id)).data.submissions[0].reviews.length,
      2,
    );
  });
});

test("Supabase JSON key ordering cannot break identical review retries", () => {
 const original = creative(5);
 const reordered = Object.fromEntries(Object.entries(original).reverse());
 assert.equal(sameCreative(original, reordered), true);
 assert.equal(sameCreative(original, creative(4)), false);
});

test("six judges can reserve and submit one project concurrently without losing drafts", async () => {
  const config = { id: randomUUID(), slug: "parallel-" + randomUUID(), storage: "database",
    settings: { submissionForm: "makermods-physical-ai", requiredReviews: 6 } };
  const sid = randomUUID();
  await insertEvent({config, submissions: [{id: sid, track: "Creative Applications", createdAt: new Date().toISOString(),
    reviews: [], claimedBy: "legacy", claimedAt: new Date().toISOString()}], drafts: {}, publication: null});
  await withEventConfig(config, async () => {
    const judges = ["legacy", "parallel1", "parallel2", "parallel3", "parallel4", "parallel5"];
    const assigned = await Promise.all(judges.map(judge => api.claimNextSubmission(judge)));
    assert.ok(assigned.every(s => s?.id === sid));
    await Promise.all(judges.map((judge, i) => draftDatabaseReview(sid, judge, {
      progress: 0, practicality: 0, complexity: 0, creative: creative(3), notes: "draft" + i
    })));
    for (let i = 0; i < judges.length; i++)
      assert.equal((await draftDatabaseReview(sid, judges[i])).scores.notes, "draft" + i);
    await api.skipSubmission(sid, "parallel1");
    assert.equal((await api.claimNextSubmission("parallel1")).id, sid);
    assert.equal((await api.claimNextSubmission("legacy")).id, sid);
    await Promise.all(judges.map(judge => api.completeSubmission(sid, judge, {
      progress: 0, practicality: 0, complexity: 0, creative: creative(4), notes: judge
    })));
    const saved = (await readEvent(config.id)).data;
    assert.equal(saved.submissions[0].reviews.length, 6);
    assert.equal(new Set(saved.submissions[0].reviews.map(r => r.judgeName)).size, 6);
    assert.equal(Object.keys(saved.drafts).length, 0);
    assert.equal(await api.claimNextSubmission("seventh"), null);
    assert.equal((await api.getQueueStats()).completed, 1);
    assert.equal((await api.getResultsReport()).results[0].totalScore, 80);
  });
});
