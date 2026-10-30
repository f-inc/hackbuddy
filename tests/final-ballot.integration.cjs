/* eslint-disable @typescript-eslint/no-require-imports -- Isolated server TypeScript tests. */
const assert = require("node:assert/strict");
const test = require("node:test");
const { FinalsService } = require("../application/finals-service.ts");
const { createReview } = require("../domain/scoring.ts");
const {
  parseBallotRequest,
  parseFinalsActionRequest,
} = require("../server/http/validation.ts");
const {
  validatePublication,
  publishedFinals,
} = require("../domain/publication.ts");

function fixture() {
  const submissions = Array.from({ length: 8 }, (_, index) => ({
    id: `project-${index}`,
    projectName: `Project ${index}`,
    teamName: `Team ${index}`,
    track: "",
    createdAt: "2026-10-30",
    completedAt: "2026-10-30",
    status: "completed",
    progressScore: 10 - index,
    practicalityScore: 10 - index,
    complexityScore: 10 - index,
    totalScore: (10 - index) * 3,
    finalJudging: null,
    reviews: [
      createReview(
        "maya",
        { progress: 8, practicality: 8, complexity: 8, notes: "" },
        "2026-10-30",
      ),
    ],
  }));
  const writes = [];
  const repository = {
    list: async () => structuredClone(submissions),
    setFinalState: async (id, state) => {
      submissions.find((s) => s.id === id).finalJudging =
        structuredClone(state);
    },
    clearFinalState: async (id) => {
      submissions.find((s) => s.id === id).finalJudging = null;
    },
    deleteReviews: async () => {
      for (const s of submissions)
        if (s.finalJudging) s.finalJudging.reviews = [];
    },
    saveReview: async (id, phase, review) => {
      writes.push({ id, phase, review });
      const reviews = submissions.find((s) => s.id === id).finalJudging.reviews;
      const index = reviews.findIndex((r) => r.judgeName === review.judgeName);
      if (index < 0) reviews.push(review);
      else reviews[index] = review;
    },
  };
  return { service: new FinalsService(() => repository), submissions, writes };
}

test("freeze top seven; submit, revise and aggregate independent judge ballots with one write each", async () => {
  const { service, writes } = fixture();
  const start = await service.start("organizer", ["maya", "alex", "absent"]);
  assert.equal(start.finalists.length, 7);
  const picks = start.finalists.slice(0, 3).map((s) => s.id);
  await service.submitBallot("maya", picks);
  assert.equal(writes.length, 1);
  let state = await service.state("maya");
  assert.equal(state.completedReviews, 1);
  assert.equal(state.requiredReviews, 3);
  assert.equal(state.allComplete, false);
  assert.equal(state.topThree.length, 3);
  assert.equal(state.standings[0].votePoints, 3);
  await service.submitBallot("maya", [...picks].reverse());
  await service.submitBallot("alex", picks);
  state = await service.state("maya");
  assert.equal(writes.length, 3);
  assert.equal(state.completedReviews, 2);
  assert.deepEqual(state.ownBallot.picks, [...picks].reverse());
  assert.equal(
    state.standings.reduce((sum, s) => sum + s.votePoints, 0),
    12,
  );
  await assert.rejects(() => service.sync("organizer"), /cannot be changed/);
  await service.reset("organizer");
  assert.equal((await service.state("maya")).started, false);
});

test("invalid and ineligible ballots never write; final rubric endpoint cannot add scores", async () => {
  const { service, writes } = fixture();
  await assert.rejects(
    () => service.submitBallot("maya", ["a", "b", "c"]),
    /not started/,
  );
  const state = await service.start("admin", ["maya"]);
  const picks = state.finalists.slice(0, 3).map((s) => s.id);
  await assert.rejects(() => service.submitBallot("outsider", picks), /roster/);
  for (const invalid of [
    picks.slice(0, 2),
    [picks[0], picks[0], picks[1]],
    [picks[0], picks[1], "project-7"],
  ])
    await assert.rejects(
      () => service.submitBallot("maya", invalid),
      /three distinct/,
    );
  await assert.rejects(
    () => service.submitReview("project-0", "maya", {}),
    /top-three ballot/,
  );
  assert.equal(writes.length, 0);
  assert.throws(
    () => parseBallotRequest({ picks: ["a", "a", "b"] }),
    /three distinct/,
  );
  assert.deepEqual(
    parseFinalsActionRequest({ action: "publish", winnerIds: picks }).winnerIds,
    picks,
  );
});

test("a published podium supports missing judges and an organizer override, while remaining frozen", async () => {
  const { service } = fixture();
  const state = await service.start("admin", ["maya", "absent"]);
  await service.submitBallot(
    "maya",
    state.finalists.slice(0, 3).map((s) => s.id),
  );
  const finalState = await service.state("admin");
  const saved = validatePublication({
    schemaVersion: 1,
    scoringPolicy: "raw-v1",
    publishedAt: "2026-10-30T16:00:00Z",
    publishedBy: "admin",
    results: finalState.finalists,
    normalization: { judges: [] },
    finals: {
      ...finalState,
      organizerOverride: true,
      topThree: [...finalState.topThree].reverse(),
    },
  });
  assert.equal(saved.finals.allComplete, false);
  const published = publishedFinals(saved, "maya");
  assert.deepEqual(
    published.topThree.map((s) => s.id),
    [...finalState.topThree].reverse().map((s) => s.id),
  );
  assert.equal(published.publishedAt, saved.publishedAt);
  assert.throws(
    () =>
      validatePublication({
        ...saved,
        finals: {
          ...saved.finals,
          topThree: [
            saved.finals.topThree[0],
            saved.finals.topThree[0],
            saved.finals.topThree[0],
          ],
        },
      }),
    /podium/,
  );
});
