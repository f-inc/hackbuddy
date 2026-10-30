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
  const journal = [];
  global.fetch = async (url, options = {}) => {
    assert.equal(
      options.headers.Authorization,
      "Bearer integration-test-token",
    );
    if (String(url).endsWith("/Hackathons/event")) {
      assert.notEqual(
        options.method,
        "PATCH",
        "published registry fields must never be overwritten",
      );
      return Response.json(record);
    }
    if (String(url).includes("/HackBuddy%20Publications")) {
      if (options.method === "POST") {
        writes++;
        journal.push({
          id: `publication-${writes}`,
          fields: {
            ...JSON.parse(options.body).records[0].fields,
            Sequence: writes,
          },
        });
      }
      return Response.json({ records: journal.slice(0, 1) });
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
        assert.ok(journal[0].fields.Snapshot.startsWith("gzip-v1:"));
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
        journal[0].fields.Snapshot = "corrupted snapshot";
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
    if (String(url).includes("/HackBuddy%20Publications"))
      return Response.json({ records: [] });
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

test("personal judge history follows official policy and keeps published scorecards private and frozen", async () => {
  const {
    JudgedProjectsQuery,
  } = require("../application/judged-projects-query.ts");
  const { preliminaryRanking } = require("../domain/ranking.ts");
  const saved = snapshot();
  const live = {
    ...saved.results[0],
    status: "completed",
    finalJudging: {
      startedAt: saved.finals.startedAt,
      judges: ["judge"],
      reviews: [
        {
          ...saved.finals.finalists[0].finalReviews[0],
          totalScore: 3,
          progressScore: 1,
          practicalityScore: 1,
          complexityScore: 1,
        },
      ],
    },
    totalScore: 3,
    reviews: [
      {
        ...saved.results[0].reviews[0],
        progressScore: 1,
        totalScore: 3,
        notes: "Edited after publication",
      },
    ],
  };
  const query = new JudgedProjectsQuery(() => ({ list: async () => [live] }));
  const result = await query.execute(
    "judge",
    "project",
    saved.scoringPolicy,
    saved,
  );
  assert.equal(result.project.result.score, 24);
  assert.equal(result.project.result.rank, 1);
  assert.equal(result.project.publishedAt, saved.publishedAt);
  assert.equal(result.submission.reviews[0].notes, "Saved note");
  assert.equal(result.project.finalResult.score, 24);
  assert.equal(
    await query.execute("other judge", "project", saved.scoringPolicy, saved),
    null,
  );
  for (const policy of ["raw-v1", "normalized-v1"]) {
    const expected = preliminaryRanking([live], policy).results[0];
    const history = await query.execute("judge", undefined, policy);
    assert.equal(history.projects[0].result.rank, 1);
    assert.equal(
      history.projects[0].result.normalizedScore,
      policy === "normalized-v1" ? expected.normalizedScore : null,
    );
  }
});

test("concurrent event reads do not mix scoring policies or published snapshots", async () => {
  const originalFetch = global.fetch,
    originalEnv = { ...process.env };
  process.env.AIRTABLE_API_KEY = "integration-test-token";
  process.env.AIRTABLE_BASE_ID = "appTest";
  const saved = snapshot();
  global.fetch = async (url) => {
    if (String(url).includes("/HackBuddy%20Publications"))
      return Response.json({ records: [] });
    const id = String(url).split("/").at(-1);
    await new Promise((resolve) =>
      setTimeout(resolve, id === "event-a" ? 10 : 1),
    );
    return Response.json({
      id,
      fields:
        id === "event-a"
          ? {}
          : {
              "Scoring Policy": "normalized-v1",
              "Published Results": encodePublication(saved),
            },
    });
  };
  try {
    const reads = await Promise.all(
      ["event-a", "event-b"].map((hackathonId) =>
        withAirtableConfig(
          {
            hackathonId,
            baseId: "appTest",
            tableName: "Submissions",
            reviewsTableName: "Reviews",
          },
          () => eventScoringRepository.read(),
        ),
      ),
    );
    assert.equal(reads[0].scoringPolicy, "raw-v1");
    assert.equal(reads[0].publication, null);
    assert.equal(reads[1].scoringPolicy, "normalized-v1");
    assert.equal(reads[1].publication.publishedAt, saved.publishedAt);
  } finally {
    global.fetch = originalFetch;
    process.env = originalEnv;
  }
});

test("concurrent publishers across requests cannot overwrite the first official snapshot", async () => {
  const originalFetch = global.fetch,
    originalEnv = { ...process.env };
  process.env.AIRTABLE_API_KEY = "integration-test-token";
  process.env.AIRTABLE_BASE_ID = "appTest";
  const journal = [];
  let initialReads = 0;
  global.fetch = async (url, options = {}) => {
    if (String(url).endsWith("/Hackathons/event")) {
      assert.notEqual(options.method, "PATCH");
      return Response.json({
        id: "event",
        fields: { "Scoring Policy": "normalized-v1" },
      });
    }
    assert.ok(String(url).includes("/HackBuddy%20Publications"));
    if (options.method === "POST") {
      const sequence = journal.length + 1;
      journal.push({
        id: `publication-${sequence}`,
        fields: {
          ...JSON.parse(options.body).records[0].fields,
          Sequence: sequence,
        },
      });
      if (sequence === 1)
        await new Promise((resolve) => setTimeout(resolve, 10));
      return Response.json({ records: [journal[sequence - 1]] });
    }
    // Both server requests see an empty journal before either inserts.
    if (++initialReads <= 4) return Response.json({ records: [] });
    return Response.json({ records: journal.slice(0, 1) });
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
        const first = { ...snapshot(), publishedBy: "first-admin" };
        const second = {
          ...snapshot(),
          publishedBy: "second-admin",
          publishedAt: "2026-01-03T00:00:00Z",
        };
        const results = await Promise.all([
          eventScoringRepository.publish(first),
          eventScoringRepository.publish(second),
        ]);
        assert.equal(
          journal.length,
          2,
          "the fixture must exercise two competing inserts",
        );
        assert.deepEqual(results[0], results[1]);
        assert.equal(results[0].publishedBy, "first-admin");
        await eventScoringRepository.publish(second);
        assert.equal(
          journal.length,
          2,
          "subsequent publication must not append or replace",
        );
        assert.equal(
          (await eventScoringRepository.read()).publication.publishedBy,
          "first-admin",
        );
      },
    );
  } finally {
    global.fetch = originalFetch;
    process.env = originalEnv;
  }
});
