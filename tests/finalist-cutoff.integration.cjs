/* eslint-disable @typescript-eslint/no-require-imports -- Uses the server TypeScript test loader. */
const assert = require("node:assert/strict");
const test = require("node:test");
const { FinalsService } = require("../application/finals-service.ts");

function fixture() {
  const submissions = Array.from({ length: 10 }, (_, index) => ({
    id: `team-${index}`, projectName: `Team ${index}`, teamName: `Team ${index}`,
    status: "completed", totalScore: 60 - index * 3,
    progressScore: 20 - index, practicalityScore: 20 - index,
    complexityScore: 20 - index, completedAt: "2026-01-01", reviews: [],
    finalJudging: { judges: ["judge"], startedAt: "2026-01-02", reviews: [] },
  })).reverse();
  const saves = [];
  const repository = {
    list: async () => submissions,
    findById: async id => submissions.find(s => s.id === id),
    saveReview: async (...args) => saves.push(args),
  };
  return { service: new FinalsService(() => repository), submissions, saves };
}

test("a saved ten-team round exposes only the seven highest preliminary teams", async () => {
  const { service, submissions } = fixture();
  const state = await service.state("judge");
  assert.deepEqual(state.finalists.map(s => s.id), Array.from({ length: 7 }, (_, i) => `team-${i}`));
  assert.equal(state.requiredReviews, 7);
  assert.equal(submissions.filter(s => s.finalJudging).length, 10);
});

test("excluded teams cannot be opened or reviewed", async () => {
  const { service, saves } = fixture();
  await assert.rejects(service.finalist("team-7", "judge"), /not in the final round/);
  await assert.rejects(service.submitReview("team-7", "judge", { progress: 8, practicality: 8, complexity: 8, notes: "" }), /not in the final round/);
  assert.equal(saves.length, 0);
  await service.submitReview("team-6", "judge", { progress: 8, practicality: 8, complexity: 8, notes: "" });
  assert.equal(saves.length, 1);
});

test("reviews on an excluded team still prevent destructive finalist synchronization", async () => {
  const { service, submissions } = fixture();
  submissions[0].finalJudging.reviews.push({ judgeName: "judge", totalScore: 24 });
  await assert.rejects(service.sync("admin"), /cannot be changed/);
});
