import {
  claimNextSubmission,
  completeSubmission,
  getQueueStats,
  isDemoMode,
} from "@/lib/airtable";
import { requireHackathonSession } from "@/server/auth/policies";
import { errorResponse } from "@/server/http/errors";
import {
  parseReviewRequest,
  parseSkippedIds,
  readJson,
} from "@/server/http/validation";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const session = await requireHackathonSession();
    const body = await readJson(request);
    const { id, scores } = parseReviewRequest(body);
    const skippedIds = parseSkippedIds(body);
    await completeSubmission(id, session.name, scores);
    const submission = await claimNextSubmission(session.name, skippedIds);
    const stats = await getQueueStats();
    return NextResponse.json({
      ok: true,
      submission,
      stats,
      demoMode: isDemoMode(),
    });
  } catch (error) {
    return errorResponse(error, "The score could not be saved.");
  }
}
