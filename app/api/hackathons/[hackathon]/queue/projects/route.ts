import { NextResponse } from "next/server";
import { withHackathonRequest } from "@/lib/hackathon-request";
import { currentEventConfig } from "@/lib/event-context";
import { requireHackathonSession } from "@/server/auth/policies";
import { errorResponse, ForbiddenError } from "@/server/http/errors";
import { parseSubmissionIdRequest, readJson } from "@/server/http/validation";
import { databaseSubmissionRepository, draftDatabaseReview, selectMakerModsProject } from "@/infrastructure/database/submission-repository";
import { getQueueStats } from "@/lib/airtable";
import { isHillClimb } from "@/domain/hill-climb";
import { hasReviewBy } from "@/domain/scoring";
import { submissionForViewer } from "@/domain/finals-visibility";

type Context = { params: Promise<{ hackathon: string }> };
function requireMakerMods() {
  const config = currentEventConfig();
  if (config?.storage !== "database" || config.settings?.submissionForm !== "makermods-physical-ai")
    throw new ForbiddenError("Project selection is only available for MakerMods.");
}
export async function GET(_request: Request, { params }: Context) {
  const { hackathon } = await params;
  return withHackathonRequest(hackathon, async () => {
    try {
      const session = await requireHackathonSession();
      requireMakerMods();
      const projects = (await databaseSubmissionRepository().list(session.name))
        .filter(s => !isHillClimb(s))
        .map(s => ({ id: s.id, projectName: s.projectName, teamNumber: s.teamNumber,
          reviewedByYou: hasReviewBy(s.reviews, session.name) }));
      return NextResponse.json({ projects }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) { return errorResponse(error, "Projects could not be loaded."); }
  });
}
export async function POST(request: Request, { params }: Context) {
  const { hackathon } = await params;
  return withHackathonRequest(hackathon, async () => {
    try {
      const session = await requireHackathonSession();
      requireMakerMods();
      const { id } = parseSubmissionIdRequest(await readJson(request));
      const submission = await selectMakerModsProject(id, session.name);
      return NextResponse.json({
        submission: submissionForViewer(submission, session.role === "admin"),
        draft: await draftDatabaseReview(id, session.name),
        stats: await getQueueStats(), demoMode: false,
      });
    } catch (error) { return errorResponse(error, "This project could not be selected."); }
  });
}
