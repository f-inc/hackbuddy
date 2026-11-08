import { randomUUID } from "node:crypto";
import { changeEvent } from "@/infrastructure/database/events";
import type { Submission } from "@/domain/submission";
import {
  MAKERMODS_FORM,
  MAKERMODS_TRACK,
  MAKERMODS_HILL_TRACK,
  MAKERMODS_TRACKS,
  SUBMISSION_REQUEST_ID,
  type SubmissionFormTemplate,
} from "@/domain/submission-form";
import {
  ValidationError,
  ConflictError,
  NotFoundError,
} from "@/server/http/errors";
import { safeUrl } from "@/server/http/validation";

export function submissionFields(
  value: Record<string, unknown>,
  template?: SubmissionFormTemplate,
) {
  const text = (key: string, max = 5000) => {
    const v = value[key];
    if (v === undefined) return "";
    if (typeof v !== "string" || v.length > max)
      throw new ValidationError(`Invalid ${key}.`);
    return v.trim();
  };
  const projectName = text("projectName", 120),
    teamName = text("teamName", 120),
    submitterNames = text("submitterNames", 500),
    contactEmail = text("contactEmail", 254);
  if (
    !projectName ||
    !teamName ||
    !submitterNames ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)
  )
    throw new ValidationError(
      "Enter a project name, team, builders and valid contact email.",
    );
  const teamNumber = text("teamNumber", 10);
  if (template === MAKERMODS_FORM && !teamNumber)
    throw new ValidationError("Enter your team number.");
  if (teamNumber && !/^[0-9]{1,10}$/.test(teamNumber))
    throw new ValidationError(
      "Team number must contain digits only (up to 10).",
    );
  const track =
    text("track", 100) || (template === MAKERMODS_FORM ? MAKERMODS_TRACK : "");
  const hillClimb =
    template === MAKERMODS_FORM && track === MAKERMODS_HILL_TRACK;
  if (
    template === MAKERMODS_FORM &&
    !MAKERMODS_TRACKS.some((option) => option === track)
  )
    throw new ValidationError("Select Creative Applications or Hill Climb.");
  const fields = {
    teamNumber,
    projectName,
    teamName,
    submitterNames,
    contactEmail,
    track,
    toolsUsed: [
      ...new Set(
        text("toolsUsed", 1000)
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      ),
    ],
    oneLiner: hillClimb
      ? ""
      : text("oneLiner", template === MAKERMODS_FORM ? 50 : 300),
    description: text("description", 10000),
    progressOutline: hillClimb ? "" : text("progressOutline", 5000),
    previewImageUrl: hillClimb ? "" : safeUrl(value.previewImageUrl),
    teamPhotoUrl: safeUrl(value.teamPhotoUrl),
    demoUrl: hillClimb ? "" : safeUrl(value.demoUrl),
    demoVideoUrl: hillClimb ? "" : safeUrl(value.demoVideoUrl),
    repositoryUrl: hillClimb ? "" : safeUrl(value.repositoryUrl),
  };
  if (!fields.description)
    throw new ValidationError(
      hillClimb
        ? "Describe how you improved the base model."
        : "Describe what you built.",
    );
  if (template === MAKERMODS_FORM && !hillClimb) {
    if (!fields.oneLiner || !fields.progressOutline)
      throw new ValidationError(
        "Add a one-line description and your progress during the hackathon.",
      );
    if (!fields.demoVideoUrl)
      throw new ValidationError(
        "Add a demo video link for Creative Applications.",
      );
  }
  return fields;
}

export async function saveProject(
  eventId: string,
  input: Record<string, unknown>,
  admin = false,
) {
  if (
    input.requestId !== undefined &&
    (typeof input.requestId !== "string" ||
      !SUBMISSION_REQUEST_ID.test(input.requestId))
  )
    throw new ValidationError("Invalid submission request ID.");
  const requestId =
    typeof input.requestId === "string" ? input.requestId : randomUUID();
  if (input.id !== undefined && (typeof input.id !== "string" || !input.id))
    throw new ValidationError("Invalid submission ID.");
  if (input.id && !admin)
    throw new ValidationError("Only organizers can edit submitted projects.");
  return changeEvent(eventId, (event) => {
    const fields = submissionFields(
      input,
      event.config.settings?.submissionForm,
    );
    const existing =
      typeof input.id === "string"
        ? event.submissions.find((s) => s.id === input.id)
        : undefined;
    if (input.id && !existing) throw new NotFoundError("Submission not found.");
    if (!existing) {
      const duplicate = event.submissions.find((s) => s.id === requestId);
      if (duplicate) {
        // A retry confirms the original write, even after the event closes.
        // Reusing a token with changed answers must never silently drop those answers.
        if (
          !Object.entries(fields).every(
            ([key, value]) =>
              JSON.stringify(duplicate[key as keyof Submission] ?? "") ===
              JSON.stringify(value),
          )
        )
          throw new ConflictError(
            "This submission reference was already used with different answers. Contact an organizer.",
          );
        return duplicate.id;
      }
    }
    if (event.publication)
      throw new ConflictError("Published projects are locked.");
    if (
      !event.config.active ||
      (!admin && !event.config.settings?.submissionsOpen)
    )
      throw new ConflictError("Submissions are closed.");
    if (existing) {
      Object.assign(existing, fields);
      return existing.id;
    }
    if (event.submissions.length >= 5000)
      throw new ConflictError("This event has reached its submission limit.");
    const submission: Submission = {
      id: requestId,
      ...fields,
      createdAt: new Date().toISOString(),
      attendance: "",
      demoType: "link",
      demoFilename: "",
      status: "available",
      claimedBy: "",
      claimedAt: "",
      completedAt: "",
      progressScore: null,
      practicalityScore: null,
      complexityScore: null,
      totalScore: null,
      notes: "",
      reviews: [],
      finalJudging: null,
    };
    event.submissions.push(submission);
    return submission.id;
  });
}
