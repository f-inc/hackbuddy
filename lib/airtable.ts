import { eventScoringRepository } from "@/infrastructure/airtable/event-scoring-repository";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "@/server/http/errors";
import {
  validatePublication,
  applyPublishedScores,
} from "@/domain/publication";
import { AdminSubmissionService } from "@/application/admin-submission-service";
import { DashboardQuery } from "@/application/dashboard-query";
import { FinalsService } from "@/application/finals-service";
import type { SubmissionRepositoryProvider } from "@/application/ports/submission-repository";
import { QueueService } from "@/application/queue-service";
import { ResultsQuery } from "@/application/results-query";
import { JudgedProjectsQuery } from "@/application/judged-projects-query";
import type { ReviewScores } from "@/domain/submission";
import {
  airtableIsConfigured,
  airtableRepositoryFromContext,
} from "@/infrastructure/airtable/submission-repository";
import { demoSubmissionRepository } from "@/infrastructure/demo/submission-repository";

const repository: SubmissionRepositoryProvider = () =>
  airtableIsConfigured()
    ? airtableRepositoryFromContext()
    : demoSubmissionRepository;

const queue = new QueueService(repository);
const dashboard = new DashboardQuery(repository);
const results = new ResultsQuery(repository);
const judged = new JudgedProjectsQuery(repository);
const finals = new FinalsService(repository);
const admin = new AdminSubmissionService(repository);

export function isDemoMode() {
  return queue.isDemoMode();
}

export function getQueueStats() {
  return queue.getStats();
}

export async function claimNextSubmission(judgeName: string) {
  await mutableScoring();
  return queue.claimNext(judgeName);
}

export async function completeSubmission(
  id: string,
  judgeName: string,
  scores: ReviewScores,
) {
  await mutableScoring();
  return queue.complete(id, judgeName, scores);
}

export async function getDashboard(judgeName: string) {
  const state = await eventScoringRepository.read();
  return dashboard.execute(judgeName, state.scoringPolicy, state.publication);
}

export async function getResultsReport(includePending = false) {
  const state = await eventScoringRepository.read();
  return results.report(state.scoringPolicy, state.publication, undefined, includePending);
}

export async function getCompletedResults() {
  return (await getResultsReport()).results;
}

export async function getJudgedProjects(judgeName: string, id?: string) {
  const state = await eventScoringRepository.read();
  return judged.execute(judgeName, id, state.scoringPolicy, state.publication);
}

export async function getFinalsState(judgeName: string) {
  const state = await eventScoringRepository.read();
  return finals.state(judgeName, state.scoringPolicy, state.publication);
}

export async function startFinalRound(
  adminName: string,
  requestedJudges?: string[],
) {
  const state = await mutableScoring();
  return finals.start(adminName, requestedJudges, state.scoringPolicy);
}

export async function syncFinalRoundWithResults(adminName: string) {
  const state = await mutableScoring();
  return finals.sync(adminName, state.scoringPolicy);
}

export async function resetFinalRound(adminName: string) {
  const state = await mutableScoring();
  return finals.reset(adminName, state.scoringPolicy);
}

export async function getFinalistSubmission(id: string, judgeName: string) {
  const state = await eventScoringRepository.read();
  if (state.publication) {
    if (!state.publication.finals.judges.includes(judgeName))
      throw new ForbiddenError(
        "You are not part of the final-round judge roster.",
      );
    if (!state.publication.finals.finalists.some((entry) => entry.id === id))
      throw new ConflictError("This project is not a published finalist.");
    const submission = await getSubmissionById(id);
    if (!submission) throw new NotFoundError("Submission not found.");
    return submission;
  }
  return finals.finalist(id, judgeName, state.scoringPolicy);
}

export async function submitFinalReview(
  id: string,
  judgeName: string,
  scores: ReviewScores,
) {
  await mutableScoring();
  return finals.submitReview(id, judgeName, scores);
}

export async function submitFinalBallot(judgeName: string, picks: unknown) {
  const state = await mutableScoring();
  return finals.submitBallot(judgeName, picks, state.scoringPolicy);
}

export async function getSubmissionById(id: string) {
  const state = await eventScoringRepository.read();
  const submission = await repository().findById(id);
  return submission && state.publication
    ? applyPublishedScores(submission, state.publication)
    : submission;
}

export async function updateSubmissionReview(
  id: string,
  reviewIndex: number,
  scores: ReviewScores,
) {
  await mutableScoring();
  return admin.updateReview(id, reviewIndex, scores);
}

export async function releaseSubmission(id: string) {
  await mutableScoring();
  return admin.release(id);
}

async function mutableScoring() {
  const state = await eventScoringRepository.read();
  if (state.publication)
    throw new ConflictError(
      "Results are published and locked. Scores and finalist selections cannot be changed.",
    );
  return state;
}

export async function publishResults(adminName: string, winnerIds?: unknown) {
  const state = await eventScoringRepository.read();
  if (state.publication) return getFinalsState(adminName);
  // Both views use one ledger read, so the published preliminary and final
  // rankings cannot come from different reads of the event.
  const submissions = await repository().list();
  const report = await results.report(state.scoringPolicy, null, submissions);
  const finalState = await finals.state(
    adminName,
    state.scoringPolicy,
    null,
    submissions,
  );
  if (finalState.votingMode === "podium-v1") {
    const { validPicks } = await import("@/domain/final-ballot");
    if (!finalState.completedReviews)
      throw new ConflictError(
        "At least one submitted ballot is required before publication.",
      );
    if (winnerIds !== undefined) {
      if (
        !validPicks(winnerIds, new Set(finalState.finalists.map((s) => s.id)))
      )
        throw new ConflictError(
          "Choose three distinct finalists for the final podium.",
        );
      finalState.topThree = winnerIds.map(
        (id) => finalState.standings!.find((s) => s.id === id)!,
      );
      finalState.organizerOverride = true;
    } else {
      const ranked = finalState.standings!;
      const relevant = ranked.slice(0, 4);
      if (
        relevant.some(
          (entry, index) =>
            index > 0 && entry.votePoints === relevant[index - 1].votePoints,
        )
      )
        throw new ConflictError(
          "Confirm the final podium to resolve tied vote totals.",
        );
    }
  } else if (!finalState.allComplete)
    throw new ConflictError(
      "Every selected final judge must finish before results can be published.",
    );
  const publishedAt = new Date().toISOString();
  const snapshot = validatePublication({
    schemaVersion: 1,
    scoringPolicy: state.scoringPolicy,
    publishedAt,
    publishedBy: adminName,
    results: report.results,
    normalization: report.normalization,
    finals: { ...finalState, publishedAt },
  });
  await eventScoringRepository.publish(snapshot);
  return getFinalsState(adminName);
}
