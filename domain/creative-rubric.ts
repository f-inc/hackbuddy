import type { EventSettings } from "./event-settings";
export const CREATIVE_RUBRIC = [
  {
    key: "originality",
    label: "Originality",
    weight: 25,
    low: "Fruit in bowl",
    middle: "A known task with a new angle",
    high: "Something nobody in the room had seen a robot do",
  },
  {
    key: "technicalDifficulty",
    label: "Technical difficulty",
    weight: 20,
    low: "Single pick and place",
    middle: "Multi-step, one object class",
    high: "Long horizon, deformables, tools, or bimanual coordination",
  },
  {
    key: "robustness",
    label: "Robustness",
    weight: 25,
    low: "Worked once, with help",
    middle: "Works most of the time",
    high: "Almost always works",
  },
  {
    key: "demoQuality",
    label: "Demo quality",
    weight: 20,
    low: "Doesn't work",
    middle: "Ran live with some issues",
    high: "Ran live first time, clear, under 3 minutes",
  },
  {
    key: "presentation",
    label: "Presentation",
    weight: 10,
    low: "Hard to follow what was built",
    middle: "Clear problem and result",
    high: "Clear problem, result, what failed, and what you would do next",
  },
] as const;
export type CreativeKey = (typeof CREATIVE_RUBRIC)[number]["key"];
export type CreativeScores = Record<CreativeKey, number> & {
  demoFormat: "live" | "video";
  hardwareNotes: string;
};
export const EMPTY_CREATIVE: CreativeScores = {
  originality: 0,
  technicalDifficulty: 0,
  robustness: 0,
  demoQuality: 0,
  presentation: 0,
  demoFormat: "live",
  hardwareNotes: "",
};
export function creativeTotal(scores: CreativeScores) {
  return CREATIVE_RUBRIC.reduce(
    (total, axis) => total + (scores[axis.key] * axis.weight) / 5,
    0,
  );
}
export function creativeError(value: unknown, draft = false): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return "Reload the form and score all five Creative rubric axes.";
  const s = value as CreativeScores;
  if (s.demoFormat !== "live" && s.demoFormat !== "video")
    return "Select live or video demo.";
  for (const axis of CREATIVE_RUBRIC) {
    const v = s[axis.key];
    if (!Number.isInteger(v) || v < (draft ? 0 : 1) || v > 5)
      return "Score every Creative rubric axis from 1 to 5.";
  }
  if (s.demoFormat === "video" && s.demoQuality > 3)
    return "Video demos are capped at 3 for Demo quality.";
  if (typeof s.hardwareNotes !== "string" || s.hardwareNotes.length > 5000)
    return "Hardware notes must be text up to 5,000 characters.";
  return null;
}
export function creativeScoring(settings: Partial<EventSettings>) {
  return settings.submissionForm === "makermods-physical-ai";
}
export function reviewMaximum(settings: EventSettings) {
  return creativeScoring(settings) ? 100 : 3 * settings.scoreMax;
}
