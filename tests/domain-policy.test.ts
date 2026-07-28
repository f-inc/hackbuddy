import assert from "node:assert/strict";
import test from "node:test";
import {
  JUDGING_POLICY,
  PRELIMINARY_SCORE_MAX,
  RUBRIC_SCORE_MAX,
} from "../domain/judging-policy";
import { selectFinalists, selectWinners } from "../domain/ranking";
import {
  aggregateReviews,
  createReview,
  isValidRubricScore,
  statusForReviewCount,
} from "../domain/scoring";
import type { Submission } from "../domain/submission";

function submission(id: string, totalScore: number): Submission {
  return {
    id,
    teamName: id,
    projectName: id,
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
    track: "General",
    status: "completed",
    createdAt: "2026-01-01T00:00:00.000Z",
    claimedBy: "",
    claimedAt: "",
    completedAt: "2026-01-01T01:00:00.000Z",
    progressScore: totalScore / 3,
    practicalityScore: totalScore / 3,
    complexityScore: totalScore / 3,
    totalScore,
    notes: "",
    reviews: [],
    finalJudging: null,
  };
}

test("policy derives score ceilings from the rubric", () => {
  assert.equal(
    RUBRIC_SCORE_MAX,
    JUDGING_POLICY.rubric.length * JUDGING_POLICY.score.max,
  );
  assert.equal(
    PRELIMINARY_SCORE_MAX,
    RUBRIC_SCORE_MAX * JUDGING_POLICY.preliminary.requiredReviews,
  );
});

test("rubric validation accepts only whole scores in policy range", () => {
  assert.equal(isValidRubricScore(JUDGING_POLICY.score.min), true);
  assert.equal(isValidRubricScore(JUDGING_POLICY.score.max), true);
  assert.equal(isValidRubricScore(JUDGING_POLICY.score.min - 1), false);
  assert.equal(isValidRubricScore(1.5), false);
  assert.equal(isValidRubricScore("10"), false);
});

test("reviews aggregate and complete only at the policy threshold", () => {
  const scores = {
    progress: 8,
    practicality: 7,
    complexity: 9,
    notes: "Strong demo",
  };
  const first = createReview(
    " Judge One ",
    scores,
    "2026-01-01T00:00:00.000Z",
  );
  const second = createReview(
    "judge-two",
    scores,
    "2026-01-01T01:00:00.000Z",
  );
  const aggregate = aggregateReviews([first, second]);

  assert.equal(first.judgeName, "judge one");
  assert.equal(first.totalScore, 24);
  assert.equal(aggregate.total, 48);
  assert.equal(
    statusForReviewCount(
      JUDGING_POLICY.preliminary.requiredReviews - 1,
    ),
    "available",
  );
  assert.equal(
    statusForReviewCount(JUDGING_POLICY.preliminary.requiredReviews),
    "completed",
  );
});

test("finalist and winner selection use policy counts", () => {
  const submissions = Array.from(
    { length: JUDGING_POLICY.finals.finalistCount + 4 },
    (_, index) => submission(`Project ${index + 1}`, index + 1),
  );
  const finalists = selectFinalists(submissions);
  assert.equal(finalists.length, JUDGING_POLICY.finals.finalistCount);
  assert.equal(
    finalists[0].totalScore,
    JUDGING_POLICY.finals.finalistCount + 4,
  );

  const winners = selectWinners(
    finalists.map((finalist, index) => ({
      ...finalist,
      finalReviews: [
        {
          judgeName: "judge",
          progressScore: 1,
          practicalityScore: 1,
          complexityScore: 1,
          totalScore: index + 1,
          notes: "",
          completedAt: "",
        },
      ],
    })),
  );
  assert.equal(winners.length, JUDGING_POLICY.finals.winnerCount);
});

