import { getJudgedProjects, isDemoMode } from "@/lib/airtable";
import { withHackathonRequest } from "@/lib/hackathon-request";
import { requireHackathonSession } from "@/server/auth/policies";
import { errorResponse, NotFoundError } from "@/server/http/errors";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ hackathon: string }> },
) {
  const { hackathon } = await params;
  return withHackathonRequest(hackathon, async () => {
    try {
      const session = await requireHackathonSession();
      const id = new URL(request.url).searchParams.get("id") || undefined;
      const result = await getJudgedProjects(session.name, id);
      if (!result)
        throw new NotFoundError("You have no saved review for this project.");
      return NextResponse.json(
        { ...result, demoMode: isDemoMode() },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    } catch (error) {
      return errorResponse(error, "Your judged projects could not be loaded.");
    }
  });
}
