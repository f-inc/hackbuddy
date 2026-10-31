import type { SubmissionRepository } from "@/application/ports/submission-repository";
import { aggregateReviews, statusForReviewCount } from "@/domain/scoring";
import type {
  FinalJudgingState,
  QueueStatus,
  ReviewPhase,
  Submission,
  SubmissionReview,
} from "@/domain/submission";
import {
  currentAirtableBase,
  currentAirtableReviewsTable,
  currentAirtableTable,
} from "@/lib/airtable-context";
import {
  ConfigurationError,
  ConflictError,
  NotFoundError,
  UpstreamError,
} from "@/server/http/errors";
import { AirtableClient, type AirtableRecord } from "./client";
import { airtableStatus, submissionField as field } from "./field-config";
import {
  AirtableReviewRepository,
  type StoredReview,
} from "./review-repository";

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function attachment(value: unknown) {
  if (typeof value === "string") {
    return { url: value, type: "", filename: "" };
  }
  if (!Array.isArray(value)) {
    return { url: "", type: "", filename: "" };
  }
  const first = value[0];
  if (!first || typeof first !== "object" || Array.isArray(first)) {
    return { url: "", type: "", filename: "" };
  }
  return {
    url: "url" in first && typeof first.url === "string" ? first.url : "",
    type: "type" in first && typeof first.type === "string" ? first.type : "",
    filename:
      "filename" in first && typeof first.filename === "string"
        ? first.filename
        : "",
  };
}

function normalizeStatus(value: unknown): QueueStatus {
  if (value === airtableStatus.completed) return "completed";
  if (value === airtableStatus["in progress"]) return "in progress";
  return "available";
}

function parseFinalState(
  value: unknown,
  reviews: SubmissionReview[],
): FinalJudgingState | null {
  if (typeof value !== "string" || !value.trim()) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (cause) {
    throw new UpstreamError("Final judging data is invalid JSON.", { cause });
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("startedAt" in parsed) ||
    typeof parsed.startedAt !== "string" ||
    !("judges" in parsed) ||
    !Array.isArray(parsed.judges) ||
    !parsed.judges.every((judge) => typeof judge === "string")
  ) {
    throw new UpstreamError("Final judging data does not match its schema.");
  }
  return {
    startedAt: parsed.startedAt,
    judges: parsed.judges
      .map((judge) => judge.trim().toLowerCase())
      .filter(Boolean),
    reviews,
  };
}

function reviewsForPhase(storedReviews: StoredReview[], phase: ReviewPhase) {
  const byJudge = new Map<string, SubmissionReview>();
  for (const stored of storedReviews) {
    if (stored.phase !== phase) continue;
    const existing = byJudge.get(stored.review.judgeName);
    if (
      !existing ||
      stored.review.completedAt.localeCompare(existing.completedAt) >= 0
    ) {
      byJudge.set(stored.review.judgeName, stored.review);
    }
  }
  return [...byJudge.values()].sort((a, b) =>
    a.completedAt.localeCompare(b.completedAt),
  );
}

function mapSubmission(
  record: AirtableRecord,
  storedReviews: StoredReview[],
): Submission {
  const values = record.fields;
  const teamName = text(values[field.teamName]) || "Unnamed team";
  const preview = attachment(values[field.preview]);
  const teamPhoto = attachment(values[field.teamPhoto]);
  const uploadedDemo = attachment(
    values[field.demoUrl] ?? values["Video Demo"] ?? values.Demo,
  );
  const demo = uploadedDemo.url
    ? uploadedDemo
    : attachment(values[field.demoVideoUrl]);
  const reviews = reviewsForPhase(storedReviews, "preliminary");
  const finalReviews = reviewsForPhase(storedReviews, "final");
  const rawStatus = normalizeStatus(values[field.status]);
  const aggregate = aggregateReviews(reviews);
  const status = statusForReviewCount(
    reviews.length,
    rawStatus === "in progress",
  );

  return {
    id: record.id,
    teamName,
    projectName: text(values[field.projectName]) || teamName,
    submitterNames: text(values[field.submitters]),
    contactEmail: text(values[field.email]),
    attendance: text(values[field.attendance]),
    oneLiner: text(values[field.oneLiner]) || text(values[field.description]),
    description: text(values[field.description]),
    previewImageUrl: preview.url,
    teamPhotoUrl: teamPhoto.url,
    demoUrl: demo.url,
    demoVideoUrl: text(values[field.demoVideoUrl]),
    demoType: demo.type,
    demoFilename: demo.filename,
    repositoryUrl: text(values[field.repositoryUrl]),
    toolsUsed: Array.isArray(values[field.toolsUsed])
      ? (values[field.toolsUsed] as unknown[]).filter(
          (value): value is string => typeof value === "string",
        )
      : text(values[field.toolsUsed])
        ? [text(values[field.toolsUsed])]
        : [],
    progressOutline: text(values[field.progressOutline]),
    track: text(values[field.track]) || "General",
    status,
    createdAt: text(values[field.submittedAt]) || record.createdTime,
    claimedBy: text(values[field.claimedBy]),
    claimedAt: text(values[field.claimedAt]),
    completedAt:
      status === "completed"
        ? text(values[field.completedAt]) || reviews.at(-1)?.completedAt || ""
        : "",
    progressScore: reviews.length ? aggregate.progress : null,
    practicalityScore: reviews.length ? aggregate.practicality : null,
    complexityScore: reviews.length ? aggregate.complexity : null,
    totalScore: reviews.length ? aggregate.total : null,
    notes: reviews
      .map((review) => review.notes)
      .filter(Boolean)
      .join("\n\n"),
    reviews,
    finalJudging: parseFinalState(values[field.finalJudging], finalReviews),
  };
}

function groupReviews(reviews: StoredReview[]) {
  const result = new Map<string, StoredReview[]>();
  for (const review of reviews) {
    const current = result.get(review.submissionId) ?? [];
    current.push(review);
    result.set(review.submissionId, current);
  }
  return result;
}

export class AirtableSubmissionRepository implements SubmissionRepository {
  readonly demoMode = false;
  private readonly submissions: AirtableClient;
  private readonly reviews: AirtableReviewRepository;

  constructor(baseId: string, tableName: string, reviewsTableName: string) {
    this.submissions = new AirtableClient(baseId, tableName);
    this.reviews = new AirtableReviewRepository(
      new AirtableClient(baseId, reviewsTableName),
    );
  }

  async list() {
    const [records, reviews] = await Promise.all([
      this.submissions.list(),
      this.reviews.list(),
    ]);
    const grouped = groupReviews(reviews);
    return records.map((record) =>
      mapSubmission(record, grouped.get(record.id) ?? []),
    );
  }

  async findById(id: string) {
    let record: AirtableRecord;
    try {
      record = await this.submissions.get(id);
    } catch (error) {
      if (error instanceof NotFoundError) return null;
      throw error;
    }
    const reviews = await this.reviews.list({ submissionId: id });
    return mapSubmission(record, reviews);
  }

  async tryClaim(id: string, judgeName: string) {
    const claimToken = crypto.randomUUID();
    await this.submissions.update(id, {
      [field.status]: airtableStatus["in progress"],
      [field.claimedBy]: judgeName,
      [field.claimedAt]: new Date().toISOString(),
      [field.claimToken]: claimToken,
    });
    const verified = await this.submissions.get(id);
    if (verified.fields[field.claimToken] !== claimToken) return null;
    const reviews = await this.reviews.list({ submissionId: id });
    return mapSubmission(verified, reviews);
  }

  async saveReview(id: string, phase: ReviewPhase, review: SubmissionReview) {
    await this.reviews.upsert(id, phase, review);
  }

  async savePreliminaryProjection(
    id: string,
    reviews: SubmissionReview[],
    completedAt: string,
  ) {
    const aggregate = aggregateReviews(reviews);
    const status = statusForReviewCount(reviews.length);
    await this.submissions.update(id, {
      [field.progress]: aggregate.progress,
      [field.practicality]: aggregate.practicality,
      [field.complexity]: aggregate.complexity,
      [field.total]: aggregate.total,
      [field.notes]: aggregate.notes,
      [field.status]: airtableStatus[status],
      [field.completedAt]: status === "completed" ? completedAt : null,
      [field.claimedBy]: null,
      [field.claimedAt]: null,
      [field.claimToken]: null,
    });
  }

  async deleteReviews(phase: ReviewPhase) {
    await this.reviews.delete(phase);
  }

  async setFinalState(id: string, state: FinalJudgingState) {
    await this.submissions.update(id, {
      [field.finalJudging]: JSON.stringify({ ...state, reviews: [] }),
    });
  }

  async clearFinalState(id: string) {
    await this.submissions.update(id, { [field.finalJudging]: "" });
  }

  async release(id: string) {
    const current = await this.submissions.get(id);
    if (current.fields[field.status] !== airtableStatus["in progress"]) {
      throw new ConflictError(
        "Only an active judging session can be released.",
      );
    }
    await this.submissions.update(id, {
      [field.status]: airtableStatus.available,
      [field.claimedBy]: null,
      [field.claimedAt]: null,
      [field.claimToken]: null,
    });
  }
}

export function airtableRepositoryFromContext() {
  const baseId = currentAirtableBase();
  const tableName = currentAirtableTable();
  const reviewsTableName = currentAirtableReviewsTable();
  if (!baseId || !tableName || !reviewsTableName) {
    throw new ConfigurationError(
      "The Airtable submission and review tables are not configured.",
    );
  }
  return new AirtableSubmissionRepository(baseId, tableName, reviewsTableName);
}

export function airtableIsConfigured() {
  const apiKey = process.env.AIRTABLE_API_KEY?.trim();
  const baseId = currentAirtableBase()?.trim();
  const tableName = currentAirtableTable()?.trim();
  const reviewsTableName = currentAirtableReviewsTable()?.trim();
  if (!apiKey && !baseId && !tableName) return false;
  if (!apiKey || !baseId || !tableName || !reviewsTableName) {
    throw new ConfigurationError(
      "AIRTABLE_API_KEY, Airtable base, submissions table, and reviews table must be configured together.",
    );
  }
  if (!/^app[a-zA-Z0-9]+$/.test(baseId)) {
    throw new ConfigurationError("The configured Airtable base ID is invalid.");
  }
  return true;
}
