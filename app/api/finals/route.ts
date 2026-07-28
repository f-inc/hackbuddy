import {
  getFinalistSubmission,
  getFinalsState,
  getQueueStats,
  isDemoMode,
  resetFinalRound,
  startFinalRound,
  submitFinalReview,
  syncFinalRoundWithResults,
} from "@/lib/airtable";
import {
  requireAdmin,
  requireHackathonSession,
} from "@/server/auth/policies";
import { errorResponse } from "@/server/http/errors";
import {
  parseFinalsActionRequest,
  parseReviewRequest,
  readJson,
} from "@/server/http/validation";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const session = await requireHackathonSession();
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
    return errorResponse(error, "The final round could not be loaded.");
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAdmin();
    const body = parseFinalsActionRequest(await readJson(request));
    const finals =
      body.action === "reset"
        ? await resetFinalRound(session.name)
        : body.action === "sync"
          ? await syncFinalRoundWithResults(session.name)
          : await startFinalRound(session.name, body.judges);
    return NextResponse.json({
      ok: true,
      finals,
      demoMode: isDemoMode(),
    });
  } catch (error) {
    return errorResponse(error, "The final round could not be changed.");
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireHackathonSession();
    const { id, scores } = parseReviewRequest(await readJson(request));
    await submitFinalReview(id, session.name, scores);
    return NextResponse.json({
      ok: true,
      finals: await getFinalsState(session.name),
      demoMode: isDemoMode(),
    });
  } catch (error) {
    return errorResponse(error, "The final score could not be saved.");
  }
}
