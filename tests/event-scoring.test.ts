import assert from "node:assert/strict";
import test from "node:test";
import {
  assertSameScoringPolicy,
  NEW_EVENT_SCORING_POLICY,
  readScoringPolicy,
} from "../domain/event-scoring";
import {
  preliminaryRanking,
  selectFinalists,
  finalRanking,
} from "../domain/ranking";
import {
  publishedFinals,
  applyPublishedScores,
  validatePublication,
  type PublishedResults,
} from "../domain/publication";
import type { Submission } from "../domain/submission";
import { createReview, aggregateReviews } from "../domain/scoring";

function project(id: string, judge: string, value: number): Submission {
  const reviews = [
    createReview(
      judge,
      {
        progress: value,
        practicality: value,
        complexity: value,
        notes: "Original note",
      },
      "2026-01-01",
    ),
  ];
  const score = aggregateReviews(reviews);
  return {
    id,
    projectName: id,
    teamName: id,
    track: "",
    createdAt: "",
    submitterNames: "",
    contactEmail: "",
    attendance: "",
    oneLiner: "",
    description: "",
    previewImageUrl: "",
    teamPhotoUrl: "",
    demoUrl: "",
    demoType: "",
    demoFilename: "",
    repositoryUrl: "",
    status: "completed",
    claimedBy: "",
    claimedAt: "",
    completedAt: "2026-01-01",
    progressScore: score.progress,
    practicalityScore: score.practicality,
    complexityScore: score.complexity,
    totalScore: score.total,
    notes: score.notes,
    reviews,
    finalJudging: null,
  };
}

test("events without policy metadata keep raw scoring; only new events default to normalization", () => {
  for (const value of [undefined, null, ""])
    assert.equal(readScoringPolicy(value), "raw-v1");
  assert.equal(NEW_EVENT_SCORING_POLICY, "normalized-v1");
  assert.throws(() => readScoringPolicy("normalized-v99"), /Unsupported/);
  assert.throws(
    () => assertSameScoringPolicy("raw-v1", "normalized-v1"),
    /fixed/,
  );
  assert.doesNotThrow(() => assertSameScoringPolicy("raw-v1"));
});

test("legacy preliminaries retain raw totals and the original completion-time tie-break", () => {
  const a = project("A", "generous", 10),
    b = project("B", "strict", 7);
  const other = [
    project("C", "generous", 9),
    project("D", "generous", 8),
    project("E", "strict", 4),
    project("F", "strict", 3),
  ];
  const submissions = [a, b, ...other];
  assert.equal(preliminaryRanking(submissions).results[0].id, "A");
  assert.equal(
    preliminaryRanking(submissions, "normalized-v1").results[0].id,
    "B",
  );
  const tied = { ...a, id: "Z", projectName: "Z", completedAt: "2026-01-02" };
  assert.equal(selectFinalists([a, tied])[0].id, "Z");
  assert.equal(selectFinalists([a, tied], "normalized-v1")[0].id, "A");
});

test("legacy finals preserve raw sum ordering and alphabetical ties", () => {
  const rows = [
    project("B", "strict", 7),
    project("A", "generous", 10),
    project("C", "generous", 9),
  ].map((s) => ({ ...s, finalReviews: s.reviews }));
  assert.equal(finalRanking(rows)[0].id, "A");
  const tie = { ...rows[1], id: "D", projectName: "D" };
  assert.deepEqual(
    finalRanking([tie, rows[1]]).map((s) => s.id),
    ["A", "D"],
  );
});

function snapshot(): PublishedResults {
  const submission = project("Winner", "judge", 8);
  const ranking = preliminaryRanking([submission], "normalized-v1");
  const result = ranking.results[0];
  const finalist = {
    ...result,
    finalReviews: submission.reviews,
    finalNormalizedScore: 0,
    reviewedByYou: false,
    fullyReviewed: true,
  };
  return {
    schemaVersion: 1,
    scoringPolicy: "normalized-v1",
    publishedAt: "2026-01-02T00:00:00Z",
    publishedBy: "organizer",
    results: [result],
    normalization: ranking.diagnostics,
    finals: {
      scoringPolicy: "normalized-v1",
      publishedAt: "2026-01-02T00:00:00Z",
      started: true,
      canStart: true,
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

test("published results remain unchanged by later ledger changes or viewer personalization", () => {
  const saved = validatePublication(JSON.parse(JSON.stringify(snapshot())));
  const before = JSON.stringify(saved);
  const edited = project("Winner", "judge", 1);
  assert.notEqual(edited.totalScore, saved.results[0].totalScore);
  const judge = publishedFinals(saved, "judge"),
    outsider = publishedFinals(saved, "outsider");
  assert.equal(judge.finalists[0].reviewedByYou, true);
  assert.equal(outsider.finalists[0].reviewedByYou, false);
  assert.equal(outsider.eligibleJudge, false);
  assert.equal(judge.canStart, false);
  judge.finalists[0].totalScore = -100;
  assert.equal(JSON.stringify(saved), before);
});

test("invalid publication versions, policies, and incomplete finals fail instead of recalculating", () => {
  const saved = snapshot();
  assert.throws(
    () => validatePublication({ ...saved, schemaVersion: 2 }),
    /Invalid/,
  );
  assert.throws(
    () => validatePublication({ ...saved, scoringPolicy: "normalized-v99" }),
    /Unsupported/,
  );
  assert.throws(
    () =>
      validatePublication({
        ...saved,
        finals: { ...saved.finals, allComplete: false },
      }),
    /Invalid/,
  );
  assert.throws(
    () =>
      validatePublication({
        ...saved,
        finals: { ...saved.finals, scoringPolicy: "raw-v1" },
      }),
    /mismatch/,
  );
});

test("published scorecard drawers keep saved reviews when the live ledger changes", () => {
  const saved = snapshot();
  const live = project("Winner", "judge", 1);
  const restored = applyPublishedScores(live, saved);
  assert.equal(restored.totalScore, 24);
  assert.equal(restored.reviews[0].progressScore, 8);
  assert.equal(restored.finalJudging?.reviews[0].totalScore, 24);
  assert.equal(live.totalScore, 3);
});
