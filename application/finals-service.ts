import type { SubmissionRepositoryProvider } from "./ports/submission-repository";
import {
  comparePreliminaryRank,
  scoredCompleted,
  selectFinalists,
  selectWinners,
} from "@/domain/ranking";
import { createReview } from "@/domain/scoring";
import type {
  FinalJudgingState,
  ReviewScores,
  ScoredSubmission,
} from "@/domain/submission";
import type { FinalistEntry, FinalsState } from "@/lib/types";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/server/http/errors";

function finalistEntry(
  submission: ScoredSubmission,
  judgeName: string,
  judges: string[],
): FinalistEntry {
  const finalReviews = submission.finalJudging?.reviews ?? [];
  return {
    id: submission.id,
    teamName: submission.teamName,
    projectName: submission.projectName,
    oneLiner: submission.oneLiner,
    submitterNames: submission.submitterNames,
    teamPhotoUrl: submission.teamPhotoUrl,
    track: submission.track,
    reviews: submission.reviews,
    progressScore: submission.progressScore,
    practicalityScore: submission.practicalityScore,
    complexityScore: submission.complexityScore,
    totalScore: submission.totalScore,
    completedAt: submission.completedAt,
    finalReviews,
    reviewedByYou: finalReviews.some(
      (review) => review.judgeName === judgeName,
    ),
    fullyReviewed:
      judges.length > 0 &&
      judges.every((judge) =>
        finalReviews.some((review) => review.judgeName === judge),
      ),
  };
}

export class FinalsService {
  constructor(private readonly repository: SubmissionRepositoryProvider) {}

  async state(judgeName: string): Promise<FinalsState> {
    const submissions = await this.repository().list();
    const completed = scoredCompleted(submissions);
    const frozen = completed.filter(
      (submission) => submission.finalJudging,
    );
    const canStart = completed.length > 0;

    if (!frozen.length) {
      const preview = selectFinalists(submissions);
      const judges = Array.from(
        new Set(
          completed
            .flatMap((submission) => submission.reviews)
            .map((review) => review.judgeName)
            .filter(Boolean),
        ),
      ).sort();
      return {
        started: false,
        canStart,
        startedAt: "",
        judges,
        eligibleJudge: judges.includes(judgeName),
        finalists: preview.map((submission) =>
          finalistEntry(submission, judgeName, judges),
        ),
        completedReviews: 0,
        requiredReviews: preview.length * judges.length,
        allComplete: false,
        topThree: [],
      };
    }

    const judges = frozen[0].finalJudging?.judges ?? [];
    const finalists = frozen
      .map((submission) => finalistEntry(submission, judgeName, judges))
      .sort(comparePreliminaryRank);
    const completedReviews = finalists.reduce(
      (total, finalist) =>
        total +
        finalist.finalReviews.filter((review) =>
          judges.includes(review.judgeName),
        ).length,
      0,
    );
    const requiredReviews = finalists.length * judges.length;
    const allComplete =
      requiredReviews > 0 && completedReviews >= requiredReviews;

    return {
      started: true,
      canStart,
      startedAt: frozen[0].finalJudging?.startedAt ?? "",
      judges,
      eligibleJudge: judges.includes(judgeName),
      finalists,
      completedReviews,
      requiredReviews,
      allComplete,
      topThree: allComplete ? selectWinners(finalists) : [],
    };
  }

  async start(adminName: string, requestedJudges?: string[]) {
    const repository = this.repository();
    const existing = await this.state(adminName);
    if (existing.started) return existing;
    if (!existing.canStart || !existing.finalists.length) {
      throw new ConflictError(
        "At least one project with a completed preliminary score is required.",
      );
    }
    const judges = Array.from(
      new Set(
        (requestedJudges ?? existing.judges)
          .map((judge) => judge.trim().toLowerCase())
          .filter(Boolean),
      ),
    ).sort();
    if (!judges.length) {
      throw new ValidationError("Select at least one final-round judge.");
    }
    if (judges.some((judge) => judge.length > 80)) {
      throw new ValidationError(
        "Judge names must be 80 characters or fewer.",
      );
    }
    const state: FinalJudgingState = {
      startedAt: new Date().toISOString(),
      judges,
      reviews: [],
    };
    for (const finalist of existing.finalists) {
      await repository.setFinalState(finalist.id, state);
    }
    return this.state(adminName);
  }

  async sync(adminName: string) {
    const repository = this.repository();
    const existing = await this.state(adminName);
    if (!existing.started) {
      throw new ConflictError("Start final judging before syncing finalists.");
    }
    if (existing.completedReviews > 0) {
      throw new ConflictError(
        "Finalists cannot be changed after a final-round review has been submitted.",
      );
    }
    const submissions = await repository.list();
    const finalists = selectFinalists(submissions);
    if (!finalists.length) {
      throw new ConflictError(
        "At least one project with a completed preliminary score is required.",
      );
    }
    const finalistIds = new Set(finalists.map((submission) => submission.id));
    const state: FinalJudgingState = {
      startedAt: existing.startedAt,
      judges: existing.judges,
      reviews: [],
    };
    for (const submission of submissions) {
      if (submission.finalJudging && !finalistIds.has(submission.id)) {
        await repository.clearFinalState(submission.id);
      }
    }
    for (const finalist of finalists) {
      await repository.setFinalState(finalist.id, state);
    }
    return this.state(adminName);
  }

  async reset(adminName: string) {
    const repository = this.repository();
    const selected = (await repository.list()).filter(
      (submission) => submission.finalJudging,
    );
    if (!selected.length) {
      throw new ConflictError("Final judging has not started.");
    }
    await repository.deleteReviews("final");
    for (const submission of selected) {
      await repository.clearFinalState(submission.id);
    }
    return this.state(adminName);
  }

  async finalist(id: string, judgeName: string) {
    const submission = await this.repository().findById(id);
    if (!submission) throw new NotFoundError("Submission not found.");
    if (!submission.finalJudging) {
      throw new ConflictError("This project is not in the final round.");
    }
    if (!submission.finalJudging.judges.includes(judgeName)) {
      throw new ForbiddenError(
        "You are not part of the final-round judge roster.",
      );
    }
    return submission;
  }

  async submitReview(
    id: string,
    judgeName: string,
    scores: ReviewScores,
  ) {
    const repository = this.repository();
    const submission = await this.finalist(id, judgeName);
    const review = createReview(
      judgeName,
      scores,
      new Date().toISOString(),
    );
    await repository.saveReview(id, "final", review);
    const reviews = [
      ...(submission.finalJudging?.reviews ?? []).filter(
        (item) => item.judgeName !== review.judgeName,
      ),
      review,
    ];
    return { ...submission.finalJudging!, reviews };
  }
}

