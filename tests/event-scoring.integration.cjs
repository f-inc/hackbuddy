/* eslint-disable @typescript-eslint/no-require-imports -- Isolated CommonJS test loader exercises server TypeScript imports. */
const assert = require("node:assert/strict");
const test = require("node:test");
const { withAirtableConfig } = require("../lib/airtable-context.ts");
const {
  eventScoringRepository,
  encodePublication,
} = require("../infrastructure/airtable/event-scoring-repository.ts");
const api = require("../lib/airtable.ts");
const { readScoringPolicy } = require("../domain/event-scoring.ts");
const { createReview } = require("../domain/scoring.ts");
const { updateHackathon } = require("../lib/hackathons.ts");

function snapshot() {
  const review = createReview(
    "judge",
    { progress: 8, practicality: 8, complexity: 8, notes: "Saved note" },
    "2026-01-01",
  );
  const result = {
    id: "project",
    teamName: "Team",
    projectName: "Winner",
    oneLiner: "Saved description",
    submitterNames: "Builder",
    teamPhotoUrl: "",
    track: "",
    reviews: [review],
    progressScore: 8,
    practicalityScore: 8,
    complexityScore: 8,
    totalScore: 24,
    completedAt: "2026-01-01",
    normalizedScore: 0,
    rawRank: 1,
  };
  const finalist = {
    ...result,
    finalReviews: [review],
    finalNormalizedScore: 0,
    reviewedByYou: false,
    fullyReviewed: true,
  };
  const publishedAt = "2026-01-02T00:00:00Z";
  return {
    schemaVersion: 1,
    scoringPolicy: "normalized-v1",
    publishedAt,
    publishedBy: "admin",
    results: [result],
    normalization: { judges: [], judgeGroups: 1, missingReviewProjects: 0 },
    finals: {
      scoringPolicy: "normalized-v1",
      publishedAt,
      started: true,
      canStart: false,
      startedAt: "2026-01-01",
      judges: ["judge"],
      eligibleJudge: false,
      finalists: [finalist],
      completedReviews: 1,
      requiredReviews: 1,
      allComplete: true,
      topThree: [finalist],
    },
  };
}

test("persistent publication is read without consulting the live review ledger; later mutations are blocked", async () => {
  const previousFetch = global.fetch;
  const previousEnv = { ...process.env };
  process.env.AIRTABLE_API_KEY = "integration-test-token";
  process.env.AIRTABLE_BASE_ID = "appTest";
  let record = {
    id: "event",
    fields: {
      Name: "Test event",
      Slug: "test-event",
      "Airtable Base ID": "appTest",
      "Airtable Table Name": "Submissions",
      "Airtable Reviews Table Name": "Reviews",
      "Scoring Policy": "normalized-v1",
      Active: true,
    },
  };
  let writes = 0;
  global.fetch = async (url, options = {}) => {
    assert.equal(
      options.headers.Authorization,
      "Bearer integration-test-token",
    );
    if (String(url).endsWith("/Hackathons/event")) {
      if (options.method === "PATCH") {
        writes++;
        Object.assign(record.fields, JSON.parse(options.body).fields);
      }
      return Response.json(record);
    }
    if (String(url).includes("/Hackathons?"))
      return Response.json({ records: [record] });
    throw new Error("Unexpected live ledger access: " + url);
  };
  try {
    await withAirtableConfig(
      {
        hackathonId: "event",
        baseId: "appTest",
        tableName: "Submissions",
        reviewsTableName: "Reviews",
      },
      async () => {
        assert.equal((await eventScoringRepository.read()).publication, null);
        const saved = snapshot();
        await eventScoringRepository.publish(saved);
        assert.equal(writes, 1);
        assert.ok(record.fields["Published Results"].startsWith("gzip-v1:"));
        // Registry policy edits cannot replace a published event's pinned version.
        record.fields["Scoring Policy"] = "raw-v1";
        assert.equal(
          (await eventScoringRepository.read()).scoringPolicy,
          "normalized-v1",
        );
        const report = await api.getResultsReport();
        assert.deepEqual(report.results, saved.results);
        const finals = await api.getFinalsState("judge");
        assert.equal(finals.finalists[0].reviewedByYou, true);
        assert.equal(finals.publishedAt, saved.publishedAt);
        await eventScoringRepository.publish({
          ...saved,
          publishedBy: "another-admin",
          results: [],
        });
        assert.equal(
          writes,
          1,
          "publishing twice must never overwrite the snapshot",
        );
        for (const operation of [
          () => api.claimNextSubmission("judge"),
          () => api.completeSubmission("project", "judge", {}),
          () => api.updateSubmissionReview("project", 0, {}),
          () => api.submitFinalReview("project", "judge", {}),
          () => api.startFinalRound("admin"),
          () => api.syncFinalRoundWithResults("admin"),
          () => api.resetFinalRound("admin"),
          () => api.releaseSubmission("project"),
        ])
          await assert.rejects(operation, /published and locked/);
        assert.equal(writes, 1);
        record.fields["Published Results"] = "corrupted snapshot";
        await assert.rejects(
          () => api.getResultsReport(),
          /Refusing to recalculate/,
        );
        await assert.rejects(
          () => api.getFinalsState("judge"),
          /Refusing to recalculate/,
        );
      },
    );
  } finally {
    global.fetch = previousFetch;
    process.env = previousEnv;
  }
});

test("legacy metadata stays raw and event edits cannot change the policy or replace its scoring ledger", async () => {
  const previousFetch = global.fetch,
    previousEnv = { ...process.env };
  process.env.AIRTABLE_API_KEY = "integration-test-token";
  process.env.AIRTABLE_BASE_ID = "appTest";
  const record = {
    id: "event",
    fields: {
      Name: "Old event",
      Slug: "old-event",
      "Airtable Base ID": "appTest",
      "Airtable Table Name": "Submissions",
      "Airtable Reviews Table Name": "Reviews",
      Active: true,
    },
  };
  global.fetch = async (url, options = {}) => {
    assert.equal(options.method, undefined, "these checks must never write");
    if (String(url).includes("/Hackathons?"))
      return Response.json({ records: [record] });
    if (String(url).endsWith("/Hackathons/event")) return Response.json(record);
    throw new Error("Unexpected network call");
  };
  try {
    await withAirtableConfig(
      {
        hackathonId: "event",
        baseId: "appTest",
        tableName: "Submissions",
        reviewsTableName: "Reviews",
      },
      async () => {
        assert.equal(
          (await eventScoringRepository.read()).scoringPolicy,
          "raw-v1",
        );
        const input = {
          name: "Old event",
          slug: "old-event",
          baseId: "appTest",
          tableName: "Submissions",
          reviewsTableName: "Reviews",
        };
        await assert.rejects(
          () =>
            updateHackathon("event", {
              ...input,
              scoringPolicy: "normalized-v1",
            }),
          /fixed/,
        );
        await assert.rejects(
          () =>
            updateHackathon("event", { ...input, tableName: "Other table" }),
          /data sources are fixed/,
        );
      },
    );
    assert.equal(readScoringPolicy(undefined), "raw-v1");
  } finally {
    global.fetch = previousFetch;
    process.env = previousEnv;
  }
});

test("publication encoding enforces a size limit before any persistence", () => {
  const saved = snapshot();
  saved.results[0].reviews[0].notes = require("node:crypto")
    .randomBytes(150000)
    .toString("hex");
  assert.throws(() => encodePublication(saved), /storage limit/);
});

test("new event setup defaults to normalization but refuses to normalize an existing review history", async () => {
  const { createHackathon } = require("../lib/hackathons.ts");
  const originalFetch = global.fetch,
    originalEnv = { ...process.env };
  process.env.AIRTABLE_API_KEY = "integration-test-token";
  process.env.AIRTABLE_BASE_ID = "app12345678901234";
  delete process.env.AIRTABLE_TABLE_NAME;
  let history = false,
    created = 0;
  global.fetch = async (url, options = {}) => {
    const path = String(url);
    if (path.includes("/meta/bases/")) {
      if (options.method === "POST")
        return Response.json({ id: "tblReviews", ...JSON.parse(options.body) });
      return Response.json({ tables: [] });
    }
    if (path.includes("/Hackathons?")) return Response.json({ records: [] });
    if (path.endsWith("/Hackathons") && options.method === "POST") {
      created++;
      const body = JSON.parse(options.body);
      assert.equal(body.records[0].fields["Scoring Policy"], "normalized-v1");
      return Response.json({
        records: [{ id: "new-event", fields: body.records[0].fields }],
      });
    }
    if (path.includes("/Reviews?"))
      return Response.json({ records: history ? [{ id: "old-score" }] : [] });
    if (path.includes("/Submissions?")) return Response.json({ records: [] });
    throw new Error("Unexpected request: " + path);
  };
  try {
    const input = {
      name: "New Event",
      slug: "new-event",
      baseId: "app12345678901234",
      tableName: "Submissions",
      reviewsTableName: "Reviews",
    };
    const result = await createHackathon(input);
    assert.equal(result.scoringPolicy, "normalized-v1");
    assert.equal(created, 1);
    history = true;
    await assert.rejects(
      () => createHackathon({ ...input, slug: "imported-event" }),
      /already has scores/,
    );
    assert.equal(
      created,
      1,
      "an existing scored event must not be registered as normalized",
    );
  } finally {
    global.fetch = originalFetch;
    process.env = originalEnv;
  }
});

test("dashboard, results, and finalist preview honor the same event policy; published dashboard uses frozen scores", async () => {
  const { DashboardQuery } = require("../application/dashboard-query.ts");
  const { ResultsQuery } = require("../application/results-query.ts");
  const { FinalsService } = require("../application/finals-service.ts");
  const scores = [
    ["Generous top", "generous", 10],
    ["Generous middle", "generous", 9],
    ["Generous low", "generous", 8],
    ["Strict top", "strict", 7],
    ["Strict middle", "strict", 4],
    ["Strict low", "strict", 3],
  ];
  const submissions = scores.map(([id, judge, value]) => {
    const review = createReview(
      judge,
      { progress: value, practicality: value, complexity: value, notes: "" },
      "2026-01-01",
    );
    return {
      ...snapshot().results[0],
      id,
      projectName: id,
      reviews: [review],
      status: "completed",
      createdAt: "2026-01-01",
      totalScore: review.totalScore,
      finalJudging: null,
    };
  });
  const repository = () => ({ list: async () => structuredClone(submissions) });
  for (const policy of ["raw-v1", "normalized-v1"]) {
    const report = await new ResultsQuery(repository).report(policy);
    const dashboard = await new DashboardQuery(repository).execute(
      "admin",
      policy,
    );
    const finals = await new FinalsService(repository).state("admin", policy);
    assert.deepEqual(
      dashboard.leaderboard.map((r) => r.id),
      report.results.map((r) => r.id),
    );
    assert.deepEqual(
      finals.finalists.map((r) => r.id),
      report.results.map((r) => r.id),
    );
    assert.equal(
      report.results[0].id,
      policy === "raw-v1" ? "Generous top" : "Strict top",
    );
  }
  const saved = snapshot();
  saved.results[0].normalizedScore = 1.5;
  const dashboard = await new DashboardQuery(() => ({
    list: async () => [],
  })).execute("admin", saved.scoringPolicy, saved);
  assert.equal(dashboard.leaderboard[0].score, 1.5);
  assert.equal(dashboard.publishedAt, saved.publishedAt);
  assert.equal(dashboard.averageScore, 24);
});
