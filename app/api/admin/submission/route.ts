import {
  getQueueStats,
  getSubmissionById,
  isDemoMode,
  updateSubmissionReview,
} from "@/lib/airtable";
import { getSession } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = new URL(request.url).searchParams;
  const id = searchParams.get("id");
  const reviewParam = searchParams.get("review");
  const reviewIndex =
    reviewParam !== null && /^\d+$/.test(reviewParam)
      ? Number(reviewParam)
      : null;
  if (!id) {
    return NextResponse.json(
      { error: "Submission ID required." },
      { status: 400 },
    );
  }

  const submission = await getSubmissionById(id);
  if (!submission) {
    return NextResponse.json(
      { error: "Submission not found." },
      { status: 404 },
    );
  }
  if (reviewIndex !== null && !submission.reviews[reviewIndex]) {
    return NextResponse.json(
      { error: "This submission does not have a review to edit." },
      { status: 409 },
    );
  }
  if (reviewIndex !== null && submission.status === "in progress") {
    return NextResponse.json(
      { error: "Release the active session before editing its score." },
      { status: 409 },
    );
  }
  if (reviewIndex === null && submission.status !== "in progress") {
    return NextResponse.json(
      { error: "This judging session is no longer active." },
      { status: 409 },
    );
  }

  return NextResponse.json({
    submission,
    stats: await getQueueStats(),
    demoMode: isDemoMode(),
  });
}

function validScore(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 10;
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    id?: string;
    reviewIndex?: number;
    progress?: number;
    practicality?: number;
    complexity?: number;
    notes?: string;
  };
  if (
    !body.id ||
    !Number.isInteger(body.reviewIndex) ||
    Number(body.reviewIndex) < 0 ||
    !validScore(body.progress) ||
    !validScore(body.practicality) ||
    !validScore(body.complexity)
  ) {
    return NextResponse.json(
      { error: "Every rubric score must be between 1 and 10." },
      { status: 400 },
    );
  }

  try {
    const submission = await updateSubmissionReview(
      body.id,
      Number(body.reviewIndex),
      {
        progress: body.progress,
        practicality: body.practicality,
        complexity: body.complexity,
        notes: body.notes?.trim() || "",
      },
    );
    return NextResponse.json({
      ok: true,
      submission,
      stats: await getQueueStats(),
      demoMode: isDemoMode(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The review could not be updated.",
      },
      { status: 409 },
    );
  }
}
