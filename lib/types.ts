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

export type { ResultEntry, FinalistEntry, FinalsState } from "@/domain/results";
