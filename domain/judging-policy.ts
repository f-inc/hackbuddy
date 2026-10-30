export const JUDGING_POLICY = {
  rubric: [
    {
      key: "progress",
      label: "Progress",
      description: "How complete and demonstrable the project is.",
    },
    {
      key: "practicality",
      label: "Practicality",
      description: "How useful and viable the project is.",
    },
    {
      key: "complexity",
      label: "Technical Complexity",
      description: "The depth and difficulty of the technical work.",
    },
  ],
  score: {
    min: 1,
    max: 10,
  },
  preliminary: {
    requiredReviews: 2,
  },
  finals: {
    finalistCount: 7,
    winnerCount: 3,
  },
} as const;

export type RubricKey = (typeof JUDGING_POLICY.rubric)[number]["key"];

export const RUBRIC = {
  progress: JUDGING_POLICY.rubric[0],
  practicality: JUDGING_POLICY.rubric[1],
  complexity: JUDGING_POLICY.rubric[2],
} satisfies Record<
  RubricKey,
  (typeof JUDGING_POLICY.rubric)[number]
>;

export const RUBRIC_SCORE_MAX =
  JUDGING_POLICY.rubric.length * JUDGING_POLICY.score.max;

export const PRELIMINARY_SCORE_MAX =
  RUBRIC_SCORE_MAX * JUDGING_POLICY.preliminary.requiredReviews;
