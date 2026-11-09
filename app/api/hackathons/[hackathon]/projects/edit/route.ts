import { NextResponse } from "next/server";
import { getHackathon } from "@/lib/hackathons";
import { loadEditableProject } from "@/application/project-submission";
import { errorResponse, NotFoundError } from "@/server/http/errors";

export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ hackathon: string }>;
  },
) {
  try {
    const { hackathon } = await params;
    const event = await getHackathon(hackathon);
    if (!event || event.storage !== "database")
      throw new NotFoundError("This event does not accept form submissions.");
    const id = new URL(request.url).searchParams.get("id") || "";
    const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
    const submission = await loadEditableProject(event.id, id, token);
    return NextResponse.json(
      { submission },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const response = errorResponse(error, "Submission could not be loaded.");
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
