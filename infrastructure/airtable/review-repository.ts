import type {
  ReviewPhase,
  SubmissionReview,
} from "@/domain/submission";
import { isValidRubricScore } from "@/domain/scoring";
import { UpstreamError } from "@/server/http/errors";
import {
  AirtableClient,
  airtableFormula,
  parseListResponse,
  type AirtableRecord,
} from "./client";
import { reviewField } from "./field-config";

export type StoredReview = {
  id: string;
  submissionId: string;
  phase: ReviewPhase;
  review: SubmissionReview;
};

function parseStoredReview(record: AirtableRecord): StoredReview {
  const fields = record.fields;
  const submissionId = fields[reviewField.submissionId];
  const phase = fields[reviewField.phase];
  const judgeName = fields[reviewField.judgeName];
  const progressScore = fields[reviewField.progress];
  const practicalityScore = fields[reviewField.practicality];
  const complexityScore = fields[reviewField.complexity];
  const totalScore = fields[reviewField.total];
  const notes = fields[reviewField.notes];
  const completedAt = fields[reviewField.completedAt];
  if (
    typeof submissionId !== "string" ||
    (phase !== "preliminary" && phase !== "final") ||
    typeof judgeName !== "string" ||
    !judgeName.trim() ||
    !isValidRubricScore(progressScore) ||
    !isValidRubricScore(practicalityScore) ||
    !isValidRubricScore(complexityScore) ||
    !Number.isInteger(totalScore) ||
    Number(totalScore) !==
      Number(progressScore) +
        Number(practicalityScore) +
        Number(complexityScore) ||
    typeof completedAt !== "string"
  ) {
    throw new UpstreamError(
      `Airtable review ${record.id} does not match the review schema.`,
    );
  }
  return {
    id: record.id,
    submissionId,
    phase,
    review: {
      judgeName: judgeName.trim().toLowerCase(),
      progressScore: Number(progressScore),
      practicalityScore: Number(practicalityScore),
      complexityScore: Number(complexityScore),
      totalScore: Number(totalScore),
      notes: typeof notes === "string" ? notes : "",
      completedAt,
    },
  };
}

export function reviewKey(
  phase: ReviewPhase,
  submissionId: string,
  judgeName: string,
) {
  return `${phase}:${submissionId}:${judgeName.trim().toLowerCase()}`;
}

export class AirtableReviewRepository {
  constructor(private readonly client: AirtableClient) {}

  async list(options?: {
    submissionId?: string;
    phase?: ReviewPhase;
  }) {
    const filters: string[] = [];
    if (options?.submissionId) {
      filters.push(
        airtableFormula(reviewField.submissionId, options.submissionId),
      );
    }
    if (options?.phase) {
      filters.push(airtableFormula(reviewField.phase, options.phase));
    }
    const filter =
      filters.length > 1 ? `AND(${filters.join(",")})` : filters[0];
    const records: AirtableRecord[] = [];
    let offset: string | undefined;
    do {
      const params = new URLSearchParams({ pageSize: "100" });
      if (filter) params.set("filterByFormula", filter);
      if (offset) params.set("offset", offset);
      const page = parseListResponse(await this.client.request(`?${params}`));
      records.push(...page.records);
      offset = page.offset;
    } while (offset);
    return records.map(parseStoredReview);
  }

  async upsert(
    submissionId: string,
    phase: ReviewPhase,
    review: SubmissionReview,
  ) {
    const normalizedJudge = review.judgeName.trim().toLowerCase();
    const value = await this.client.request("", {
      method: "PATCH",
      body: JSON.stringify({
        performUpsert: { fieldsToMergeOn: [reviewField.key] },
        records: [
          {
            fields: {
              [reviewField.key]: reviewKey(
                phase,
                submissionId,
                normalizedJudge,
              ),
              [reviewField.submissionId]: submissionId,
              [reviewField.phase]: phase,
              [reviewField.judgeName]: normalizedJudge,
              [reviewField.progress]: review.progressScore,
              [reviewField.practicality]: review.practicalityScore,
              [reviewField.complexity]: review.complexityScore,
              [reviewField.total]: review.totalScore,
              [reviewField.notes]: review.notes,
              [reviewField.completedAt]: review.completedAt,
            },
          },
        ],
      }),
    });
    const response = parseListResponse(value);
    if (!response.records[0]) {
      throw new UpstreamError("Airtable did not return the saved review.");
    }
    return parseStoredReview(response.records[0]);
  }

  async delete(phase: ReviewPhase) {
    const reviews = await this.list({ phase });
    for (let index = 0; index < reviews.length; index += 10) {
      const params = new URLSearchParams();
      for (const review of reviews.slice(index, index + 10)) {
        params.append("records[]", review.id);
      }
      await this.client.request(`?${params}`, { method: "DELETE" });
    }
  }
}
