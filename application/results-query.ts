import type { ScoringPolicy } from "@/domain/event-scoring";
import type { PublishedResults } from "@/domain/publication";
import type { Submission } from "@/domain/submission";
import type { SubmissionRepositoryProvider } from "./ports/submission-repository";
import { preliminaryRanking } from "@/domain/ranking";
import type { ResultEntry } from "@/lib/types";
import type { PendingResultEntry } from "@/domain/results";

export class ResultsQuery {
  constructor(private readonly repository: SubmissionRepositoryProvider) {}

  async execute(policy: ScoringPolicy = "raw-v1"): Promise<ResultEntry[]> {
    return (await this.report(policy)).results;
  }

  async report(
    policy: ScoringPolicy = "raw-v1",
    publication: PublishedResults | null = null,
    submissions?: Submission[],
    includePending = false,
  ) {
    if (publication && !includePending)
      return {
        pendingSubmissions: [] as PendingResultEntry[],
        results: structuredClone(publication.results),
        normalization: structuredClone(publication.normalization),
        scoringPolicy: publication.scoringPolicy,
        publishedAt: publication.publishedAt,
      };
    const allSubmissions = submissions ?? (await this.repository().list());
    const ranking = publication ? null : preliminaryRanking(allSubmissions, policy);
    const rankedIds = new Set(
      (publication?.results ?? ranking!.results)
        .map((result) => result.id),
    );
    const pendingSubmissions: PendingResultEntry[] = allSubmissions
      .filter((submission) => !rankedIds.has(submission.id))
      .map((submission) => ({
        id: submission.id,
        projectName: submission.projectName,
        teamName: submission.teamName,
        oneLiner: submission.oneLiner,
        submitterNames: submission.submitterNames,
        track: submission.track,
        status: submission.status,
        reviewCount: submission.reviews.length,
      }))
      .sort((a, b) => a.projectName.localeCompare(b.projectName));
    if (publication)
      return {
        pendingSubmissions,
        results: structuredClone(publication.results),
        normalization: structuredClone(publication.normalization),
        scoringPolicy: publication.scoringPolicy,
        publishedAt: publication.publishedAt,
      };
    const results: ResultEntry[] = ranking!.results.map((submission) => ({
      id: submission.id,
      teamName: submission.teamName,
      projectName: submission.projectName,
      oneLiner: submission.oneLiner,
      submitterNames: submission.submitterNames,
      teamPhotoUrl: submission.teamPhotoUrl,
      track: submission.track,
      reviews: submission.reviews,
      progressScore: submission.progressScore,
      practicalityScore: submission.practicalityScore,
      complexityScore: submission.complexityScore,
      totalScore: submission.totalScore,
      completedAt: submission.completedAt,
      normalizedScore: submission.normalizedScore,
      rawRank: submission.rawRank,
    }));
    return {
      results,
      pendingSubmissions,
      normalization: ranking!.diagnostics,
      scoringPolicy: policy,
      publishedAt: "",
    };
  }
}
