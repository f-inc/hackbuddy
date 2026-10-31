import type { ScoringPolicy } from "./event-scoring";
import { JUDGING_POLICY } from "./judging-policy";
import { createNormalizer } from "./normalization";
import type {
  ScoredSubmission,
  Submission,
  SubmissionReview,
} from "./submission";

export type RankedSubmission = ScoredSubmission & {
  normalizedScore: number;
  rawRank: number;
};

export function comparePreliminaryRank(
  a: { normalizedScore: number; projectName: string; id: string },
  b: { normalizedScore: number; projectName: string; id: string },
) {
  const difference = b.normalizedScore - a.normalizedScore;
  return (
    (Math.abs(difference) > 1e-10 ? difference : 0) ||
    a.projectName.localeCompare(b.projectName) ||
    a.id.localeCompare(b.id)
  );
}

/** Preserve the original timestamp tie-break for legacy events. */
export function compareRawRank(
  a: {
    totalScore: number;
    completedAt: string;
    createdAt?: string;
    projectName: string;
  },
  b: {
    totalScore: number;
    completedAt: string;
    createdAt?: string;
    projectName: string;
  },
) {
  return (
    b.totalScore - a.totalScore ||
    (Date.parse(b.completedAt || b.createdAt || "") || 0) -
      (Date.parse(a.completedAt || a.createdAt || "") || 0) ||
    a.projectName.localeCompare(b.projectName)
  );
}

export function scoredCompleted(submissions: Submission[]): ScoredSubmission[] {
  return submissions.filter(
    (submission): submission is ScoredSubmission =>
      submission.status === "completed" &&
      submission.progressScore !== null &&
      submission.practicalityScore !== null &&
      submission.complexityScore !== null &&
      submission.totalScore !== null,
  );
}

export function preliminaryRanking(
  submissions: Submission[],
  policy: ScoringPolicy = "raw-v1",
) {
  const normalizer = createNormalizer(
    submissions.map((submission) => submission.reviews),
  );
  const completed = scoredCompleted(submissions);
  const rawRanks = new Map(
    [...completed]
      .sort(compareRawRank)
      .map((submission, index) => [submission.id, index + 1]),
  );
  const results: RankedSubmission[] = completed
    .map((submission) => ({
      ...submission,
      normalizedScore: normalizer.score(submission.reviews),
      rawRank: rawRanks.get(submission.id)!,
    }))
    .sort(policy === "raw-v1" ? compareRawRank : comparePreliminaryRank);
  return {
    results,
    diagnostics: {
      judges: normalizer.judges,
      judgeGroups: normalizer.judgeGroups,
      missingReviewProjects: completed.filter(
        (submission) => !submission.reviews.length,
      ).length,
    },
  };
}

export function selectFinalists(
  submissions: Submission[],
  policy: ScoringPolicy = "raw-v1",
) {
  return preliminaryRanking(submissions, policy).results.slice(
    0,
    JUDGING_POLICY.finals.finalistCount,
  );
}

export function finalRanking<
  T extends {
    id: string;
    projectName: string;
    finalReviews: SubmissionReview[];
  },
>(finalists: T[], policy: ScoringPolicy = "raw-v1") {
  const normalizer = createNormalizer(
    finalists.map((finalist) => finalist.finalReviews),
  );
  return finalists
    .map((finalist) => ({
      ...finalist,
      finalNormalizedScore: normalizer.score(finalist.finalReviews),
    }))
    .sort((a, b) =>
      policy === "raw-v1"
        ? b.finalReviews.reduce((sum, review) => sum + review.totalScore, 0) -
            a.finalReviews.reduce(
              (sum, review) => sum + review.totalScore,
              0,
            ) || a.projectName.localeCompare(b.projectName)
        : comparePreliminaryRank(
            { ...a, normalizedScore: a.finalNormalizedScore },
            { ...b, normalizedScore: b.finalNormalizedScore },
          ),
    );
}

export function selectWinners<
  T extends {
    id: string;
    projectName: string;
    finalReviews: SubmissionReview[];
  },
>(finalists: T[], policy: ScoringPolicy = "raw-v1") {
  return finalRanking(finalists, policy).slice(
    0,
    JUDGING_POLICY.finals.winnerCount,
  );
}
