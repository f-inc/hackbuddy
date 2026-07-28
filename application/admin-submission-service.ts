import type { SubmissionRepositoryProvider } from "./ports/submission-repository";
import { createReview } from "@/domain/scoring";
import type { ReviewScores } from "@/domain/submission";
import {
  ConflictError,
  NotFoundError,
} from "@/server/http/errors";

export class AdminSubmissionService {
  constructor(private readonly repository: SubmissionRepositoryProvider) {}

  async updateReview(
    id: string,
    reviewIndex: number,
    scores: ReviewScores,
  ) {
    const repository = this.repository();
    const submission = await repository.findById(id);
    if (!submission) throw new NotFoundError("Submission not found.");
    if (submission.status === "in progress") {
      throw new ConflictError(
        "Release the active session before editing its score.",
      );
    }
    const existing = submission.reviews[reviewIndex];
    if (!existing) {
      throw new ConflictError(
        "This submission does not have a review to edit.",
      );
    }
    const review = {
      ...createReview(existing.judgeName, scores, existing.completedAt),
      completedAt: existing.completedAt,
    };
    await repository.saveReview(id, "preliminary", review);
    const persisted = await repository.findById(id);
    if (!persisted) throw new NotFoundError("Submission not found.");
    await repository.savePreliminaryProjection(
      id,
      persisted.reviews,
      persisted.completedAt || new Date().toISOString(),
    );
    return repository.findById(id);
  }

  async release(id: string) {
    await this.repository().release(id);
  }
}

