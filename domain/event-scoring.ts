export const SCORING_POLICIES = ["raw-v1", "normalized-v1"] as const;
export type ScoringPolicy = (typeof SCORING_POLICIES)[number];
export const NEW_EVENT_SCORING_POLICY: ScoringPolicy = "normalized-v1";

/** Missing metadata always means historical raw scoring. Unknown versions fail closed. */
export function readScoringPolicy(value: unknown): ScoringPolicy {
  if (value === undefined || value === null || value === "") return "raw-v1";
  if (value === "raw-v1" || value === "normalized-v1") return value;
  throw new Error(
    "Unsupported scoring policy. Refusing to recalculate this event.",
  );
}

export function scoringPolicyLabel(policy: ScoringPolicy) {
  return policy === "raw-v1" ? "Original raw scoring" : "Normalized scoring";
}

export function assertSameScoringPolicy(
  existing: ScoringPolicy,
  requested?: ScoringPolicy,
) {
  if (requested !== undefined && existing !== requested) {
    throw new Error(
      "The scoring method is fixed when an event is created. Create a new event to use another method.",
    );
  }
}
