/* eslint-disable @typescript-eslint/no-require-imports -- Isolated CommonJS test loader exercises server TypeScript imports. */
const assert = require("node:assert/strict");
const test = require("node:test");
const { ResultsQuery } = require("../application/results-query.ts");
const { demoSubmissions } = require("../lib/demo-data.ts");
const { createReview, aggregateReviews } = require("../domain/scoring.ts");

function submission(id, count, status) {
  const reviews = Array.from({ length: count }, (_, index) => createReview(
    `Judge ${index}`, { progress: 7, practicality: 8, complexity: 9, notes: "" }, "2026-10-30",
  ));
  const scores = aggregateReviews(reviews);
  return {
    ...structuredClone(demoSubmissions[0]), id, projectName: id,
    status, reviews,
    progressScore: count ? scores.progress : null,
    practicalityScore: count ? scores.practicality : null,
    complexityScore: count ? scores.complexity : null,
    totalScore: count ? scores.total : null,
    completedAt: count === 2 ? "2026-10-30" : "",
  };
}

for (const policy of ["raw-v1", "normalized-v1"]) {
  test(`${policy}: unreviewed, partially reviewed, and active submissions are visible without receiving ranks`, async () => {
    const submissions = [
      submission("Unreviewed", 0, "available"),
      submission("Partial", 1, "available"),
      submission("Active", 0, "in progress"),
      submission("Complete", 2, "completed"),
    ];
    let reads = 0;
    const query = new ResultsQuery(() => ({ list: async () => { reads++; return submissions; } }));
    const report = await query.report(policy);
    assert.equal(reads, 1);
    assert.deepEqual(report.results.map((result) => result.id), ["Complete"]);
    assert.equal(report.results[0].rawRank, 1);
    assert.deepEqual(report.pendingSubmissions.map((entry) => [entry.id, entry.reviewCount, entry.status]), [
      ["Active", 0, "in progress"], ["Partial", 1, "available"], ["Unreviewed", 0, "available"],
    ]);
    for (const entry of report.pendingSubmissions) {
      assert.equal("rawRank" in entry, false);
      assert.equal("totalScore" in entry, false);
      assert.equal("contactEmail" in entry, false);
      assert.equal("notes" in entry, false);
    }
  });
}

test("published rankings remain frozen when pending submissions are requested", async () => {
  let submissions = [submission("Complete", 2, "completed")];
  const query = new ResultsQuery(() => ({ list: async () => submissions }));
  const original = await query.report();
  const publication = { ...original, publishedAt: "2026-10-30T00:00:00Z" };
  submissions = [submission("Complete", 0, "available"), submission("New", 0, "available")];
  const report = await query.report("raw-v1", publication, undefined, true);
  assert.deepEqual(report.results, original.results);
  assert.deepEqual(report.pendingSubmissions.map((entry) => entry.id), ["New"]);
  assert.equal(report.publishedAt, publication.publishedAt);
});
