import type { SubmissionReview } from "./submission";

export type FinalBallot = {
  judgeName: string;
  picks: [string, string, string];
  submittedAt: string;
};

/** One ledger row holds the entire ballot. An upsert replaces all three picks
 * atomically, without changing the existing Airtable review schema. */
export function ballotReview(ballot: FinalBallot): SubmissionReview {
  return {
    judgeName: ballot.judgeName,
    progressScore: 1,
    practicalityScore: 1,
    complexityScore: 1,
    totalScore: 3,
    notes: JSON.stringify({ kind: "podium-v1", picks: ballot.picks }),
    completedAt: ballot.submittedAt,
  };
}

export function validPicks(
  value: unknown,
  finalistIds?: Set<string>,
): value is [string, string, string] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every(
      (id) =>
        typeof id === "string" &&
        id.length > 0 &&
        id.length <= 100 &&
        (!finalistIds || finalistIds.has(id)),
    ) &&
    new Set(value).size === 3
  );
}

export function readBallots(
  reviews: SubmissionReview[],
  judges: string[],
  finalistIds: Set<string>,
): FinalBallot[] {
  const latest = new Map<string, FinalBallot>();
  for (const review of reviews) {
    if (!judges.includes(review.judgeName)) continue;
    try {
      const value = JSON.parse(review.notes);
      if (
        value.kind !== "podium-v1" ||
        !validPicks(value.picks, finalistIds) ||
        !Number.isFinite(Date.parse(review.completedAt))
      )
        continue;
      const previous = latest.get(review.judgeName);
      if (!previous || review.completedAt >= previous.submittedAt) {
        latest.set(review.judgeName, {
          judgeName: review.judgeName,
          picks: value.picks,
          submittedAt: review.completedAt,
        });
      }
    } catch {
      /* Existing rubric reviews are not podium ballots. */
    }
  }
  return [...latest.values()];
}

export function podiumStandings<T extends { id: string; projectName: string }>(
  finalists: T[],
  ballots: FinalBallot[],
) {
  return finalists
    .map((finalist) => {
      const votes = [0, 0, 0];
      for (const ballot of ballots) {
        const place = ballot.picks.indexOf(finalist.id);
        if (place >= 0) votes[place]++;
      }
      return {
        ...finalist,
        firstVotes: votes[0],
        secondVotes: votes[1],
        thirdVotes: votes[2],
        votePoints: votes[0] * 3 + votes[1] * 2 + votes[2],
      };
    })
    .sort(
      (a, b) =>
        b.votePoints - a.votePoints ||
        a.projectName.localeCompare(b.projectName) ||
        a.id.localeCompare(b.id),
    );
}
