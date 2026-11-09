import type {
  FinalJudgingState,
  ReviewPhase,
  Submission,
  SubmissionReview,
} from "@/domain/submission";

export interface SubmissionRepository {
  readonly demoMode: boolean;
  list(judgeName?: string): Promise<Submission[]>;
  findById(id: string, judgeName?: string): Promise<Submission | null>;
  tryClaim(id: string, judgeName: string): Promise<Submission | null>;
  saveReview(
    id: string,
    phase: ReviewPhase,
    review: SubmissionReview,
  ): Promise<void>;
  savePreliminaryProjection(
    id: string,
    reviews: SubmissionReview[],
    completedAt: string,
  ): Promise<void>;
  deleteReviews(phase: ReviewPhase): Promise<void>;
  setFinalState(id: string, state: FinalJudgingState): Promise<void>;
  clearFinalState(id: string): Promise<void>;
  release(id: string, judgeName?: string): Promise<void>;
}

export type SubmissionRepositoryProvider = () => SubmissionRepository;

