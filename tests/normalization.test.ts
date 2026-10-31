import assert from "node:assert/strict";
import test from "node:test";
import {
  createNormalizer,
  formatNormalizedScore,
} from "../domain/normalization";
import {
  preliminaryRanking,
  finalRanking,
  selectFinalists,
  selectWinners,
} from "../domain/ranking";
import { aggregateReviews, createReview } from "../domain/scoring";
import type { Submission, SubmissionReview } from "../domain/submission";

function review(
  judge: string,
  value: number,
  practicality = value,
  complexity = value,
) {
  return createReview(
    judge,
    { progress: value, practicality, complexity, notes: "Original notes" },
    "2026-01-01T00:00:00Z",
  );
}
function project(id: string, reviews: SubmissionReview[]): Submission {
  const aggregate = aggregateReviews(reviews);
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
    completedAt: "",
    progressScore: aggregate.progress,
    practicalityScore: aggregate.practicality,
    complexityScore: aggregate.complexity,
    totalScore: aggregate.total,
    notes: aggregate.notes,
    reviews,
    finalJudging: null,
  };
}
function near(a: number, b: number) {
  assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`);
}

test("generous and strict judges give equal relative weight to equivalent projects", () => {
  const groups = [6, 7, 8, 9, 10].map((value) => [
    review("generous", value),
    review("strict", value - 4),
  ]);
  const normalizer = createNormalizer(groups);
  near(
    normalizer.score([review("generous", 9)]),
    normalizer.score([review("strict", 5)]),
  );
  near(normalizer.score([review("generous", 8)]), 0);
  assert.ok(
    normalizer.score([review("strict", 6)]) >
      normalizer.score([review("generous", 9)]),
  );
});

test("different scoring ranges and criteria are calibrated independently", () => {
  const groups = Array.from({ length: 10 }, (_, i) => [
    review("narrow", i < 5 ? 9 : 10, 5, i < 5 ? 1 : 3),
    review("wide", i < 5 ? 1 : 9, 5, i < 5 ? 1 : 3),
  ]);
  const normalizer = createNormalizer(groups);
  assert.ok(normalizer.score([groups[9][0]]) > 0);
  assert.ok(normalizer.score([groups[9][1]]) < 1);
  // Flat practicality has no effect even though its raw value is five.
  const changed = groups.map((group) =>
    group.map((r) => ({ ...r, practicalityScore: 10 })),
  );
  near(
    normalizer.score(groups[9]),
    createNormalizer(changed).score(changed[9]),
  );
});

test("flat, one-review, empty and missing histories are neutral and finite", () => {
  const groups = [
    [review("flat", 10), review("single", 10)],
    [review("flat", 10)],
  ];
  const normalizer = createNormalizer(groups);
  for (const reviews of [...groups, [], [review("unknown", 9)]]) {
    assert.equal(normalizer.score(reviews), 0);
  }
  assert.equal(createNormalizer([]).score([]), 0);
});

test("small histories are dampened and tiny differences stay bounded", () => {
  const few = [review("judge", 9), review("judge", 10)];
  const many = Array.from({ length: 20 }, (_, i) => few[i % 2]);
  const smallScore = createNormalizer(few.map((r) => [r])).score([few[1]]);
  const largeScore = createNormalizer(many.map((r) => [r])).score([few[1]]);
  assert.ok(smallScore > 0 && smallScore < largeScore);
  assert.ok(largeScore <= 0.5);
});

test("project means do not reward extra reviews, and input reviews are preserved", () => {
  const groups = [
    [review("judge", 3)],
    [review("judge", 5)],
    [review("judge", 7)],
  ];
  const original = JSON.stringify(groups);
  const normalizer = createNormalizer(groups);
  near(
    normalizer.score(groups[2]),
    normalizer.score([...groups[2], ...groups[2]]),
  );
  assert.equal(JSON.stringify(groups), original);
});

test("normalized ranking overturns inflated raw totals and drives finalist selection", () => {
  const submissions = [
    project("Generous top", [review("generous", 10)]),
    project("Generous middle", [review("generous", 9)]),
    project("Generous low", [review("generous", 8)]),
    project("Strict top", [review("strict", 7)]),
    project("Strict middle", [review("strict", 4)]),
    project("Strict low", [review("strict", 3)]),
  ];
  const before = JSON.stringify(submissions);
  const ranking = preliminaryRanking(submissions, "normalized-v1");
  assert.equal(ranking.results[0].id, "Strict top");
  assert.equal(ranking.results[0].rawRank, 4);
  assert.deepEqual(
    selectFinalists(submissions, "normalized-v1"),
    ranking.results,
  );
  assert.equal(JSON.stringify(submissions), before);
});

test("incomplete projects calibrate judges but do not enter completed rankings", () => {
  const finished = project("finished", [review("judge", 10)]);
  const pending = {
    ...project("pending", [review("judge", 6)]),
    status: "available" as const,
  };
  const ranking = preliminaryRanking([finished, pending], "normalized-v1");
  assert.equal(ranking.results.length, 1);
  assert.ok(ranking.results[0].normalizedScore > 0);
  assert.equal(ranking.diagnostics.judges[0].reviewCount, 2);
});

test("events and final rounds use only their own reviews", () => {
  const submissions = [
    project("A", [review("judge", 10)]),
    project("B", [review("judge", 9)]),
  ];
  const finalists = submissions.map((s, i) => ({
    ...s,
    finalReviews: [review("judge", i ? 8 : 2)],
  }));
  const winners = selectWinners(finalists, "normalized-v1");
  assert.equal(winners[0].id, "B");
  assert.equal(
    preliminaryRanking(submissions, "normalized-v1").results[0].id,
    "A",
  );
  assert.equal(
    preliminaryRanking([submissions[0]], "normalized-v1").results[0]
      .normalizedScore,
    0,
  );
  assert.deepEqual(winners, finalRanking(finalists, "normalized-v1"));
});

test("diagnostics detect disconnected judge groups and missing original reviews", () => {
  const groups = [
    project("A", [review("a", 4), review("b", 5)]),
    project("B", [review("c", 6)]),
    project("legacy", []),
  ];
  const result = preliminaryRanking(groups, "normalized-v1");
  assert.equal(result.diagnostics.judgeGroups, 2);
  assert.equal(result.diagnostics.missingReviewProjects, 1);
  groups.push(project("bridge", [review("b", 4), review("c", 5)]));
  assert.equal(
    preliminaryRanking(groups, "normalized-v1").diagnostics.judgeGroups,
    1,
  );
});

test("ties are deterministic, independent of completion time or input order", () => {
  const a = project("A", [review("flat", 10)]);
  const b = {
    ...project("B", [review("flat", 10)]),
    completedAt: "2099-01-01",
  };
  assert.deepEqual(
    preliminaryRanking([b, a], "normalized-v1").results.map((s) => s.id),
    ["A", "B"],
  );
  assert.equal(formatNormalizedScore(-0.00001), "0.000");
  assert.equal(formatNormalizedScore(0.12345), "+0.123");
});
