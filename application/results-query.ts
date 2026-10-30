import type { ScoringPolicy } from "@/domain/event-scoring";
import type { PublishedResults } from "@/domain/publication";
import type { Submission } from "@/domain/submission";
import type { SubmissionRepositoryProvider } from "./ports/submission-repository";
import { preliminaryRanking } from "@/domain/ranking";
import type { ResultEntry } from "@/lib/types";

export class ResultsQuery {
  constructor(private readonly repository: SubmissionRepositoryProvider) {}

  async execute(policy: ScoringPolicy = "raw-v1"): Promise<ResultEntry[]> {
    return (await this.report(policy)).results;
  }

  async report(
    policy: ScoringPolicy = "raw-v1",
    publication: PublishedResults | null = null,
    submissions?: Submission[],
  ) {
    if (publication)
      return {
        results: structuredClone(publication.results),
        normalization: structuredClone(publication.normalization),
        scoringPolicy: publication.scoringPolicy,
        publishedAt: publication.publishedAt,
      };
    const ranking = preliminaryRanking(
      submissions ?? (await this.repository().list()),
      policy,
    );
    const results: ResultEntry[] = ranking.results.map((submission) => ({
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
      normalization: ranking.diagnostics,
      scoringPolicy: policy,
      publishedAt: "",
    };
  }
}
