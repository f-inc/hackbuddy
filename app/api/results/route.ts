import { getResultsReport, isDemoMode } from "@/lib/airtable";
import { requireHackathonSession } from "@/server/auth/policies";
import { errorResponse } from "@/server/http/errors";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    await requireHackathonSession();
    return NextResponse.json({
      ...await getResultsReport(),
      demoMode: isDemoMode(),
    });
  } catch (error) {
    return errorResponse(error, "Results could not be loaded.");
  }
}
