export type QueueStatus = "available" | "in progress" | "completed";

export type SubmissionReview = {
  judgeName: string;
  progressScore: number;
  practicalityScore: number;
  complexityScore: number;
  totalScore: number;
  notes: string;
  completedAt: string;
};

export type FinalJudgingState = {
  startedAt: string;
  judges: string[];
  reviews: SubmissionReview[];
};

export type Submission = {
  id: string;
  teamName: string;
  projectName: string;
  submitterNames: string;
  contactEmail: string;
  attendance: string;
  oneLiner: string;
  description: string;
  previewImageUrl: string;
  teamPhotoUrl: string;
  demoUrl: string;
  demoType: string;
  demoFilename: string;
  repositoryUrl: string;
  track: string;
  status: QueueStatus;
  createdAt: string;
  claimedBy: string;
  claimedAt: string;
  completedAt: string;
  progressScore: number | null;
  practicalityScore: number | null;
  complexityScore: number | null;
  totalScore: number | null;
  notes: string;
  reviews: SubmissionReview[];
  finalJudging: FinalJudgingState | null;
};

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
