import { JUDGING_POLICY } from "./judging-policy";
import type {
  ScoredSubmission,
  Submission,
  SubmissionReview,
} from "./submission";

type PreliminaryRankEntry = {
  totalScore: number;
  completedAt: string;
  createdAt?: string;
  projectName: string;
};

export function comparePreliminaryRank(
  a: PreliminaryRankEntry,
  b: PreliminaryRankEntry,
) {
  if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
  const completedDifference =
    (Date.parse(b.completedAt || b.createdAt || "") || 0) -
    (Date.parse(a.completedAt || a.createdAt || "") || 0);
  if (completedDifference !== 0) return completedDifference;
  return a.projectName.localeCompare(b.projectName);
}

export function scoredCompleted(
  submissions: Submission[],
): ScoredSubmission[] {
  return submissions.filter(
    (submission): submission is ScoredSubmission =>
      submission.status === "completed" &&
      submission.progressScore !== null &&
      submission.practicalityScore !== null &&
      submission.complexityScore !== null &&
      submission.totalScore !== null,
  );
}

export function selectFinalists(submissions: Submission[]) {
  return scoredCompleted(submissions)
    .sort(comparePreliminaryRank)
    .slice(0, JUDGING_POLICY.finals.finalistCount);
}

function finalScore(reviews: SubmissionReview[]) {
  return reviews.reduce((total, review) => total + review.totalScore, 0);
}

export function selectWinners<T extends {
  projectName: string;
  finalReviews: SubmissionReview[];
}>(finalists: T[]) {
  return [...finalists]
    .sort((a, b) => {
      const difference =
        finalScore(b.finalReviews) - finalScore(a.finalReviews);
      return difference || a.projectName.localeCompare(b.projectName);
    })
    .slice(0, JUDGING_POLICY.finals.winnerCount);
}

