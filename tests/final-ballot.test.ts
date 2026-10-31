import assert from "node:assert/strict";
import test from "node:test";
import {
  ballotReview,
  readBallots,
  podiumStandings,
  validPicks,
  type FinalBallot,
} from "../domain/final-ballot";
import {
  finalsForViewer,
  submissionForViewer,
} from "../domain/finals-visibility";
import type { FinalsState } from "../domain/results";
import type { Submission } from "../domain/submission";

const ids = new Set(["a", "b", "c", "d"]);
const ballot: FinalBallot = {
  judgeName: "maya",
  picks: ["a", "b", "c"],
  submittedAt: "2026-10-30T12:00:00Z",
};

test("ballots require all three distinct finalists", () => {
  for (const invalid of [
    null,
    [],
    ["a"],
    ["a", "b", ""],
    ["a", "a", "b"],
    ["a", "b", "unknown"],
    ["a", "b", 1],
  ])
    assert.equal(validPicks(invalid, ids), false);
  assert.equal(validPicks(ballot.picks, ids), true);
});

test("latest whole ballot replaces the earlier vote; outsider, invalid and legacy reviews do not count", () => {
  const earlier = ballotReview(ballot);
  const latest = ballotReview({
    ...ballot,
    picks: ["c", "b", "a"],
    submittedAt: "2026-10-30T13:00:00Z",
  });
  const reviews = [
    latest,
    earlier,
    ballotReview({ ...ballot, judgeName: "outsider" }),
    { ...earlier, notes: "old rubric review" },
    {
      ...earlier,
      notes: JSON.stringify({ kind: "podium-v1", picks: ["a", "a", "b"] }),
    },
  ];
  const result = readBallots(reviews, ["maya", "absent"], ids);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].picks, ["c", "b", "a"]);
});

test("live 3–2–1 totals count available ballots without waiting for absent judges", () => {
  const finalists = [...ids].map((id) => ({ id, projectName: id }));
  const votes = [
    ballot,
    {
      ...ballot,
      judgeName: "alex",
      picks: ["b", "c", "d"] as [string, string, string],
    },
  ];
  const rows = podiumStandings(finalists, votes);
  assert.deepEqual(
    rows.map((row) => [
      row.id,
      row.votePoints,
      row.firstVotes,
      row.secondVotes,
      row.thirdVotes,
    ]),
    [
      ["b", 5, 1, 1, 0],
      ["a", 3, 1, 0, 0],
      ["c", 3, 0, 1, 1],
      ["d", 1, 0, 0, 1],
    ],
  );
  assert.equal(podiumStandings(finalists, [ballot])[0].votePoints, 3);
  assert.equal(
    podiumStandings(finalists, []).every((row) => row.votePoints === 0),
    true,
  );
});

test("judge responses expose live aggregate standings while keeping other ballots private", () => {
  const entry = {
    id: "a",
    projectName: "a",
    finalReviews: [ballotReview(ballot)],
    votePoints: 3,
    firstVotes: 1,
  };
  const state = {
    finalists: [entry],
    standings: [entry],
    topThree: [entry],
    ownBallot: ballot,
    submittedJudges: ["maya"],
    judges: ["maya", "alex"],
    completedReviews: 1,
    requiredReviews: 2,
    allComplete: false,
    publishedAt: "",
  } as FinalsState;
  const judge = finalsForViewer(state, false);
  assert.deepEqual(judge.ownBallot, ballot);
  assert.equal(judge.standings?.[0].votePoints, 3);
  assert.deepEqual(judge.standings?.[0].finalReviews, []);
  assert.equal(judge.topThree[0].id, "a");
  assert.deepEqual(judge.topThree[0].finalReviews, []);
  assert.equal(judge.completedReviews, 1);
  assert.equal(judge.requiredReviews, 2);
  assert.equal(judge.allComplete, false);
  assert.equal(judge.submittedJudges, undefined);
  assert.equal(judge.finalists[0].votePoints, 3);
  assert.deepEqual(judge.finalists[0].finalReviews, []);
  const spectator = finalsForViewer({ ...state, ownBallot: null }, false);
  assert.equal(spectator.ownBallot, null);
  assert.equal(spectator.completedReviews, 1);
  assert.equal(spectator.topThree[0].votePoints, 3);
  assert.deepEqual(spectator.topThree[0].finalReviews, []);
  assert.equal(finalsForViewer(state, true), state);
  const submission = {
    finalJudging: {
      startedAt: "",
      judges: ["maya"],
      reviews: [ballotReview(ballot)],
    },
  } as Submission;
  assert.deepEqual(
    submissionForViewer(submission, false).finalJudging?.reviews,
    [],
  );
  assert.equal(submission.finalJudging?.reviews.length, 1);
  assert.equal(
    finalsForViewer({ ...state, publishedAt: "2026-10-30" }, false).topThree
      .length,
    1,
  );
});
