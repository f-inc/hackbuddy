import type { SubmissionRepository } from "@/application/ports/submission-repository";
import type { Submission, ReviewScores } from "@/domain/submission";
import { isHillClimb } from "@/domain/hill-climb";
import { aggregateReviews, createReview, hasReviewBy } from "@/domain/scoring";
import { currentEventConfig } from "@/lib/event-context";
import { eventSettings } from "@/domain/event-settings";
import { changeEvent, readEvent, type EventRecord } from "./events";
import { ConflictError, NotFoundError } from "@/server/http/errors";
const expiry = 15 * 60 * 1000;
function project(event: EventRecord, submission: Submission): Submission {
  const active = !!submission.claimedBy && Date.parse(submission.claimedAt) + expiry > Date.now();
  const completed =
    submission.reviews.length >= eventSettings(event.config.settings).requiredReviews;
  const scores = aggregateReviews(submission.reviews);
  return {
    ...submission,
    status: completed ? "completed" : active ? "in progress" : "available",
    claimedBy: active && !completed ? submission.claimedBy : "",
    claimedAt: active && !completed ? submission.claimedAt : "",
    progressScore: submission.reviews.length ? scores.progress : null,
    practicalityScore: submission.reviews.length ? scores.practicality : null,
    complexityScore: submission.reviews.length ? scores.complexity : null,
    totalScore: submission.reviews.length ? scores.total : null,
    notes: scores.notes,
  };
}
function find(event: EventRecord, id: string) {
  const s = event.submissions.find((s) => s.id === id);
  if (!s) throw new NotFoundError("Submission not found.");
  return s;
}
function mutable(event: EventRecord) {
  if (event.publication) throw new ConflictError("Published results are locked.");
}
export function databaseSubmissionRepository(): SubmissionRepository {
  const id = currentEventConfig()!.id;
  return {
    demoMode: false,
    async list() {
      const row = await readEvent(id);
      return row ? row.data.submissions.map((s) => project(row.data, s)) : [];
    },
    async findById(sid) {
      return (await this.list()).find((s) => s.id === sid) || null;
    },
    async tryClaim(sid, judge) {
      return changeEvent(id, (event) => {
        mutable(event);
        const s = find(event, sid);
        const current = project(event, s);
        const relay = (entry: Submission) =>
          event.config.settings?.submissionForm === "makermods-physical-ai" && isHillClimb(entry);
        if (
          relay(s) ||
          current.status !== "available" ||
          hasReviewBy(s.reviews, judge) ||
          event.submissions.some((other) => !relay(other) && project(event, other).claimedBy === judge)
        )
          return null;
        s.claimedBy = judge;
        s.claimedAt = new Date().toISOString();
        return project(event, s);
      });
    },
    async saveReview(sid, phase, review) {
      await changeEvent(id, (event) => {
        mutable(event);
        const s = find(event, sid);
        const reviews = phase === "preliminary" ? s.reviews : s.finalJudging?.reviews;
        if (!reviews) throw new ConflictError("This project is not in the final round.");
        const index = reviews.findIndex((r) => r.judgeName === review.judgeName);
        if (index < 0) reviews.push(review);
        else reviews[index] = review;
      });
    },
    async savePreliminaryProjection() {
      /* Aggregates are derived from the authoritative reviews on read. */
    },
    async deleteReviews(phase) {
      await changeEvent(id, (event) => {
        mutable(event);
        for (const s of event.submissions) {
          if (phase === "preliminary") s.reviews = [];
          else if (s.finalJudging) s.finalJudging.reviews = [];
        }
      });
    },
    async setFinalState(sid, state) {
      await changeEvent(id, (event) => {
        mutable(event);
        find(event, sid).finalJudging = state;
      });
    },
    async clearFinalState(sid) {
      await changeEvent(id, (event) => {
        mutable(event);
        find(event, sid).finalJudging = null;
      });
    },
    async release(sid) {
      await changeEvent(id, (event) => {
        mutable(event);
        const s = find(event, sid);
        s.claimedBy = "";
        s.claimedAt = "";
      });
    },
  };
}
export async function completeDatabaseReview(sid: string, judge: string, scores: ReviewScores) {
  const eventId = currentEventConfig()!.id;
  await changeEvent(eventId, (event) => {
    mutable(event);
    const s = find(event, sid);
    if (event.config.settings?.submissionForm === "makermods-physical-ai" && isHillClimb(s))
      throw new ConflictError("Hill Climb uses the relay rubric. Open the Hill Climb judging section.");
    const previous = s.reviews.find((r) => r.judgeName === judge);
    if (previous) {
      if (
        previous.progressScore === scores.progress &&
        previous.practicalityScore === scores.practicality &&
        previous.complexityScore === scores.complexity &&
        previous.notes === scores.notes.trim()
      )
        return;
      throw new ConflictError("You already reviewed this submission.");
    }
    if (project(event, s).claimedBy !== judge)
      throw new ConflictError(
        "This reservation expired. Reload the queue; your draft is retained.",
      );
    s.completedAt = new Date().toISOString();
    s.reviews.push(createReview(judge, scores, s.completedAt));
    s.claimedBy = "";
    s.claimedAt = "";
    delete event.drafts[`${judge}:${sid}`];
  });
}
export async function draftDatabaseReview(
  sid: string,
  judge: string,
  scores?: Partial<ReviewScores>,
) {
  const eventId = currentEventConfig()!.id;
  if (!scores) return (await readEvent(eventId))?.data.drafts[`${judge}:${sid}`] || null;
  return changeEvent(eventId, (event) => {
    mutable(event);
    const s = find(event, sid);
    if (project(event, s).claimedBy !== judge)
      throw new ConflictError("This reservation expired. Your local draft is retained.");
    s.claimedAt = new Date().toISOString();
    return (event.drafts[`${judge}:${sid}`] = { scores, updatedAt: new Date().toISOString() });
  });
}
