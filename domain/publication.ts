import type { Submission } from "./submission";
import { aggregateReviews } from "./scoring";
import { readScoringPolicy, type ScoringPolicy } from "./event-scoring";
import type { ResultEntry, FinalsState } from "./results";
import type { NormalizationDiagnostics } from "./normalization";

export type PublishedResults = {
  schemaVersion: 1;
  scoringPolicy: ScoringPolicy;
  publishedAt: string;
  publishedBy: string;
  results: ResultEntry[];
  normalization: NormalizationDiagnostics;
  finals: FinalsState;
};

export function validatePublication(value: unknown): PublishedResults {
  if (!value || typeof value !== "object")
    throw new Error("Invalid published results snapshot.");
  const snapshot = value as PublishedResults;
  if (
    snapshot.schemaVersion !== 1 ||
    !snapshot.publishedAt ||
    !Number.isFinite(Date.parse(snapshot.publishedAt)) ||
    !snapshot.publishedBy ||
    !Array.isArray(snapshot.results) ||
    snapshot.finals?.allComplete !== true ||
    !Array.isArray(snapshot.finals.judges) ||
    !Array.isArray(snapshot.finals.finalists) ||
    !Array.isArray(snapshot.finals.topThree) ||
    !Array.isArray(snapshot.normalization?.judges)
  )
    throw new Error("Invalid published results snapshot.");
  const policy = readScoringPolicy(snapshot.scoringPolicy);
  if (!snapshot.scoringPolicy || snapshot.finals.scoringPolicy !== policy)
    throw new Error("Published scoring policy mismatch.");
  for (const result of [
    ...snapshot.results,
    ...snapshot.finals.finalists,
    ...snapshot.finals.topThree,
  ]) {
    if (
      !result.id ||
      typeof result.projectName !== "string" ||
      !Number.isFinite(result.totalScore) ||
      !Number.isFinite(result.normalizedScore) ||
      !Number.isFinite(result.progressScore) ||
      !Number.isFinite(result.practicalityScore) ||
      !Number.isFinite(result.complexityScore) ||
      !Array.isArray(result.reviews)
    ) {
      throw new Error("Invalid published ranking entry.");
    }
  }
  for (const finalist of [
    ...snapshot.finals.finalists,
    ...snapshot.finals.topThree,
  ]) {
    if (
      !Number.isFinite(finalist.finalNormalizedScore) ||
      !Array.isArray(finalist.finalReviews) ||
      !snapshot.finals.judges.every((judge) =>
        finalist.finalReviews.some((review) => review.judgeName === judge),
      )
    ) {
      throw new Error("Invalid published final scorecard.");
    }
  }
  return snapshot;
}

/** Personal review flags are derived without reordering or recalculating scores. */
export function publishedFinals(
  snapshot: PublishedResults,
  judgeName: string,
): FinalsState {
  const state = structuredClone(snapshot.finals);
  const personalize = (entry: FinalsState["finalists"][number]) => ({
    ...entry,
    reviewedByYou: entry.finalReviews.some(
      (review) => review.judgeName === judgeName,
    ),
  });
  return {
    ...state,
    publishedAt: snapshot.publishedAt,
    canStart: false,
    eligibleJudge: state.judges.includes(judgeName),
    finalists: state.finalists.map(personalize),
    topThree: state.topThree.map(personalize),
  };
}

/** Scorecard drawers show the same frozen scores as the published rankings. */
export function applyPublishedScores(
  submission: Submission,
  snapshot: PublishedResults,
): Submission {
  const result = snapshot.results.find((entry) => entry.id === submission.id);
  if (!result) return submission;
  const finalist = snapshot.finals.finalists.find(
    (entry) => entry.id === submission.id,
  );
  const saved = structuredClone(result);
  return {
    ...submission,
    ...saved,
    status: "completed",
    claimedBy: "",
    claimedAt: "",
    notes: aggregateReviews(saved.reviews).notes,
    finalJudging: finalist
      ? {
          startedAt: snapshot.finals.startedAt,
          judges: [...snapshot.finals.judges],
          reviews: structuredClone(finalist.finalReviews),
        }
      : null,
  };
}
