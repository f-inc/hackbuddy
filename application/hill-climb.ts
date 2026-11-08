import { changeEvent, readEvent } from "@/infrastructure/database/events";
import { currentEventConfig } from "@/lib/event-context";
import { isHillClimb, validHillRun, hillClimbScore } from "@/domain/hill-climb";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/server/http/errors";
function eventId() {
  const event = currentEventConfig();
  if (
    event?.storage !== "database" ||
    event.settings?.submissionForm !== "makermods-physical-ai"
  )
    throw new NotFoundError(
      "Hill Climb judging is not available for this event.",
    );
  return event.id;
}
export async function hillClimbTeams(judge: string) {
  const row = await readEvent(eventId());
  if (!row) throw new NotFoundError("Hackathon not found.");
  return {
    locked: !!row.data.publication,
    teams: row.data.submissions
      .filter(isHillClimb)
      .map((s) => ({
        id: s.id,
        teamName: s.teamName,
        teamNumber: s.teamNumber || "",
        projectName: s.projectName,
        description: s.description,
        grade: row.data.hillClimbGrades?.[s.id]?.[`judge:${judge}`] || null,
      }))
      .sort(
        (a, b) =>
          a.teamNumber.localeCompare(b.teamNumber, undefined, {
            numeric: true,
          }) || a.teamName.localeCompare(b.teamName),
      ),
  };
}
export async function saveHillClimbGrade(judge: string, value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ValidationError("Invalid Hill Climb grade.");
  const input = value as Record<string, unknown>;
  if (
    typeof input.id !== "string" ||
    !validHillRun(input.run) ||
    !(
      input.previousUpdatedAt === null ||
      typeof input.previousUpdatedAt === "string"
    )
  )
    throw new ValidationError(
      "Check the run fields, stage order, and taller-tower bonus.",
    );
  const id = input.id,
    run = structuredClone(input.run);
  return changeEvent(eventId(), (event) => {
    if (event.publication)
      throw new ConflictError("Published results are locked.");
    if (!event.submissions.some((s) => s.id === id && isHillClimb(s)))
      throw new NotFoundError("Hill Climb team not found.");
    const grades = ((event.hillClimbGrades ??= {})[id] ??= {});
    const existing = grades[`judge:${judge}`];
    if ((existing?.updatedAt ?? null) !== input.previousUpdatedAt) {
      if (existing && JSON.stringify(existing.run) === JSON.stringify(run))
        return existing;
      throw new ConflictError(
        "This grade changed in another tab. Reload before editing.",
      );
    }
    const { points, disqualified, automaticLoss } = hillClimbScore(run);
    return (grades[`judge:${judge}`] = {
      run,
      points,
      disqualified,
      automaticLoss,
      judge,
      updatedAt: new Date(
        Math.max(Date.now(), Date.parse(existing?.updatedAt || "") + 1 || 0),
      ).toISOString(),
    });
  });
}
