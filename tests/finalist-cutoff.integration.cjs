/* eslint-disable @typescript-eslint/no-require-imports -- Uses the server TypeScript test loader. */
const assert = require("node:assert/strict");
const test = require("node:test");
const { FinalsService } = require("../application/finals-service.ts");
const { ballotReview } = require("../domain/final-ballot.ts");

function fixture() {
  const submissions = Array.from({ length: 10 }, (_, index) => ({
    id: `team-${index}`, projectName: `Team ${index}`, teamName: `Team ${index}`,
    status: "completed", totalScore: 60 - index * 3,
    progressScore: 20 - index, practicalityScore: 20 - index,
    complexityScore: 20 - index, completedAt: "2026-01-01", reviews: [],
    finalJudging: { judges: ["judge"], startedAt: "2026-01-02", reviews: [] },
  })).reverse();
  // A ballot can be anchored on a team outside the reduced cohort.
  submissions[0].finalJudging.reviews.push(ballotReview({
    judgeName: "judge", picks: ["team-0", "team-1", "team-2"],
    submittedAt: "2026-01-03T00:00:00Z",
  }));
  const saves = [];
  const repository = {
    list: async () => submissions,
    findById: async id => submissions.find(s => s.id === id),
    saveReview: async (...args) => saves.push(args),
  };
  return { service: new FinalsService(() => repository), submissions, saves };
}

test("a saved ten-team round exposes the seven highest preliminary teams and retains ballots on excluded records", async () => {
  const { service, submissions } = fixture();
  const state = await service.state("judge");
  assert.deepEqual(state.finalists.map(s => s.id), Array.from({ length: 7 }, (_, i) => `team-${i}`));
  assert.equal(state.completedReviews, 1);
  assert.deepEqual(state.ownBallot.picks, ["team-0", "team-1", "team-2"]);
  assert.equal(state.standings.length, 7);
  assert.deepEqual(state.topThree.map(s => s.id), ["team-0", "team-1", "team-2"]);
  assert.equal(submissions.filter(s => s.finalJudging).length, 10);
});

test("excluded teams cannot be opened or voted for; a top-seven ballot is accepted", async () => {
  const { service, saves } = fixture();
  await assert.rejects(service.finalist("team-7", "judge"), /not in the final round/);
  await assert.rejects(service.submitBallot("judge", ["team-0", "team-1", "team-7"]), /three distinct finalists/);
  assert.equal(saves.length, 0);
  await service.submitBallot("judge", ["team-0", "team-1", "team-6"]);
  assert.equal(saves.length, 1);
});
