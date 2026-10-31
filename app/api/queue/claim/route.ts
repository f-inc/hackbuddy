import { claimNextSubmission, getQueueStats, isDemoMode } from "@/lib/airtable";
import { requireHackathonSession } from "@/server/auth/policies";
import { errorResponse } from "@/server/http/errors";
import { parseSkippedIds, readJson } from "@/server/http/validation";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const session = await requireHackathonSession();
    const skippedIds =
      request.body === null ? [] : parseSkippedIds(await readJson(request));
    const submission = await claimNextSubmission(session.name, skippedIds);
    const stats = await getQueueStats();
    return NextResponse.json({ submission, stats, demoMode: isDemoMode() });
  } catch (error) {
    return errorResponse(error, "The next submission could not be claimed.");
  }
}
