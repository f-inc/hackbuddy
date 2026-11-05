/* eslint-disable @typescript-eslint/no-require-imports -- Isolated queue and HTTP tests. */
const assert = require("node:assert/strict");
const test = require("node:test");
const { QueueService } = require("../application/queue-service.ts");
const { demoSubmissions } = require("../lib/demo-data.ts");
const { createReview } = require("../domain/scoring.ts");
const { ConflictError, NotFoundError, UnauthorizedError } = require("../server/http/errors.ts");
const { parseSkippedIds } = require("../server/http/validation.ts");

function fixture() {
  const priorReview = createReview("other judge", { progress: 7, practicality: 8, complexity: 9, notes: "Keep me" }, "2026-10-30T00:00:00Z");
  const submissions = ["a", "b", "c"].map((id, index) => ({
    ...structuredClone(demoSubmissions[0]), id,
    createdAt: `2026-10-${30 - index}T00:00:00Z`,
    status: index === 0 ? "in progress" : "available",
    claimedBy: index === 0 ? "judge" : "", claimedAt: index === 0 ? "2026-10-30T01:00:00Z" : "",
    reviews: index === 0 ? [priorReview] : [],
    totalScore: index === 0 ? priorReview.totalScore : 0,
  }));
  const repository = {
    list: async () => structuredClone(submissions),
    findById: async (id) => structuredClone(submissions.find((s) => s.id === id) || null),
    release: async (id) => Object.assign(submissions.find((s) => s.id === id), { status: "available", claimedBy: "", claimedAt: "" }),
    tryClaim: async (id, judgeName) => {
      const submission = submissions.find((s) => s.id === id);
      if (submission.status !== "available") return null;
      Object.assign(submission, { status: "in progress", claimedBy: judgeName });
      return structuredClone(submission);
    },
  };
  return { queue: new QueueService(() => repository), submissions };
}

test("skip releases only the reservation, preserves prior scores, and moves past skipped projects", async () => {
  const { queue, submissions } = fixture();
  const before = structuredClone(submissions[0]);
  await queue.skip("a", "judge");
  assert.deepEqual(submissions[0], { ...before, status: "available", claimedBy: "", claimedAt: "" });
  assert.equal((await queue.claimNext("judge", ["a"])).id, "b");
  await queue.skip("b", "judge");
  assert.equal((await queue.claimNext("judge", ["a", "b"])).id, "c");
  await queue.skip("c", "judge");
  assert.equal(await queue.claimNext("judge", ["a", "b", "c"]), null);
  assert.equal((await queue.claimNext("another judge")).id, "a");
});

test("clearing skips revisits projects, but never assigns a project already reviewed by that judge", async () => {
  const { queue } = fixture();
  await queue.skip("a", "judge");
  assert.equal((await queue.claimNext("judge")).id, "a");
  await queue.skip("a", "judge");
  assert.equal((await queue.claimNext("other judge")).id, "b");
});

test("skip rejects missing, unassigned, completed, and already reviewed submissions", async () => {
  const { queue, submissions } = fixture();
  await assert.rejects(queue.skip("missing", "judge"), NotFoundError);
  await assert.rejects(queue.skip("a", "stranger"), ConflictError);
  await assert.rejects(queue.skip("b", "judge"), ConflictError);
  submissions[0].status = "completed";
  await assert.rejects(queue.skip("a", "judge"), ConflictError);
  submissions[0].status = "in progress";
  submissions[0].claimedBy = "other judge";
  await assert.rejects(queue.skip("a", "other judge"), ConflictError);
  assert.equal(submissions[0].claimedBy, "other judge");
});

test("an existing reservation is recovered even when its ID was excluded", async () => {
  const { queue } = fixture();
  assert.equal((await queue.claimNext("judge", ["a"])).id, "a");
});

test("skipped IDs validate before queue mutations", () => {
  assert.deepEqual(parseSkippedIds({}), []);
  assert.deepEqual(parseSkippedIds({ skippedIds: ["a", "a", " b "] }), ["a", "b"]);
  for (const skippedIds of [null, "a", [5], [""], ["a".repeat(101)]]) {
    assert.throws(() => parseSkippedIds({ skippedIds }), /Skipped submission IDs/);
  }
});

test("skip HTTP endpoint requires a session, validates IDs, and uses the authenticated judge", async () => {
  const policies = require("../server/auth/policies.ts");
  const airtable = require("../lib/airtable.ts");
  const originalAuth = policies.requireHackathonSession;
  const originalSkip = airtable.skipSubmission;
  const { POST } = require("../app/api/queue/skip/route.ts");
  const request = (body) => new Request("http://localhost/api/queue/skip", { method: "POST", body: JSON.stringify(body) });
  const calls = [];
  try {
    airtable.skipSubmission = async (...args) => calls.push(args);
    policies.requireHackathonSession = async () => { throw new UnauthorizedError(); };
    assert.equal((await POST(request({ id: "a" }))).status, 401);
    policies.requireHackathonSession = async () => ({ name: "judge", role: "judge" });
    assert.equal((await POST(request({ id: "" }))).status, 400);
    assert.deepEqual(calls, []);
    const response = await POST(request({ id: "a", judgeName: "stranger" }));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.deepEqual(calls, [["a", "judge"]]);
  } finally {
    policies.requireHackathonSession = originalAuth;
    airtable.skipSubmission = originalSkip;
  }
});
