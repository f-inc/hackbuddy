import type { SubmissionRepositoryProvider } from "./ports/submission-repository";
import {
  createReview,
  hasReviewBy,
} from "@/domain/scoring";
import type { ReviewScores, Submission } from "@/domain/submission";
import type { QueueStats } from "@/lib/types";
import {
  ConflictError,
  NotFoundError,
} from "@/server/http/errors";

const CLAIM_ATTEMPT_LIMIT = 10;

export function queueStats(submissions: Submission[]): QueueStats {
  return submissions.reduce<QueueStats>(
    (stats, submission) => {
      stats.total += 1;
      if (submission.status === "available") stats.available += 1;
      if (submission.status === "in progress") stats.inProgress += 1;
      if (submission.status === "completed") stats.completed += 1;
      return stats;
    },
    { total: 0, available: 0, inProgress: 0, completed: 0 },
  );
}

export class QueueService {
  constructor(private readonly repository: SubmissionRepositoryProvider) {}

  isDemoMode() {
    return this.repository().demoMode;
  }

  async getStats() {
    return queueStats(await this.repository().list());
  }

  async claimNext(judgeName: string) {
    const repository = this.repository();
    const submissions = await repository.list();
    const existing = submissions.find(
      (submission) =>
        submission.status === "in progress" &&
        submission.claimedBy === judgeName &&
        !hasReviewBy(submission.reviews, judgeName),
    );
    if (existing) return existing;

    const available = submissions
      .filter(
        (submission) =>
          submission.status === "available" &&
          !hasReviewBy(submission.reviews, judgeName),
      )
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

    for (const candidate of available.slice(0, CLAIM_ATTEMPT_LIMIT)) {
      const claimed = await repository.tryClaim(candidate.id, judgeName);
      if (claimed) return claimed;
    }
    return null;
  }

  async complete(id: string, judgeName: string, scores: ReviewScores) {
    const repository = this.repository();
    const submission = await repository.findById(id);
    if (!submission) throw new NotFoundError("Submission not found.");
    if (
      submission.status !== "in progress" ||
      submission.claimedBy !== judgeName
    ) {
      throw new ConflictError("This submission is not assigned to you.");
    }
    if (hasReviewBy(submission.reviews, judgeName)) {
      throw new ConflictError(
        "You have already reviewed this submission.",
      );
    }

    const completedAt = new Date().toISOString();
    await repository.saveReview(
      id,
      "preliminary",
      createReview(judgeName, scores, completedAt),
    );
    const persisted = await repository.findById(id);
    if (!persisted) throw new NotFoundError("Submission not found.");
    await repository.savePreliminaryProjection(
      id,
      persisted.reviews,
      completedAt,
    );
  }
}
