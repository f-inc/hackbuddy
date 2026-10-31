import { JUDGING_POLICY } from "./judging-policy";
import type { SubmissionReview } from "./submission";

const SCORE_FIELDS = [
  "progressScore",
  "practicalityScore",
  "complexityScore",
] as const;
type ScoreField = (typeof SCORE_FIELDS)[number];

// Five prior reviews dampen small samples. A one-point floor prevents a
// judge's 9/10-only scores from turning tiny differences into large signals.
export const NORMALIZATION_POLICY = {
  priorReviews: 5,
  minimumStandardDeviation: 1,
  lowSampleReviews: 5,
} as const;

export type JudgeScoringStats = {
  judgeName: string;
  reviewCount: number;
  criteria: Record<ScoreField, { mean: number; standardDeviation: number }>;
};

export type NormalizationDiagnostics = {
  judges: JudgeScoringStats[];
  judgeGroups: number;
  missingReviewProjects: number;
};

export function judgeKey(name: string) {
  return name.trim().toLowerCase();
}

/** Input must contain reviews from one event and one judging round only. */
export function createNormalizer(reviewGroups: SubmissionReview[][]) {
  const byJudge = new Map<string, SubmissionReview[]>();
  const neighbours = new Map<string, Set<string>>();
  for (const reviews of reviewGroups) {
    const names = reviews.map((review) => judgeKey(review.judgeName));
    for (const review of reviews) {
      const name = judgeKey(review.judgeName);
      const history = byJudge.get(name) ?? [];
      history.push(review);
      byJudge.set(name, history);
      const links = neighbours.get(name) ?? new Set<string>();
      names.forEach((peer) => links.add(peer));
      neighbours.set(name, links);
    }
  }
  const judges: JudgeScoringStats[] = [...byJudge]
    .map(([judgeName, reviews]) => ({
      judgeName,
      reviewCount: reviews.length,
      criteria: Object.fromEntries(
        SCORE_FIELDS.map((field) => {
          const mean =
            reviews.reduce((sum, review) => sum + review[field], 0) /
            reviews.length;
          const variance =
            reviews.reduce(
              (sum, review) => sum + (review[field] - mean) ** 2,
              0,
            ) / reviews.length;
          return [field, { mean, standardDeviation: Math.sqrt(variance) }];
        }),
      ) as JudgeScoringStats["criteria"],
    }))
    .sort((a, b) => a.judgeName.localeCompare(b.judgeName));
  const stats = new Map(judges.map((judge) => [judge.judgeName, judge]));
  const count = judges.reduce((sum, judge) => sum + judge.reviewCount, 0);
  // Pool within-judge variance so generous/strict judge means do not inflate it.
  const pooledVariance = Object.fromEntries(
    SCORE_FIELDS.map((field) => [
      field,
      count
        ? judges.reduce(
            (sum, judge) =>
              sum +
              judge.reviewCount * judge.criteria[field].standardDeviation ** 2,
            0,
          ) / count
        : 0,
    ]),
  ) as Record<ScoreField, number>;

  const visited = new Set<string>();
  let judgeGroups = 0;
  for (const name of byJudge.keys()) {
    if (visited.has(name)) continue;
    judgeGroups++;
    const pending = [name];
    while (pending.length) {
      const next = pending.pop()!;
      if (visited.has(next)) continue;
      visited.add(next);
      for (const peer of neighbours.get(next) ?? []) {
        if (!visited.has(peer)) pending.push(peer);
      }
    }
  }

  function score(reviews: SubmissionReview[]) {
    if (!reviews.length) return 0;
    const total = reviews.reduce((sum, review) => {
      const judge = stats.get(judgeKey(review.judgeName));
      if (!judge || judge.reviewCount < 2) return sum;
      const weight =
        judge.reviewCount /
        (judge.reviewCount + NORMALIZATION_POLICY.priorReviews);
      const relative =
        SCORE_FIELDS.reduce((subtotal, field) => {
          const { mean, standardDeviation } = judge.criteria[field];
          if (standardDeviation === 0) return subtotal;
          const spread = Math.max(
            NORMALIZATION_POLICY.minimumStandardDeviation,
            Math.sqrt(
              weight * standardDeviation ** 2 +
                (1 - weight) * pooledVariance[field],
            ),
          );
          return subtotal + (weight * (review[field] - mean)) / spread;
        }, 0) / JUDGING_POLICY.rubric.length;
      return sum + relative;
    }, 0);
    // Equal contribution per review, independent of the number of reviews a
    // judge completed. Flat criteria and insufficient histories are neutral.
    return total / reviews.length;
  }

  return { score, judges, judgeGroups };
}

export function formatNormalizedScore(value: number) {
  const rounded = Math.abs(value) < 0.0005 ? 0 : value;
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(3)}`;
}
