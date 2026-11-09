import type { SubmissionRepository } from "@/application/ports/submission-repository";
import type { Submission, ReviewScores } from "@/domain/submission";
import { sameCreative } from "@/domain/creative-rubric";
import { isHillClimb } from "@/domain/hill-climb";
import { aggregateReviews, createReview, hasReviewBy } from "@/domain/scoring";
import { currentEventConfig } from "@/lib/event-context";
import { eventSettings } from "@/domain/event-settings";
import { changeEvent, readEvent, type EventRecord } from "./events";
import { ConflictError, NotFoundError } from "@/server/http/errors";
const expiry = 15 * 60 * 1000;
function parallel(event: EventRecord) {
  return event.config.settings?.submissionForm === "makermods-physical-ai";
}
function claims(submission: Submission): Record<string, string> {
  const all = { ...submission.judgeClaims };
  // Preserve reservations created before concurrent judging was deployed.
  if (submission.claimedBy && !all[submission.claimedBy])
    all[submission.claimedBy] = submission.claimedAt;
  return Object.fromEntries(Object.entries(all).filter(([judge, at]) =>
    Date.parse(at) + expiry > Date.now() && !hasReviewBy(submission.reviews, judge)));
}
function project(event: EventRecord, submission: Submission, judge?: string): Submission {
  const activeClaims = parallel(event) ? claims(submission) : {};
  const owner = parallel(event)
    ? (judge ? (activeClaims[judge] ? judge : "") : Object.keys(activeClaims)[0] || "")
    : submission.claimedBy;
  const at = parallel(event) ? activeClaims[owner] || "" : submission.claimedAt;
  const active = !!owner && Date.parse(at) + expiry > Date.now();
  const completed = submission.reviews.length >= eventSettings(event.config.settings).requiredReviews;
  const scores = aggregateReviews(submission.reviews);
  return {
    ...submission,
    status: judge && active ? "in progress" : completed ? "completed" : active ? "in progress" : "available",
    claimedBy: active && (!completed || !!judge) ? owner : "",
    claimedAt: active && (!completed || !!judge) ? at : "",
    progressScore: submission.reviews.length ? scores.progress : null,
    practicalityScore: submission.reviews.length ? scores.practicality : null,
    complexityScore: submission.reviews.length ? scores.complexity : null,
    totalScore: submission.reviews.length ? scores.total : null,
    notes: scores.notes,
  };
}
function releaseClaim(s: Submission, judge?: string) {
  if (!judge) { s.judgeClaims = {}; s.claimedBy = ""; s.claimedAt = ""; return; }
  s.judgeClaims = claims(s);
  delete s.judgeClaims[judge];
  if (s.claimedBy === judge) { s.claimedBy = ""; s.claimedAt = ""; }
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
    async list(judge) {
      const row = await readEvent(id);
      return row ? row.data.submissions.map((s) => project(row.data, s, judge)) : [];
    },
    async findById(sid, judge) {
      return (await this.list(judge)).find((s) => s.id === sid) || null;
    },
    async tryClaim(sid, judge) {
      return changeEvent(id, (event) => {
        mutable(event);
        const s = find(event, sid);
        const current = project(event, s, judge);
        const relay = (entry: Submission) =>
          event.config.settings?.submissionForm === "makermods-physical-ai" && isHillClimb(entry);
        if (
          relay(s) ||
          current.status !== "available" ||
          hasReviewBy(s.reviews, judge) ||
          event.submissions.some((other) => !relay(other) && project(event, other, judge).claimedBy === judge)
        )
          return null;
        if (parallel(event)) {
          s.judgeClaims = { ...claims(s), [judge]: new Date().toISOString() };
        } else {
          s.claimedBy = judge;
          s.claimedAt = new Date().toISOString();
        }
        return project(event, s, judge);
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
    async release(sid, judge) {
      await changeEvent(id, (event) => {
        mutable(event);
        const s = find(event, sid);
        releaseClaim(s, judge);
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
        previous.notes === scores.notes.trim() &&
        sameCreative(previous.creative, scores.creative)
      )
        return;
      throw new ConflictError("You already reviewed this submission.");
    }
    if (project(event, s, judge).claimedBy !== judge)
      throw new ConflictError(
        "This reservation expired. Reload the queue; your draft is retained.",
      );
    s.completedAt = new Date().toISOString();
    s.reviews.push(createReview(judge, scores, s.completedAt));
    releaseClaim(s, judge);
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
    if (project(event, s, judge).claimedBy !== judge)
      throw new ConflictError("This reservation expired. Your local draft is retained.");
    if (parallel(event)) s.judgeClaims = { ...claims(s), [judge]: new Date().toISOString() };
    else s.claimedAt = new Date().toISOString();
    return (event.drafts[`${judge}:${sid}`] = { scores, updatedAt: new Date().toISOString() });
  });
}

// Switching is one transaction: validate the destination before releasing this
// judge's other reservations. Other judges and all saved drafts are untouched.
export async function selectMakerModsProject(sid: string, judge: string) {
  const config = currentEventConfig();
  if (config?.storage !== "database" || config.settings?.submissionForm !== "makermods-physical-ai")
    throw new ConflictError("Project selection is only available for MakerMods.");
  return changeEvent(config.id, event => {
    mutable(event);
    const target = find(event, sid);
    if (isHillClimb(target))
      throw new ConflictError("Hill Climb is judged in the Hill Climb section.");
    if (hasReviewBy(target.reviews, judge))
      throw new ConflictError("You already reviewed this project.");
    for (const entry of event.submissions)
      if (entry.id !== sid && !isHillClimb(entry)) releaseClaim(entry, judge);
    target.judgeClaims = { ...claims(target), [judge]: new Date().toISOString() };
    return project(event, target, judge);
  });
}
