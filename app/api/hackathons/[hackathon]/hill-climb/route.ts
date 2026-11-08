import { NextResponse } from "next/server";
import { withHackathonRequest } from "@/lib/hackathon-request";
import { requireHackathonSession } from "@/server/auth/policies";
import { errorResponse } from "@/server/http/errors";
import { readJson } from "@/server/http/validation";
import { hillClimbTeams, saveHillClimbGrade } from "@/application/hill-climb";
type Context = { params: Promise<{ hackathon: string }> };
export async function GET(_request: Request, { params }: Context) {
  const { hackathon } = await params;
  return withHackathonRequest(hackathon, async () => {
    try {
      const session = await requireHackathonSession();
      return NextResponse.json(await hillClimbTeams(session.name));
    } catch (error) {
      return errorResponse(error, "Could not load Hill Climb teams.");
    }
  });
}
export async function POST(request: Request, { params }: Context) {
  const { hackathon } = await params;
  return withHackathonRequest(hackathon, async () => {
    try {
      const session = await requireHackathonSession();
      return NextResponse.json({
        grade: await saveHillClimbGrade(session.name, await readJson(request)),
      });
    } catch (error) {
      return errorResponse(error, "Could not save Hill Climb grade.");
    }
  });
}
