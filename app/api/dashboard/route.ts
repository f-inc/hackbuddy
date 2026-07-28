import { getDashboard, isDemoMode } from "@/lib/airtable";
import { requireHackathonSession } from "@/server/auth/policies";
import { errorResponse } from "@/server/http/errors";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const session = await requireHackathonSession();
    const dashboard = await getDashboard(session.name);
    if (session.role === "judge") {
      return NextResponse.json({
        ...dashboard,
        leaderboard: [],
        activeSessions: [],
        scoreDistribution: [],
        averageScore: 0,
        demoMode: isDemoMode(),
      });
    }
    return NextResponse.json({ ...dashboard, demoMode: isDemoMode() });
  } catch (error) {
    return errorResponse(error, "The dashboard could not be loaded.");
  }
}
