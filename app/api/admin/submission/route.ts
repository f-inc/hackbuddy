import {
  getQueueStats,
  getSubmissionById,
  isDemoMode,
  updateSubmissionReview,
} from "@/lib/airtable";
import { requireAdmin } from "@/server/auth/policies";
import {
  ConflictError,
  errorResponse,
  NotFoundError,
  ValidationError,
} from "@/server/http/errors";
import {
  parseReviewEditRequest,
  readJson,
} from "@/server/http/validation";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const searchParams = new URL(request.url).searchParams;
    const id = searchParams.get("id");
    const reviewParam = searchParams.get("review");
    const reviewIndex =
      reviewParam !== null && /^\d+$/.test(reviewParam)
        ? Number(reviewParam)
        : null;
    if (!id) throw new ValidationError("Submission ID is required.");

    const submission = await getSubmissionById(id);
    if (!submission) throw new NotFoundError("Submission not found.");
    if (reviewIndex !== null && !submission.reviews[reviewIndex]) {
      throw new ConflictError(
        "This submission does not have a review to edit.",
      );
    }
    if (reviewIndex !== null && submission.status === "in progress") {
      throw new ConflictError(
        "Release the active session before editing its score.",
      );
    }
    if (reviewIndex === null && submission.status !== "in progress") {
      throw new ConflictError("This judging session is no longer active.");
    }

    return NextResponse.json({
      submission,
      stats: await getQueueStats(),
      demoMode: isDemoMode(),
    });
  } catch (error) {
    return errorResponse(error, "The submission could not be loaded.");
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdmin();
    const { id, reviewIndex, scores } = parseReviewEditRequest(
      await readJson(request),
    );
    const submission = await updateSubmissionReview(
      id,
      reviewIndex,
      scores,
    );
    return NextResponse.json({
      ok: true,
      submission,
      stats: await getQueueStats(),
      demoMode: isDemoMode(),
    });
  } catch (error) {
    return errorResponse(error, "The review could not be updated.");
  }
}
