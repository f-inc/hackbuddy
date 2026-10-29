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
    !isValidRubricScore(body.practicality) ||
    !isValidRubricScore(body.complexity)
  ) {
    throw new ValidationError(
      `Every rubric score must be a whole number between ${JUDGING_POLICY.score.min} and ${JUDGING_POLICY.score.max}.`,
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

  if (body.judges === undefined) return { action };
  if (
    !Array.isArray(body.judges) ||
    !body.judges.every(
      (judge) => typeof judge === "string" && judge.trim().length <= 80,
    )
  ) {
    throw new ValidationError("The final judge roster is invalid.");
  }
  return {
    action,
    judges: body.judges.map((judge) => judge.trim()).filter(Boolean),
  };
}

export function parseLoginRequest(value: unknown) {
  const body = record(value, "The sign-in request must be an object.");
  return {
    name: requiredString(
      body.name,
      "Enter your name so submissions can be assigned to you.",
      80,
    ),
    password: requiredString(body.password, "Enter your password.", 500),
    hackathon:
      body.hackathon === undefined
        ? undefined
        : requiredString(body.hackathon, "The hackathon is invalid.", 100),
  };
}

export type HackathonInput = {
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
    scoringPolicy: body.scoringPolicy as ScoringPolicy | undefined,
    name: requiredString(body.name, "Hackathon name is required.", 120),
    slug: optionalString(body.slug, "The URL slug is invalid.", 120),
    baseId: requiredString(body.baseId, "Airtable base ID is required.", 100),
    tableName: requiredString(
      body.tableName,
      "Airtable table name is required.",
      200,
    ),
    reviewsTableName:
      body.reviewsTableName === undefined
        ? undefined
        : requiredString(
            body.reviewsTableName,
            "Airtable reviews table name is required.",
            200,
          ),
    imageUrl: optionalString(body.imageUrl, "Image URL is invalid.", 2_000),
    squareImageUrl: optionalString(
      body.squareImageUrl,
      "Square image URL is invalid.",
      2_000,
    ),
  };
}

export function parseCreateHackathonRequest(value: unknown) {
  return parseHackathonFields(
    record(value, "The hackathon request must be an object."),
  );
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
