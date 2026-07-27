import {
  getFinalistSubmission,
  getFinalsState,
  getQueueStats,
  isDemoMode,
  startFinalRound,
  submitFinalReview,
} from "@/lib/airtable";
import { getSession } from "@/lib/auth";
import { NextResponse } from "next/server";

function validScore(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 10;
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const id = new URL(request.url).searchParams.get("id");
    if (id) {
      const submission = await getFinalistSubmission(id, session.name);
      return NextResponse.json({
        submission,
        existingReview:
          submission.finalJudging?.reviews.find(
            (review) => review.judgeName === session.name,
          ) ?? null,
        finals: await getFinalsState(session.name),
        stats: await getQueueStats(),
        demoMode: isDemoMode(),
      });
    }

    return NextResponse.json({
      finals: await getFinalsState(session.name),
      demoMode: isDemoMode(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The final round could not be loaded.",
      },
      { status: 409 },
    );
  }
}

export async function POST() {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json({
      ok: true,
      finals: await startFinalRound(session.name),
      demoMode: isDemoMode(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The final round could not be started.",
      },
      { status: 409 },
    );
  }
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await request.json()) as {
    id?: string;
    progress?: number;
    practicality?: number;
    complexity?: number;
    notes?: string;
  };
  if (
    !body.id ||
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
    await submitFinalReview(body.id, session.name, {
      progress: body.progress,
      practicality: body.practicality,
      complexity: body.complexity,
      notes: body.notes?.trim() || "",
    });
    return NextResponse.json({
      ok: true,
      finals: await getFinalsState(session.name),
      demoMode: isDemoMode(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The final score could not be saved.",
      },
      { status: 409 },
    );
  }
}
