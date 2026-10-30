import assert from "node:assert/strict";
import test from "node:test";
import { judgedProjects, reviewedSubmission } from "../domain/judge-history";
import type { Submission, SubmissionReview } from "../domain/submission";

function review(
  judgeName: string,
  completedAt = "2026-01-01T01:00:00Z",
): SubmissionReview {
  return {
    judgeName,
    progressScore: 8,
    practicalityScore: 7,
    complexityScore: 9,
    totalScore: 24,
    notes: `${judgeName}'s private note`,
    completedAt,
  };
}

function project(id: string, reviews: SubmissionReview[] = []): Submission {
  return {
    id,
    teamName: id,
    projectName: id,
    track: "AI",
    createdAt: "2026-01-01T00:00:00Z",
    submitterNames: "",
    contactEmail: "",
    attendance: "",
    oneLiner: "",
    description: "",
    previewImageUrl: "",
    teamPhotoUrl: "",
    demoUrl: "",
    demoType: "",
    demoFilename: "",
    repositoryUrl: "",
    status: reviews.length >= 2 ? "completed" : "available",
    claimedBy: "",
    claimedAt: "",
    completedAt: "2026-01-01T02:00:00Z",
    progressScore: 16,
    practicalityScore: 14,
    complexityScore: 18,
    totalScore: 48,
    notes: "Legacy notes",
    reviews,
    finalJudging: null,
  };
}

test("history includes a judge's incomplete projects and excludes other judges' projects", () => {
  const result = judgedProjects(
    [project("mine", [review("alex")]), project("other", [review("sam")])],
    " Alex ",
  );
  assert.deepEqual(
    result.map((p) => p.id),
    ["mine"],
  );
  assert.equal(result[0].myReviews[0].review.totalScore, 24);
  assert.deepEqual(result[0].result, {
    score: null,
    normalizedScore: null,
    maximum: 60,
    rank: null,
    complete: false,
  });
});

test("history includes final-only reviews and keeps both rounds on one project", () => {
  const both = project("both", [review("alex"), review("sam")]);
  both.finalJudging = {
    startedAt: "",
    judges: ["alex", "sam"],
    reviews: [review("alex", "2026-01-02T00:00:00Z")],
  };
  const finalOnly = project("final-only", [review("sam"), review("pat")]);
  finalOnly.finalJudging = {
    startedAt: "",
    judges: ["alex"],
    reviews: [review("alex", "2026-01-03T00:00:00Z")],
  };
  const result = judgedProjects([both, finalOnly], "alex");
  assert.deepEqual(
    result.map((p) => p.id),
    ["final-only", "both"],
  );
  assert.deepEqual(
    result[1].myReviews.map((r) => r.phase),
    ["preliminary", "final"],
  );
  assert.equal(result[0].finalResult?.complete, true);
  assert.equal(result[1].finalResult?.complete, false);
  assert.equal(result[1].finalResult?.maximum, 60);
});

test("result ranks reflect all completed projects, not just the judge's projects", () => {
  const mine = project("mine", [review("alex"), review("sam")]);
  const winner = {
    ...project("winner", [review("sam"), review("pat")]),
    totalScore: 55,
  };
  const result = judgedProjects([mine, winner], "alex");
  assert.equal(result[0].result.rank, 2);
  assert.equal(result[0].result.score, 48);
});

test("detail access requires a saved review and never includes another judge's notes", () => {
  const original = project("mine", [review("alex"), review("sam")]);
  original.finalJudging = {
    startedAt: "",
    judges: ["alex", "sam"],
    reviews: [review("alex"), review("sam")],
  };
  assert.equal(reviewedSubmission(original, "outsider"), null);
  const detail = reviewedSubmission(original, "alex")!;
  assert.equal(detail.reviews.length, 1);
  assert.equal(detail.finalJudging?.reviews.length, 1);
  assert.equal(detail.notes, "");
  assert.equal(JSON.stringify(detail).includes("sam's private note"), false);
  assert.equal(original.reviews.length, 2);
  assert.deepEqual(judgedProjects([original], "outsider"), []);
});
