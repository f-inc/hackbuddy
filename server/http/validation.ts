import { currentEventSettings } from "@/lib/event-context";
import { eventSettings, type EventSettings } from "@/domain/event-settings";
import { validPicks } from "@/domain/final-ballot";
import { SCORING_POLICIES, type ScoringPolicy } from "@/domain/event-scoring";
import { isValidRubricScore } from "@/domain/scoring";
import { JUDGING_POLICY } from "@/domain/judging-policy";
import type { ReviewScores } from "@/domain/submission";
import { ValidationError } from "./errors";

type UnknownRecord = Record<string, unknown>;

function record(value: unknown, message: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError(message);
  }
  return value as UnknownRecord;
}

function requiredString(value: unknown, message: string, maxLength = 500) {
  if (typeof value !== "string" || !value.trim()) {
    throw new ValidationError(message);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) throw new ValidationError(message);
  return normalized;
}

function optionalString(value: unknown, message: string, maxLength = 5_000) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string" || value.length > maxLength) {
    throw new ValidationError(message);
  }
  return value.trim();
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch (cause) {
    throw new ValidationError("The request body must be valid JSON.", {
      cause,
    });
  }
}

export function parseReviewRequest(value: unknown): {
  id: string;
  scores: ReviewScores;
} {
  const body = record(value, "The review request must be an object.");
  if (
    !isValidRubricScore(body.progress) ||
    Number(body.progress) > currentEventSettings().scoreMax ||
    !isValidRubricScore(body.practicality) ||
    Number(body.practicality) > currentEventSettings().scoreMax ||
    !isValidRubricScore(body.complexity) ||
    Number(body.complexity) > currentEventSettings().scoreMax
  ) {
    throw new ValidationError(
      `Every rubric score must be a whole number between ${JUDGING_POLICY.score.min} and ${currentEventSettings().scoreMax}.`,
    );
  }
  return {
    id: requiredString(body.id, "Submission ID is required.", 100),
    scores: {
      progress: body.progress,
      practicality: body.practicality,
      complexity: body.complexity,
      notes: optionalString(
        body.notes,
        "Judge notes must be text no longer than 5,000 characters.",
      ),
    },
  };
}

export function parseReviewEditRequest(value: unknown) {
  const body = record(value, "The review request must be an object.");
  const review = parseReviewRequest(body);
  if (!Number.isInteger(body.reviewIndex) || Number(body.reviewIndex) < 0) {
    throw new ValidationError("A valid review index is required.");
  }
  return { ...review, reviewIndex: Number(body.reviewIndex) };
}

export function parseSkippedIds(value: unknown): string[] {
  const body = record(value, "The request must be an object.");
  if (body.skippedIds === undefined) return [];
  if (!Array.isArray(body.skippedIds)) {
    throw new ValidationError("Skipped submission IDs must be an array.");
  }
  return [
    ...new Set(
      body.skippedIds.map((id) => requiredString(id, "Skipped submission IDs are invalid.", 100)),
    ),
  ];
}

export function parseSubmissionIdRequest(value: unknown) {
  const body = record(value, "The request must be an object.");
  return {
    id: requiredString(body.id, "Submission ID is required.", 100),
  };
}

export function parseUrlRequest(value: unknown) {
  const body = record(value, "The request must be an object.");
  return {
    url: requiredString(body.url, "URL is required.", 2_000),
  };
}

export function parseFinalsActionRequest(value: unknown): {
  action: "start" | "reset" | "sync" | "publish";
  judges?: string[];
  winnerIds?: [string, string, string];
} {
  const body = record(value, "The final-round request must be an object.");
  const action =
    body.action === undefined
      ? "start"
      : body.action === "start" ||
          body.action === "reset" ||
          body.action === "sync" ||
          body.action === "publish"
        ? body.action
        : null;
  if (!action) throw new ValidationError("The final-round action is invalid.");

  const winnerIds =
    body.winnerIds === undefined ? undefined : parseBallotRequest({ picks: body.winnerIds });
  if (body.judges === undefined) return { action, winnerIds };
  if (
    !Array.isArray(body.judges) ||
    !body.judges.every((judge) => typeof judge === "string" && judge.trim().length <= 80)
  ) {
    throw new ValidationError("The final judge roster is invalid.");
  }
  return {
    action,
    winnerIds,
    judges: body.judges.map((judge) => judge.trim()).filter(Boolean),
  };
}

export function parseBallotRequest(value: unknown): [string, string, string] {
  const body = record(value, "The ballot must be an object.");
  if (!validPicks(body.picks))
    throw new ValidationError(
      "Select three distinct finalists for first, second, and third place.",
    );
  return body.picks;
}

export function parseLoginRequest(value: unknown) {
  const body = record(value, "The sign-in request must be an object.");
  return {
    name: requiredString(body.name, "Enter your name so submissions can be assigned to you.", 80),
    password: requiredString(body.password, "Enter your password.", 500),
    hackathon:
      body.hackathon === undefined
        ? undefined
        : requiredString(body.hackathon, "The hackathon is invalid.", 100),
  };
}

export type HackathonInput = {
  settings?: EventSettings;
  name: string;
  slug: string;
  baseId: string;
  tableName: string;
  reviewsTableName?: string;
  scoringPolicy?: ScoringPolicy;
  imageUrl: string;
  squareImageUrl: string;
};

function parseHackathonFields(body: UnknownRecord): HackathonInput {
  if (
    body.scoringPolicy !== undefined &&
    !SCORING_POLICIES.includes(body.scoringPolicy as ScoringPolicy)
  ) {
    throw new ValidationError("The scoring policy is invalid.");
  }
  return {
    settings: body.settings === undefined ? undefined : parseEventSettings(body.settings),
    scoringPolicy: body.scoringPolicy as ScoringPolicy | undefined,
    name: requiredString(body.name, "Hackathon name is required.", 120),
    slug: optionalString(body.slug, "The URL slug is invalid.", 120),
    baseId: optionalString(body.baseId, "Airtable base ID is invalid.", 100),
    tableName: optionalString(body.tableName, "Airtable table name is invalid.", 200),
    reviewsTableName:
      body.reviewsTableName === undefined
        ? undefined
        : requiredString(body.reviewsTableName, "Airtable reviews table name is required.", 200),
    imageUrl: optionalString(body.imageUrl, "Image URL is invalid.", 2_000),
    squareImageUrl: optionalString(body.squareImageUrl, "Square image URL is invalid.", 2_000),
  };
}

export function parseCreateHackathonRequest(value: unknown) {
  return parseHackathonFields(record(value, "The hackathon request must be an object."));
}

export function parseUpdateHackathonRequest(value: unknown) {
  const body = record(value, "The hackathon request must be an object.");
  if (body.active !== undefined && typeof body.active !== "boolean") {
    throw new ValidationError("Active must be true or false.");
  }
  return {
    id: requiredString(body.id, "Hackathon ID is required.", 100),
    ...parseHackathonFields(body),
    active: body.active as boolean | undefined,
  };
}

export function parseEventSettings(value: unknown): EventSettings {
  const body = record(value, "Settings must be an object.");
  const defaults = eventSettings();
  if (
    body.submissionForm !== undefined &&
    body.submissionForm !== "standard" &&
    body.submissionForm !== "makermods-physical-ai"
  ) throw new ValidationError("Invalid submission form template.");
  const whole = (key: string, min: number, max: number) => {
    const n = Number(body[key] ?? defaults[key as keyof EventSettings]);
    if (!Number.isInteger(n) || n < min || n > max)
      throw new ValidationError(`${key} must be between ${min} and ${max}.`);
    return n;
  };
  const scoreMax = whole("scoreMax", 5, 10);
  if (scoreMax !== 5 && scoreMax !== 10) throw new ValidationError("Choose 1–5 or 1–10 scoring.");
  const raw = body.collections ?? [];
  if (!Array.isArray(raw) || raw.length > 30)
    throw new ValidationError("Use at most 30 collections.");
  const collections = raw.map((item) => {
    const c = record(item, "Invalid collection.");
    return {
      id: requiredString(c.id, "Collection ID is required.", 100),
      name: requiredString(c.name, "Collection name is required.", 120),
      tool: optionalString(c.tool, "Invalid tool.", 100),
      track: optionalString(c.track, "Invalid track.", 100),
      sponsor: optionalString(c.sponsor, "Invalid sponsor.", 120),
      prize: optionalString(c.prize, "Invalid award.", 500),
      logo: safeUrl(c.logo),
    };
  });
  if (new Set(collections.map((c) => c.id)).size !== collections.length)
    throw new ValidationError("Collection IDs must be unique.");
  const rawSponsors = body.sponsors ?? [];
  if (!Array.isArray(rawSponsors) || rawSponsors.length > 30)
    throw new ValidationError("Use at most 30 sponsors.");
  const sponsors = rawSponsors.map((item) => {
    const sponsor = record(item, "Invalid sponsor.");
    const logo = optionalString(sponsor.logo, "Invalid sponsor logo.", 2000);
    return {
      id: requiredString(sponsor.id, "Sponsor ID is required.", 100),
      name: requiredString(sponsor.name, "Sponsor name is required.", 120),
      logo: /^\/sponsors\/[a-zA-Z0-9-]+\.svg$/.test(logo) ? logo : safeUrl(logo),
    };
  });
  if (new Set(sponsors.map((s) => s.id)).size !== sponsors.length)
    throw new ValidationError("Sponsor IDs must be unique.");
  return {
    ...(body.sponsors === undefined ? {} : { sponsors }),
    ...(body.submissionForm === undefined
      ? {}
      : { submissionForm: body.submissionForm as EventSettings["submissionForm"] }),
    requiredReviews: whole("requiredReviews", 1, 20),
    finalistCount: whole("finalistCount", 5, 20),
    scoreMax,
    submissionsOpen: body.submissionsOpen === undefined ? true : body.submissionsOpen === true,
    collections,
  };
}
export function safeUrl(value: unknown) {
  const s = optionalString(value, "Invalid URL.", 2000);
  if (!s) return "";
  try {
    const u = new URL(s);
    if (!["http:", "https:"].includes(u.protocol) || u.username || u.password) throw new Error();
    return u.toString();
  } catch {
    throw new ValidationError("Use a valid http or https URL.");
  }
}
