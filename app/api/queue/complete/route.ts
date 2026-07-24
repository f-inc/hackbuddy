import {
  claimNextSubmission,
  completeSubmission,
  getQueueStats,
  isDemoMode,
} from "@/lib/airtable";
import { getSession } from "@/lib/auth";
import { NextResponse } from "next/server";

function validScore(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 10;
}

export async function POST(request: Request) {
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
    await completeSubmission(body.id, session.name, {
      progress: body.progress,
      practicality: body.practicality,
      complexity: body.complexity,
      notes: body.notes?.trim() || "",
    });
    const submission = await claimNextSubmission(session.name);
    const stats = await getQueueStats();
    return NextResponse.json({
      ok: true,
      submission,
      stats,
      demoMode: isDemoMode(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "The score could not be saved.";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
