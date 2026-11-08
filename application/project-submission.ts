import { randomUUID } from "node:crypto";
import { changeEvent } from "@/infrastructure/database/events";
import type { Submission } from "@/domain/submission";
import {
  MAKERMODS_FORM,
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
  const fields = {
    projectName,
    teamName,
    submitterNames,
    contactEmail,
    track: text("track", 100),
    toolsUsed: [
      ...new Set(
        text("toolsUsed", 1000)
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      ),
    ],
    oneLiner: text("oneLiner", template === MAKERMODS_FORM ? 50 : 300),
    description: text("description", 10000),
    progressOutline: text("progressOutline", 5000),
    previewImageUrl: safeUrl(value.previewImageUrl),
    teamPhotoUrl: safeUrl(value.teamPhotoUrl),
    demoUrl: safeUrl(value.demoUrl),
    demoVideoUrl: safeUrl(value.demoVideoUrl),
    repositoryUrl: safeUrl(value.repositoryUrl),
  };
  if (!fields.description)
    throw new ValidationError("Describe what you built.");
  if (template === MAKERMODS_FORM) {
    if (!MAKERMODS_TRACKS.some((track) => track === fields.track))
      throw new ValidationError("Select Hill Climb or Creative Applications.");
    if (!fields.oneLiner || !fields.progressOutline)
      throw new ValidationError(
        "Add a one-line description and your progress during the hackathon.",
      );
    if (fields.track === "Creative Applications" && !fields.demoVideoUrl)
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
