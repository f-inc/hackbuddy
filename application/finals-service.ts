import {
  ballotReview,
  readBallots,
  podiumStandings,
  validPicks,
} from "@/domain/final-ballot";
import { JUDGING_POLICY } from "@/domain/judging-policy";
import type { ScoringPolicy } from "@/domain/event-scoring";
import { publishedFinals, type PublishedResults } from "@/domain/publication";
import type { Submission } from "@/domain/submission";
import type { SubmissionRepositoryProvider } from "./ports/submission-repository";
import {
  comparePreliminaryRank,
  compareRawRank,
  preliminaryRanking,
  type RankedSubmission,
  selectFinalists,
} from "@/domain/ranking";
import type { FinalJudgingState, ReviewScores } from "@/domain/submission";
import type { FinalistEntry, FinalsState } from "@/lib/types";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/server/http/errors";

function finalistEntry(
  submission: RankedSubmission,
  judgeName: string,
  judges: string[],
  policy: ScoringPolicy,
): FinalistEntry {
  const finalReviews = (submission.finalJudging?.reviews ?? []).filter(
    (review) => policy === "raw-v1" || judges.includes(review.judgeName),
  );
  return {
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
    finalNormalizedScore: 0,
    finalReviews,
    reviewedByYou: finalReviews.some(
      (review) => review.judgeName === judgeName,
    ),
    fullyReviewed:
      judges.length > 0 &&
      judges.every((judge) =>
        finalReviews.some((review) => review.judgeName === judge),
      ),
  };
}

export class FinalsService {
  constructor(private readonly repository: SubmissionRepositoryProvider) {}

  async state(
    judgeName: string,
    policy: ScoringPolicy = "raw-v1",
    publication: PublishedResults | null = null,
    savedSubmissions?: Submission[],
  ): Promise<FinalsState> {
    if (publication) return publishedFinals(publication, judgeName);
    const submissions = savedSubmissions ?? (await this.repository().list());
    const completed = preliminaryRanking(submissions, policy).results;
    const frozen = completed.filter((submission) => submission.finalJudging);
    const canStart = completed.length >= 3;

    if (!frozen.length) {
      const preview = selectFinalists(submissions, policy);
      const judges = Array.from(
        new Set(
          completed
            .flatMap((submission) => submission.reviews)
            .map((review) => review.judgeName)
            .filter(Boolean),
        ),
      ).sort();
      return {
        scoringPolicy: policy,
        publishedAt: "",
        started: false,
        canStart,
        startedAt: "",
        judges,
        eligibleJudge: judges.includes(judgeName),
        finalists: preview.map((submission) =>
          finalistEntry(submission, judgeName, judges, policy),
        ),
        completedReviews: 0,
        requiredReviews: judges.length,
        votingMode: "podium-v1",
        ownBallot: null,
        submittedJudges: [],
        standings: [],
        allComplete: false,
        topThree: [],
      };
    }

    // Older rounds may have frozen ten teams. Apply the current cutoff in
    // preliminary order, while retaining every saved review for ballot lookup.
    const cohort = frozen.slice(0, JUDGING_POLICY.finals.finalistCount);
    const judges = frozen[0].finalJudging?.judges ?? [];
    const ballots = readBallots(
      frozen.flatMap((submission) => submission.finalJudging?.reviews ?? []),
      judges,
      new Set(cohort.map((submission) => submission.id)),
    );
    const ownBallot =
      ballots.find((ballot) => ballot.judgeName === judgeName) ?? null;
    const finalists = cohort
      .map((submission) => ({
        ...finalistEntry(submission, judgeName, judges, policy),
        reviewedByYou: Boolean(ownBallot?.picks.includes(submission.id)),
      }))
      .sort(policy === "raw-v1" ? compareRawRank : comparePreliminaryRank);
    const standings = podiumStandings(finalists, ballots);
    const completedReviews = ballots.length;
    const requiredReviews = judges.length;
    const allComplete =
      requiredReviews > 0 && completedReviews >= requiredReviews;

    return {
      scoringPolicy: policy,
      publishedAt: "",
      started: true,
      canStart,
      startedAt: frozen[0].finalJudging?.startedAt ?? "",
      judges,
      eligibleJudge: judges.includes(judgeName),
      finalists,
      completedReviews,
      requiredReviews,
      allComplete,
      votingMode: "podium-v1",
      ownBallot,
      submittedJudges: ballots.map((ballot) => ballot.judgeName),
      standings,
      topThree: ballots.length ? standings.slice(0, 3) : [],
    };
  }

  async start(
    adminName: string,
    requestedJudges?: string[],
    policy: ScoringPolicy = "raw-v1",
  ) {
    const repository = this.repository();
    const existing = await this.state(adminName, policy);
    if (existing.started) return existing;
    if (!existing.canStart || !existing.finalists.length) {
      throw new ConflictError(
        "At least three projects with completed preliminary scores are required.",
      );
    }
    const judges = Array.from(
      new Set(
        (requestedJudges ?? existing.judges)
          .map((judge) => judge.trim().toLowerCase())
          .filter(Boolean),
      ),
    ).sort();
    if (!judges.length) {
      throw new ValidationError("Select at least one final-round judge.");
    }
    if (judges.some((judge) => judge.length > 80)) {
      throw new ValidationError("Judge names must be 80 characters or fewer.");
    }
    const state: FinalJudgingState = {
      startedAt: new Date().toISOString(),
      judges,
      reviews: [],
    };
    for (const finalist of existing.finalists) {
      await repository.setFinalState(finalist.id, state);
    }
    return this.state(adminName, policy);
  }

  async sync(adminName: string, policy: ScoringPolicy = "raw-v1") {
    const repository = this.repository();
    const existing = await this.state(adminName, policy);
    if (!existing.started) {
      throw new ConflictError("Start final judging before syncing finalists.");
    }
    if (
      existing.completedReviews > 0 ||
      (await repository.list()).some((s) => s.finalJudging?.reviews.length)
    ) {
      throw new ConflictError(
        "Finalists cannot be changed after a final-round review has been submitted.",
      );
    }
    const submissions = await repository.list();
    const finalists = selectFinalists(submissions, policy);
    if (!finalists.length) {
      throw new ConflictError(
        "At least three projects with completed preliminary scores are required.",
      );
    }
    const finalistIds = new Set(finalists.map((submission) => submission.id));
    const state: FinalJudgingState = {
      startedAt: existing.startedAt,
      judges: existing.judges,
      reviews: [],
    };
    for (const submission of submissions) {
      if (submission.finalJudging && !finalistIds.has(submission.id)) {
        await repository.clearFinalState(submission.id);
      }
    }
    for (const finalist of finalists) {
      await repository.setFinalState(finalist.id, state);
    }
    return this.state(adminName, policy);
  }

  async reset(adminName: string, policy: ScoringPolicy = "raw-v1") {
    const repository = this.repository();
    const selected = (await repository.list()).filter(
      (submission) => submission.finalJudging,
    );
    if (!selected.length) {
      throw new ConflictError("Final judging has not started.");
    }
    await repository.deleteReviews("final");
    for (const submission of selected) {
      await repository.clearFinalState(submission.id);
    }
    return this.state(adminName, policy);
  }

  async finalist(
    id: string,
    judgeName: string,
    policy: ScoringPolicy = "raw-v1",
  ) {
    const submission = await this.repository().findById(id);
    if (!submission) throw new NotFoundError("Submission not found.");
    const state = await this.state(judgeName, policy);
    if (
      !submission.finalJudging ||
      !state.finalists.some((entry) => entry.id === id)
    ) {
      throw new ConflictError("This project is not in the final round.");
    }
    if (!submission.finalJudging.judges.includes(judgeName)) {
      throw new ForbiddenError(
        "You are not part of the final-round judge roster.",
      );
    }
    return submission;
  }

  async submitBallot(
    judgeName: string,
    picks: unknown,
    policy: ScoringPolicy = "raw-v1",
  ) {
    const repository = this.repository();
    const selected = (await repository.list()).filter(
      (submission) => submission.finalJudging,
    );
    if (!selected.length)
      throw new ConflictError("Final judging has not started.");
    const anchor = [...selected].sort((a, b) => a.id.localeCompare(b.id))[0];
    if (!anchor.finalJudging!.judges.includes(judgeName)) {
      throw new ForbiddenError(
        "You are not part of the final-round judge roster.",
      );
    }
    const state = await this.state(judgeName, policy);
    if (!validPicks(picks, new Set(state.finalists.map((s) => s.id)))) {
      throw new ValidationError(
        "Select three distinct finalists for first, second, and third place.",
      );
    }
    await repository.saveReview(
      anchor.id,
      "final",
      ballotReview({
        judgeName,
        picks,
        submittedAt: new Date().toISOString(),
      }),
    );
  }

  async submitReview(...args: [string, string, ReviewScores]) {
    void args;
    throw new ConflictError(
      "Final judging now uses a top-three ballot. Submit your picks from the finalist cards.",
    );
  }
}
