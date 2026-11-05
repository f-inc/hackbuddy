import { randomUUID } from "node:crypto";
import { changeEvent } from "@/infrastructure/database/events";
import type { Submission } from "@/domain/submission";
import { ValidationError, ConflictError, NotFoundError } from "@/server/http/errors";
import { safeUrl } from "@/server/http/validation";
export function submissionFields(value: Record<string, unknown>) {
  const text = (key: string, max = 5000) => {
    const v = value[key];
    if (v === undefined) return "";
    if (typeof v !== "string" || v.length > max) throw new ValidationError(`Invalid ${key}.`);
    return v.trim();
  };
  const projectName = text("projectName", 120),
    teamName = text("teamName", 120),
    submitterNames = text("submitterNames", 500),
    contactEmail = text("contactEmail", 254);
  if (!projectName || !teamName || !submitterNames || !/^\S+@\S+\.\S+$/.test(contactEmail))
    throw new ValidationError("Enter a project name, team, builders and valid contact email.");
  return {
    projectName,
    teamName,
    submitterNames,
    contactEmail,
    track: text("track", 100),
    toolsUsed: text("toolsUsed", 1000)
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
    oneLiner: text("oneLiner", 300),
    description: text("description", 10000),
    progressOutline: text("progressOutline", 5000),
    previewImageUrl: safeUrl(value.previewImageUrl),
    teamPhotoUrl: safeUrl(value.teamPhotoUrl),
    demoUrl: safeUrl(value.demoUrl),
    demoVideoUrl: safeUrl(value.demoVideoUrl),
    repositoryUrl: safeUrl(value.repositoryUrl),
  };
}
export async function saveProject(eventId: string, input: Record<string, unknown>, admin = false) {
  const fields = submissionFields(input);
  const requestId =
    typeof input.requestId === "string" && /^[a-zA-Z0-9-]{20,100}$/.test(input.requestId)
      ? input.requestId
      : randomUUID();
  return changeEvent(eventId, (event) => {
    if (!admin && !event.config.settings?.submissionsOpen)
      throw new ConflictError("Submissions are closed.");
    const existing =
      typeof input.id === "string" ? event.submissions.find((s) => s.id === input.id) : undefined;
    if (input.id && !admin)
      throw new ValidationError("Only organizers can edit submitted projects.");
    if (input.id && !existing) throw new NotFoundError("Submission not found.");
    if (existing) {
      if (event.publication) throw new ConflictError("Published projects are locked.");
      Object.assign(existing, fields);
      return existing.id;
    }
    const duplicate = event.submissions.find((s) => s.id === requestId);
    if (duplicate) return duplicate.id;
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
