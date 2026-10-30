import {
  getFinalistSubmission,
  publishResults,
  getFinalsState,
  getQueueStats,
  isDemoMode,
  resetFinalRound,
  startFinalRound,
  submitFinalBallot,
  syncFinalRoundWithResults,
} from "@/lib/airtable";
import { requireAdmin, requireHackathonSession } from "@/server/auth/policies";
import { errorResponse } from "@/server/http/errors";
import {
  parseFinalsActionRequest,
  parseBallotRequest,
  readJson,
} from "@/server/http/validation";
import {
  finalsForViewer,
  submissionForViewer,
} from "@/domain/finals-visibility";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const session = await requireHackathonSession();
    const id = new URL(request.url).searchParams.get("id");
    if (id) {
      const submission = await getFinalistSubmission(id, session.name);
      return NextResponse.json({
        submission: submissionForViewer(submission, session.role === "admin"),
        existingReview: null,
        finals: finalsForViewer(
          await getFinalsState(session.name),
          session.role === "admin",
        ),
        stats: await getQueueStats(),
        demoMode: isDemoMode(),
      });
    }
    return NextResponse.json({
      finals: finalsForViewer(
        await getFinalsState(session.name),
        session.role === "admin",
      ),
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
      body.action === "publish"
        ? await publishResults(session.name, body.winnerIds)
        : body.action === "reset"
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
    const picks = parseBallotRequest(await readJson(request));
    await submitFinalBallot(session.name, picks);
    return NextResponse.json({
      ok: true,
      finals: finalsForViewer(
        await getFinalsState(session.name),
        session.role === "admin",
      ),
      demoMode: isDemoMode(),
    });
  } catch (error) {
    return errorResponse(error, "The final score could not be saved.");
  }
}
