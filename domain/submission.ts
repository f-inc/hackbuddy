export type SubmissionFile = {
  id: string;
  field: string;
  filename: string;
  contentType: string;
  size: number;
  url: string;
};
export type QueueStatus = "available" | "in progress" | "completed";

export type ReviewPhase = "preliminary" | "final";

export type ReviewScores = {
  creative?: import("./creative-rubric").CreativeScores;
  progress: number;
  practicality: number;
  complexity: number;
  notes: string;
};

export type SubmissionReview = {
  creative?: import("./creative-rubric").CreativeScores;
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

export type SubmissionIdentity = {
  teamNumber?: string;
  id: string;
  teamName: string;
  projectName: string;
  track: string;
  createdAt: string;
};

export type SubmissionContact = {
  submitterNames: string;
  contactEmail: string;
  attendance: string;
};

export type SubmissionProject = {
  files?: SubmissionFile[];
  importedFields?: Record<string, unknown>;
  liveDemoUrl?: string;
  toolsUsed?: string[];
  progressOutline?: string;
  oneLiner: string;
  description: string;
  previewImageUrl: string;
  teamPhotoUrl: string;
  demoUrl: string;
  demoVideoUrl?: string;
  demoType: string;
  demoFilename: string;
  repositoryUrl: string;
};

export type SubmissionJudging = {
  judgeClaims?: Record<string, string>;
  status: QueueStatus;
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

export type Submission = SubmissionIdentity &
  SubmissionContact &
  SubmissionProject &
  SubmissionJudging;

export type ScoredSubmission = Submission & {
  progressScore: number;
  practicalityScore: number;
  complexityScore: number;
  totalScore: number;
};
