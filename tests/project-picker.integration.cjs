/* eslint-disable @typescript-eslint/no-require-imports */
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
delete process.env.SUPABASE_DB_HOST;
process.env.NODE_ENV = "test";
process.env.HACKBUDDY_DB = ":memory:";
const db = require("../infrastructure/database/events.ts");
const { withEventConfig } = require("../lib/event-context.ts");
const repo = require("../infrastructure/database/submission-repository.ts");
const { EMPTY_CREATIVE } = require("../domain/creative-rubric.ts");
const policies = require("../server/auth/policies.ts");
const route = require("../app/api/hackathons/[hackathon]/queue/projects/route.ts");
const originalSession = policies.requireSession, originalHackathon = policies.requireHackathonSession;
after(() => { policies.requireSession = originalSession; policies.requireHackathonSession = originalHackathon; });
const creative = { ...EMPTY_CREATIVE, originality: 4, technicalDifficulty: 4, robustness: 4, demoQuality: 4, presentation: 4 };
async function fixture(form = "makermods-physical-ai") {
  const config = { id: randomUUID(), slug: "picker-" + randomUUID(), name: "Picker test", active: true,
    storage: "database", scoringPolicy: "raw-v1", settings: { submissionForm: form, requiredReviews: 6 } };
  const project = (id, track = "Creative Applications") => ({ id, teamNumber: "001", projectName: id,
    track, createdAt: new Date().toISOString(), reviews: [], claimedBy: "", claimedAt: "", contactEmail: "private@example.com" });
  await db.insertEvent({ config, submissions: [project("a"), project("b"), project("hill", "Hill Climb")], drafts: {}, publication: null });
  return config;
}
function session(config, name = "alex") {
  const value = { name, role: "judge", hackathon: config.slug };
  policies.requireSession = policies.requireHackathonSession = async () => value;
}
function request(body) { return new Request("https://example.com/api", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
const ctx = config => ({ params: Promise.resolve({ hackathon: config.slug }) });
test("switching preserves drafts, other judges and idempotent reservations", async () => {
  const config = await fixture();
  await withEventConfig(config, async () => {
    await repo.selectMakerModsProject("a", "alex");
    await repo.selectMakerModsProject("a", "sam");
    await repo.draftDatabaseReview("a", "alex", { creative, notes: "unfinished" });
    await repo.selectMakerModsProject("b", "alex");
    await repo.selectMakerModsProject("b", "alex");
    let saved = (await db.readEvent(config.id)).data;
    assert.equal(saved.submissions[0].judgeClaims.alex, undefined);
    assert.ok(saved.submissions[0].judgeClaims.sam);
    assert.equal(saved.drafts["alex:a"].scores.notes, "unfinished");
    await repo.selectMakerModsProject("a", "alex");
    assert.equal((await repo.draftDatabaseReview("a", "alex")).scores.notes, "unfinished");
    await assert.rejects(repo.selectMakerModsProject("missing", "alex"), { status: 404 });
    await assert.rejects(repo.selectMakerModsProject("hill", "alex"), { status: 409 });
    assert.equal((await repo.databaseSubmissionRepository().findById("a", "alex")).claimedBy, "alex");
    await repo.completeDatabaseReview("a", "alex", { progress: 0, practicality: 0, complexity: 0, creative, notes: "" });
    await assert.rejects(repo.selectMakerModsProject("a", "alex"), { status: 409 });
    saved = (await db.readEvent(config.id)).data;
    assert.ok(saved.submissions[0].judgeClaims.sam);
  });
});
test("explicit choice permits another judge after six reviews and respects publication locks", async () => {
  const config = await fixture();
  await withEventConfig(config, async () => {
    await db.changeEvent(config.id, event => {
      event.submissions[0].reviews = Array.from({length: 6}, (_, i) => ({ judgeName: "old" + i,
        progressScore: 0, practicalityScore: 0, complexityScore: 0, totalScore: 80, creative, notes: "", completedAt: "now" }));
    });
    assert.equal((await repo.selectMakerModsProject("a", "new")).claimedBy, "new");
    await repo.completeDatabaseReview("a", "new", { progress: 0, practicality: 0, complexity: 0, creative, notes: "" });
    assert.equal((await db.readEvent(config.id)).data.submissions[0].reviews.length, 7);
    await db.changeEvent(config.id, event => { event.publication = { locked: true }; });
    await assert.rejects(repo.selectMakerModsProject("b", "new"), { status: 409 });
  });
});
test("picker routes require the event session, hide private fields and use the authenticated judge", async () => {
  const config = await fixture(); session(config);
  const response = await route.GET(new Request("https://example.com/api"), ctx(config));
  assert.equal(response.status, 200);
  const list = (await response.json()).projects;
  assert.deepEqual(list.map(p => p.id), ["a", "b"]);
  assert.equal(list[0].contactEmail, undefined);
  assert.equal(list[0].reviews, undefined);
  assert.equal((await route.POST(request({id: ""}), ctx(config))).status, 400);
  assert.equal((await route.POST(request({id: "a", judgeName: "spoofed"}), ctx(config))).status, 200);
  const data = (await db.readEvent(config.id)).data;
  assert.ok(data.submissions[0].judgeClaims.alex);
  assert.equal(data.submissions[0].judgeClaims.spoofed, undefined);
  const other = await fixture(); session(other);
  assert.equal((await route.POST(request({id: "a"}), ctx(config))).status, 403);
  const standard = await fixture("standard"); session(standard);
  assert.equal((await route.GET(new Request("https://example.com/api"), ctx(standard))).status, 403);
  const { UnauthorizedError } = require("../server/http/errors.ts");
  policies.requireSession = async () => { throw new UnauthorizedError(); };
  assert.equal((await route.POST(request({id: "a"}), ctx(config))).status, 401);
});
