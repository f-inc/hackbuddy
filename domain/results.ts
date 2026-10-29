import type { SubmissionReview } from "./submission";
import type { ScoringPolicy } from "./event-scoring";

export type ResultEntry = {
  id: string;
  teamName: string;
  projectName: string;
  oneLiner: string;
  submitterNames: string;
  teamPhotoUrl: string;
  track: string;
  reviews: SubmissionReview[];
  progressScore: number;
  practicalityScore: number;
  complexityScore: number;
  totalScore: number;
  completedAt: string;
  normalizedScore: number;
  rawRank: number;
};

export type FinalistEntry = ResultEntry & {
  finalReviews: SubmissionReview[];
  finalNormalizedScore: number;
  reviewedByYou: boolean;
  fullyReviewed: boolean;
};

export type FinalsState = {
  scoringPolicy: ScoringPolicy;
  publishedAt: string;
  started: boolean;
  canStart: boolean;
  startedAt: string;
  judges: string[];
  eligibleJudge: boolean;
  finalists: FinalistEntry[];
  completedReviews: number;
  requiredReviews: number;
  allComplete: boolean;
  topThree: FinalistEntry[];
};
