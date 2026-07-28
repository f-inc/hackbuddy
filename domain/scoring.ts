import { JUDGING_POLICY } from "./judging-policy";
import type {
  QueueStatus,
  ReviewScores,
  SubmissionReview,
} from "./submission";

export type ScoreAggregate = {
  progress: number;
  practicality: number;
  complexity: number;
  total: number;
  notes: string;
};

export function isValidRubricScore(value: unknown): value is number {
  return (
    Number.isInteger(value) &&
    Number(value) >= JUDGING_POLICY.score.min &&
    Number(value) <= JUDGING_POLICY.score.max
  );
}

export function createReview(
  judgeName: string,
  scores: ReviewScores,
  completedAt: string,
): SubmissionReview {
  return {
    judgeName: judgeName.trim().toLowerCase(),
    progressScore: scores.progress,
    practicalityScore: scores.practicality,
    complexityScore: scores.complexity,
    totalScore: scores.progress + scores.practicality + scores.complexity,
    notes: scores.notes.trim(),
    completedAt,
  };
}

export function aggregateReviews(
  reviews: SubmissionReview[],
): ScoreAggregate {
  const totals = reviews.reduce(
    (aggregate, review) => ({
      progress: aggregate.progress + review.progressScore,
      practicality:
        aggregate.practicality + review.practicalityScore,
      complexity: aggregate.complexity + review.complexityScore,
      total: aggregate.total + review.totalScore,
    }),
    { progress: 0, practicality: 0, complexity: 0, total: 0 },
  );

  return {
    ...totals,
    notes: reviews
      .map((review) =>
        review.notes ? `${review.judgeName}: ${review.notes}` : "",
      )
      .filter(Boolean)
      .join("\n\n"),
  };
}

export function statusForReviewCount(
  reviewCount: number,
  activelyClaimed = false,
): QueueStatus {
  if (activelyClaimed) return "in progress";
  return reviewCount >= JUDGING_POLICY.preliminary.requiredReviews
    ? "completed"
    : "available";
}

export function hasReviewBy(
  reviews: SubmissionReview[],
  judgeName: string,
) {
  const normalizedJudge = judgeName.trim().toLowerCase();
  return reviews.some((review) => review.judgeName === normalizedJudge);
}

