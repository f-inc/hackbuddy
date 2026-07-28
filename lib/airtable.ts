import { AdminSubmissionService } from "@/application/admin-submission-service";
import { DashboardQuery } from "@/application/dashboard-query";
import { FinalsService } from "@/application/finals-service";
import type { SubmissionRepositoryProvider } from "@/application/ports/submission-repository";
import { QueueService } from "@/application/queue-service";
import { ResultsQuery } from "@/application/results-query";
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
const finals = new FinalsService(repository);
const admin = new AdminSubmissionService(repository);

export function isDemoMode() {
  return queue.isDemoMode();
}

export function getQueueStats() {
  return queue.getStats();
}

export function claimNextSubmission(judgeName: string) {
  return queue.claimNext(judgeName);
}

export function completeSubmission(
  id: string,
  judgeName: string,
  scores: ReviewScores,
) {
  return queue.complete(id, judgeName, scores);
}

export function getDashboard(judgeName: string) {
  return dashboard.execute(judgeName);
}

export function getCompletedResults() {
  return results.execute();
}

export function getFinalsState(judgeName: string) {
  return finals.state(judgeName);
}

export function startFinalRound(
  adminName: string,
  requestedJudges?: string[],
) {
  return finals.start(adminName, requestedJudges);
}

export function syncFinalRoundWithResults(adminName: string) {
  return finals.sync(adminName);
}

export function resetFinalRound(adminName: string) {
  return finals.reset(adminName);
}

export function getFinalistSubmission(id: string, judgeName: string) {
  return finals.finalist(id, judgeName);
}

export function submitFinalReview(
  id: string,
  judgeName: string,
  scores: ReviewScores,
) {
  return finals.submitReview(id, judgeName, scores);
}

export function getSubmissionById(id: string) {
  return repository().findById(id);
}

export function updateSubmissionReview(
  id: string,
  reviewIndex: number,
  scores: ReviewScores,
) {
  return admin.updateReview(id, reviewIndex, scores);
}

export function releaseSubmission(id: string) {
  return admin.release(id);
}
