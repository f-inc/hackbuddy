import { PRELIMINARY_SCORE_MAX, RUBRIC_SCORE_MAX } from "./judging-policy";
import { preliminaryRanking, finalRanking } from "./ranking";
import type { ScoringPolicy } from "./event-scoring";
import type { PublishedResults } from "./publication";
import type { ReviewPhase, Submission, SubmissionReview } from "./submission";

export type PersonalReview = { phase: ReviewPhase; review: SubmissionReview };
export type JudgedProject = Pick<
  Submission,
  "id" | "projectName" | "teamName" | "track" | "oneLiner" | "teamPhotoUrl"
> & {
  scoringPolicy: ScoringPolicy;
  publishedAt: string;
  myReviews: PersonalReview[];
  reviewedAt: string;
  result: {
    score: number | null;
    normalizedScore: number | null;
    maximum: number;
    rank: number | null;
    complete: boolean;
  };
  finalResult: {
    score: number;
    normalizedScore: number | null;
    maximum: number;
    complete: boolean;
  } | null;
};

function belongsTo(review: SubmissionReview, judgeName: string) {
  return (
    review.judgeName.trim().toLowerCase() === judgeName.trim().toLowerCase()
  );
}

export function personalReviews(
  submission: Submission,
  judgeName: string,
): PersonalReview[] {
  return [
    ...submission.reviews
      .filter((r) => belongsTo(r, judgeName))
      .map((review) => ({ phase: "preliminary" as const, review })),
    ...(submission.finalJudging?.reviews ?? [])
      .filter((r) => belongsTo(r, judgeName))
      .map((review) => ({ phase: "final" as const, review })),
  ];
}

export function judgedProjects(
  submissions: Submission[],
  judgeName: string,
  policy: ScoringPolicy = "raw-v1",
  publication: PublishedResults | null = null,
): JudgedProject[] {
  const ranked =
    publication?.results ?? preliminaryRanking(submissions, policy).results;
  const ranks = new Map(ranked.map((s, index) => [s.id, index + 1]));
  const scores = new Map(ranked.map((s) => [s.id, s]));
  const finalScores =
    publication?.finals.finalists ??
    finalRanking(
      submissions
        .filter((s) => s.finalJudging && ranks.has(s.id))
        .map((s) => ({
          id: s.id,
          projectName: s.projectName,
          finalReviews: (s.finalJudging?.reviews ?? []).filter(
            (review) =>
              policy === "raw-v1" ||
              s.finalJudging?.judges.includes(review.judgeName),
          ),
        })),
      policy,
    );
  const finalScoreById = new Map(
    finalScores.map((s) => [s.id, s.finalNormalizedScore]),
  );
  return submissions
    .flatMap((submission): JudgedProject[] => {
      const myReviews = personalReviews(submission, judgeName);
      if (!myReviews.length) return [];
      const final = submission.finalJudging;
      const finalComplete = Boolean(
        final?.judges.length &&
        final.judges.every((judge) =>
          final.reviews.some((review) => belongsTo(review, judge)),
        ),
      );
      return [
        {
          scoringPolicy: policy,
          publishedAt: publication?.publishedAt ?? "",
          id: submission.id,
          projectName: submission.projectName,
          teamName: submission.teamName,
          track: submission.track,
          oneLiner: submission.oneLiner,
          teamPhotoUrl: submission.teamPhotoUrl,
          myReviews,
          reviewedAt:
            myReviews
              .map(({ review }) => review.completedAt)
              .sort()
              .at(-1) || "",
          result: {
            score: scores.get(submission.id)?.totalScore ?? null,
            normalizedScore:
              policy === "normalized-v1"
                ? (scores.get(submission.id)?.normalizedScore ?? null)
                : null,
            maximum: PRELIMINARY_SCORE_MAX,
            rank: ranks.get(submission.id) ?? null,
            complete: ranks.has(submission.id),
          },
          finalResult: final
            ? {
                score: final.reviews.reduce(
                  (sum, review) => sum + review.totalScore,
                  0,
                ),
                normalizedScore:
                  policy === "normalized-v1"
                    ? (finalScoreById.get(submission.id) ?? null)
                    : null,
                maximum: final.judges.length * RUBRIC_SCORE_MAX,
                complete: finalComplete,
              }
            : null,
        },
      ];
    })
    .sort(
      (a, b) =>
        b.reviewedAt.localeCompare(a.reviewedAt) ||
        a.projectName.localeCompare(b.projectName),
    );
}

/** Return only this judge's review notes, even when the project has other reviewers. */
export function reviewedSubmission(
  submission: Submission,
  judgeName: string,
): Submission | null {
  const reviews = personalReviews(submission, judgeName);
  if (!reviews.length) return null;
  return {
    ...submission,
    notes: "",
    reviews: reviews
      .filter((r) => r.phase === "preliminary")
      .map((r) => r.review),
    finalJudging: submission.finalJudging
      ? {
          ...submission.finalJudging,
          reviews: reviews
            .filter((r) => r.phase === "final")
            .map((r) => r.review),
        }
      : null,
  };
}
