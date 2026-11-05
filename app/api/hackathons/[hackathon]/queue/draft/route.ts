import { NextResponse } from "next/server";
import { withHackathonRequest } from "@/lib/hackathon-request";
import { currentEventConfig, currentEventSettings } from "@/lib/event-context";
import { requireHackathonSession } from "@/server/auth/policies";
import { draftDatabaseReview } from "@/infrastructure/database/submission-repository";
import { errorResponse, ValidationError } from "@/server/http/errors";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ hackathon: string }> },
) {
  const { hackathon } = await params;
  return withHackathonRequest(hackathon, async () => {
    try {
      const session = await requireHackathonSession();
      if (currentEventConfig()?.storage !== "database")
        throw new ValidationError("Server drafts are available for database events.");
      const input = await request.json();
      if (typeof input.id !== "string" || !input.scores || typeof input.scores !== "object")
        throw new ValidationError("Invalid draft.");
      const scores: Partial<import("@/domain/submission").ReviewScores> = {};
      for (const key of ["progress", "practicality", "complexity"] as const) {
        const value = input.scores[key];
        if (value !== undefined) {
          if (!Number.isInteger(value) || value < 1 || value > currentEventSettings().scoreMax)
            throw new ValidationError("Invalid draft score.");
          scores[key] = value;
        }
      }
      if (typeof input.scores.notes !== "string" || input.scores.notes.length > 5000)
        throw new ValidationError("Invalid draft notes.");
      scores.notes = input.scores.notes;
      return NextResponse.json({
        draft: await draftDatabaseReview(input.id, session.name, scores),
      });
    } catch (error) {
      return errorResponse(error, "Draft could not be saved.");
    }
  });
}
