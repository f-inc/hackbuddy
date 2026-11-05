import { DEFAULT_EVENT_SETTINGS, type EventSettings } from "@/domain/event-settings";
import type { ScoringPolicy } from "@/domain/event-scoring";
import type { PublishedResults } from "@/domain/publication";
import type { SubmissionRepositoryProvider } from "./ports/submission-repository";
import { JUDGING_POLICY } from "@/domain/judging-policy";
import type { Submission } from "@/domain/submission";
import { preliminaryRanking } from "@/domain/ranking";
import { queueStats } from "./queue-service";
import type { ActiveSession, LeaderboardEntry, ScoreDistributionBucket } from "@/lib/types";

function average(values: number[]) {
  if (!values.length) return 0;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function scoreDistribution(
  submissions: Pick<Submission, "totalScore" | "reviews">[],
  scoreMax = 10,
) {
  const rubricMaximum = 3 * scoreMax;
  const rubricMinimum = JUDGING_POLICY.rubric.length * JUDGING_POLICY.score.min;
  const buckets: ScoreDistributionBucket[] = Array.from(
    { length: Math.ceil((rubricMaximum - rubricMinimum + 1) / 2) },
    (_, index) => {
      const min = rubricMinimum + index * 2;
      return {
        label: `${min}–${Math.min(min + 1, rubricMaximum)}`,
        min,
        max: Math.min(min + 1, rubricMaximum),
        count: 0,
      };
    },
  );
  for (const submission of submissions) {
    if (submission.totalScore === null || !submission.reviews.length) continue;
    const score = submission.totalScore / submission.reviews.length;
    const bucketIndex = Math.min(
      buckets.length - 1,
      Math.max(0, Math.floor((score - rubricMinimum) / 2)),
    );
    buckets[bucketIndex].count += 1;
  }
  return buckets;
}

export class DashboardQuery {
  constructor(
    private readonly repository: SubmissionRepositoryProvider,
    private readonly settings: () => EventSettings = () => DEFAULT_EVENT_SETTINGS,
  ) {}

  async execute(
    judgeName: string,
    policy: ScoringPolicy = "raw-v1",
    publication: PublishedResults | null = null,
  ) {
    const submissions = await this.repository().list();
    const completed = submissions.filter((submission) => submission.status === "completed");
    const ranked =
      publication?.results ??
      (policy === "raw-v1"
        ? completed
            .filter((submission) => submission.totalScore !== null)
            .sort((a, b) => (b.totalScore ?? 0) - (a.totalScore ?? 0))
            .map((submission) => ({
              ...submission,
              totalScore: submission.totalScore ?? 0,
              normalizedScore: 0,
            }))
        : preliminaryRanking(submissions, policy).results);
    const leaderboard: LeaderboardEntry[] = ranked
      .slice(0, this.settings().finalistCount)
      .map((submission, index) => ({
        id: submission.id,
        rank: index + 1,
        teamName: submission.teamName,
        projectName: submission.projectName,
        track: submission.track,
        score: policy === "raw-v1" ? submission.totalScore : submission.normalizedScore,
      }));
    const activeSessions: ActiveSession[] = submissions
      .filter((submission) => submission.status === "in progress")
      .sort((a, b) => new Date(b.claimedAt).getTime() - new Date(a.claimedAt).getTime())
      .map((submission) => ({
        id: submission.id,
        projectName: submission.projectName,
        teamName: submission.teamName,
        judgeName: submission.claimedBy,
        claimedAt: submission.claimedAt,
      }));
    const yourReviews = submissions
      .flatMap((submission) => submission.reviews)
      .filter((review) => review.judgeName === judgeName);
    const eligibleAvailable = submissions.filter(
      (submission) =>
        submission.status === "available" &&
        !submission.reviews.some((review) => review.judgeName === judgeName),
    ).length;

    return {
      scoringPolicy: policy,
      publishedAt: publication?.publishedAt ?? "",
      stats: queueStats(submissions),
      leaderboard,
      activeSessions,
      scoreDistribution: scoreDistribution(
        publication?.results ?? completed,
        this.settings().scoreMax,
      ),
      eligibleAvailable,
      hasActiveReview: submissions.some(
        (submission) => submission.status === "in progress" && submission.claimedBy === judgeName,
      ),
      averageScore: average(
        (publication?.results ?? completed).flatMap((submission) =>
          submission.reviews.map((review) => review.totalScore),
        ),
      ),
      yourCompleted: yourReviews.length,
      yourAverageScore: average(yourReviews.map((review) => review.totalScore)),
    };
  }
}
