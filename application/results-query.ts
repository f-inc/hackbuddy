import type { SubmissionRepositoryProvider } from "./ports/submission-repository";
import { comparePreliminaryRank, scoredCompleted } from "@/domain/ranking";
import type { ResultEntry } from "@/lib/types";

export class ResultsQuery {
  constructor(private readonly repository: SubmissionRepositoryProvider) {}

  async execute(): Promise<ResultEntry[]> {
    return scoredCompleted(await this.repository().list())
      .sort(comparePreliminaryRank)
      .map((submission) => ({
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
      }));
  }
}

