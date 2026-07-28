export type {
  FinalJudgingState,
  QueueStatus,
  ReviewPhase,
  ReviewScores,
  ScoredSubmission,
  Submission,
  SubmissionContact,
  SubmissionIdentity,
  SubmissionJudging,
  SubmissionProject,
  SubmissionReview,
} from "@/domain/submission";

import type { SubmissionReview } from "@/domain/submission";

export type QueueStats = {
  total: number;
  available: number;
  inProgress: number;
  completed: number;
};

export type LeaderboardEntry = {
  id: string;
  rank: number;
  teamName: string;
  projectName: string;
  track: string;
  score: number;
};

export type ScoreDistributionBucket = {
  label: string;
  min: number;
  max: number;
  count: number;
};

export type ActiveSession = {
  id: string;
  projectName: string;
  teamName: string;
  judgeName: string;
  claimedAt: string;
};

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
};

export type FinalistEntry = ResultEntry & {
  finalReviews: SubmissionReview[];
  reviewedByYou: boolean;
  fullyReviewed: boolean;
};

export type FinalsState = {
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
