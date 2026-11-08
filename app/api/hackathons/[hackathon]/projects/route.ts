import { NextResponse } from "next/server";
import { getHackathon } from "@/lib/hackathons";
import { getSession } from "@/lib/auth";
import { saveProject } from "@/application/project-submission";
import { withHackathonRequest } from "@/lib/hackathon-request";
import { getAllSubmissions } from "@/lib/airtable";
import {
  errorResponse,
  NotFoundError,
  ValidationError,
} from "@/server/http/errors";
type Context = { params: Promise<{ hackathon: string }> };
export async function GET(_request: Request, { params }: Context) {
  const { hackathon } = await params;
  return withHackathonRequest(hackathon, async () => {
    const submissions = await getAllSubmissions();
    return NextResponse.json({
      submissions: submissions.map((s) => ({
        id: s.id,
        projectName: s.projectName,
        teamName: s.teamName,
        submitterNames: s.submitterNames,
        oneLiner: s.oneLiner,
        track: s.track,
        toolsUsed: s.toolsUsed,
      })),
    });
  });
}
export async function POST(request: Request, { params }: Context) {
  try {
    const origin = request.headers.get("origin");
    if (origin) {
      try {
        if (new URL(origin).origin !== new URL(request.url).origin)
          throw new Error();
      } catch {
        throw new ValidationError("Invalid request origin.");
      }
    }
    const raw = await request.text();
    if (raw.length > 40000)
      throw new ValidationError("Submission is too large.");
    let input;
    try {
      input = JSON.parse(raw);
    } catch {
      throw new ValidationError("The request body must be valid JSON.");
    }
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw new ValidationError("Invalid submission.");
    const { hackathon } = await params,
      event = await getHackathon(hackathon);
    if (!event || event.storage !== "database")
      throw new NotFoundError("This event does not accept form submissions.");
    const session = await getSession();
    const id = await saveProject(event.id, input, session?.role === "admin");
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Submission could not be saved.");
  }
}
