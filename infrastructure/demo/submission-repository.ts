import type { SubmissionRepository } from "@/application/ports/submission-repository";
import { demoSubmissions } from "@/lib/demo-data";
import { aggregateReviews, statusForReviewCount } from "@/domain/scoring";
import type {
  FinalJudgingState,
  ReviewPhase,
  Submission,
  SubmissionReview,
} from "@/domain/submission";
import { ConflictError, NotFoundError } from "@/server/http/errors";

type DemoState = {
  submissions: Submission[];
  claims: Map<string, string>;
};

const demoGlobal = globalThis as typeof globalThis & {
  hackbuddyDemoState?: DemoState;
};

const demoState =
  demoGlobal.hackbuddyDemoState ??
  {
    submissions: structuredClone(demoSubmissions),
    claims: new Map<string, string>(),
  };

demoGlobal.hackbuddyDemoState = demoState;

function projectedSubmission(submission: Submission): Submission {
  const activeJudge = demoState.claims.get(submission.id);
  return {
    ...structuredClone(submission),
    status: statusForReviewCount(
      submission.reviews.length,
      Boolean(activeJudge),
    ),
    claimedBy: activeJudge ?? "",
    claimedAt: activeJudge ? submission.claimedAt : "",
  };
}

export class DemoSubmissionRepository implements SubmissionRepository {
  readonly demoMode = true;

  async list() {
    return demoState.submissions.map(projectedSubmission);
  }

  async findById(id: string) {
    const submission = demoState.submissions.find((item) => item.id === id);
    return submission ? projectedSubmission(submission) : null;
  }

  async tryClaim(id: string, judgeName: string) {
    if (demoState.claims.has(id)) return null;
    const submission = demoState.submissions.find((item) => item.id === id);
    if (!submission || statusForReviewCount(submission.reviews.length) !== "available") {
      return null;
    }
    demoState.claims.set(id, judgeName);
    submission.claimedAt = new Date().toISOString();
    return projectedSubmission(submission);
  }

  async saveReview(
    id: string,
    phase: ReviewPhase,
    review: SubmissionReview,
  ) {
    const submission = demoState.submissions.find((item) => item.id === id);
    if (!submission) throw new NotFoundError("Submission not found.");
    const reviews =
      phase === "preliminary"
        ? submission.reviews
        : submission.finalJudging?.reviews;
    if (!reviews) {
      throw new ConflictError("This project is not in the final round.");
    }
    const existing = reviews.findIndex(
      (item) => item.judgeName === review.judgeName,
    );
    if (existing >= 0) reviews[existing] = review;
    else reviews.push(review);
  }

  async savePreliminaryProjection(
    id: string,
    reviews: SubmissionReview[],
    completedAt: string,
  ) {
    const submission = demoState.submissions.find((item) => item.id === id);
    if (!submission) throw new NotFoundError("Submission not found.");
    const aggregate = aggregateReviews(reviews);
    Object.assign(submission, {
      status: statusForReviewCount(reviews.length),
      progressScore: aggregate.progress,
      practicalityScore: aggregate.practicality,
      complexityScore: aggregate.complexity,
      totalScore: aggregate.total,
      notes: aggregate.notes,
      claimedBy: "",
      claimedAt: "",
      completedAt:
        statusForReviewCount(reviews.length) === "completed"
          ? completedAt
          : "",
      reviews,
    });
    demoState.claims.delete(id);
  }

  async deleteReviews(phase: ReviewPhase) {
    if (phase === "preliminary") {
      for (const submission of demoState.submissions) {
        submission.reviews = [];
      }
      return;
    }
    for (const submission of demoState.submissions) {
      if (submission.finalJudging) submission.finalJudging.reviews = [];
    }
  }

  async setFinalState(id: string, state: FinalJudgingState) {
    const submission = demoState.submissions.find((item) => item.id === id);
    if (!submission) throw new NotFoundError("Submission not found.");
    submission.finalJudging = structuredClone(state);
  }

  async clearFinalState(id: string) {
    const submission = demoState.submissions.find((item) => item.id === id);
    if (!submission) throw new NotFoundError("Submission not found.");
    submission.finalJudging = null;
  }

  async release(id: string) {
    const submission = demoState.submissions.find((item) => item.id === id);
    if (!submission) throw new NotFoundError("Submission not found.");
    if (!demoState.claims.has(id)) {
      throw new ConflictError(
        "Only an active judging session can be released.",
      );
    }
    demoState.claims.delete(id);
    submission.status = "available";
    submission.claimedBy = "";
    submission.claimedAt = "";
  }
}

export const demoSubmissionRepository = new DemoSubmissionRepository();

