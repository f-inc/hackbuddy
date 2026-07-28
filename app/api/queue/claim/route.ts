import { claimNextSubmission, getQueueStats, isDemoMode } from "@/lib/airtable";
import { requireHackathonSession } from "@/server/auth/policies";
import { errorResponse } from "@/server/http/errors";
import { NextResponse } from "next/server";

export async function POST() {
  try {
    const session = await requireHackathonSession();
    const submission = await claimNextSubmission(session.name);
    const stats = await getQueueStats();
    return NextResponse.json({ submission, stats, demoMode: isDemoMode() });
  } catch (error) {
    return errorResponse(error, "The next submission could not be claimed.");
  }
}
