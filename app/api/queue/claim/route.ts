import { claimNextSubmission, getQueueStats, isDemoMode } from "@/lib/airtable";
import { getSession } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const submission = await claimNextSubmission(session.name);
    const stats = await getQueueStats();
    return NextResponse.json({ submission, stats, demoMode: isDemoMode() });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Airtable could not be reached. Check the server configuration." },
      { status: 500 },
    );
  }
}
