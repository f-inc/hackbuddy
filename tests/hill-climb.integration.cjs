/* eslint-disable @typescript-eslint/no-require-imports */
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { mkdtempSync, rmSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
delete process.env.SUPABASE_DB_HOST;
process.env.NODE_ENV = "test";
const directory = mkdtempSync(join(tmpdir(), "hackbuddy-hill-"));
process.env.HACKBUDDY_DB = join(directory, "test.sqlite");
after(() => rmSync(directory, { recursive: true, force: true }));
const {
  EMPTY_HILL_RUN,
  hillClimbScore,
  validHillRun,
} = require("../domain/hill-climb.ts");
const {
  insertEvent,
  readEvent,
  changeEvent,
} = require("../infrastructure/database/events.ts");
const { withEventConfig } = require("../lib/event-context.ts");
const {
  hillClimbTeams,
  saveHillClimbGrade,
} = require("../application/hill-climb.ts");
const { saveProject } = require("../application/project-submission.ts");
const {
  getAllSubmissions,
  completeSubmission,
  claimNextSubmission,
  getQueueStats,
} = require("../lib/airtable.ts");
const run = (fields = {}) => ({ ...EMPTY_HILL_RUN, ...fields });
async function fixture() {
  const id = randomUUID();
  const config = {
    id,
    slug: "hill-" + id,
    name: "Hill test",
    active: true,
    storage: "database",
    scoringPolicy: "raw-v1",
    baseId: "",
    tableName: "",
    reviewsTableName: "",
    imageUrl: "",
    squareImageUrl: "",
    settings: {
      submissionForm: "makermods-physical-ai",
      requiredReviews: 2,
      finalistCount: 7,
      scoreMax: 10,
      submissionsOpen: true,
      collections: [],
    },
  };
  await insertEvent({ config, submissions: [], publication: null, drafts: {} });
  const sid = await saveProject(id, {
    requestId: randomUUID(),
    projectName: "Relay robot",
    teamName: "Builders",
    teamNumber: "007",
    submitterNames: "Alex",
    contactEmail: "alex@example.com",
    repositoryUrl: "https://github.com/example/relay",
    track: "Hill Climb",
    description: "Collected 120 episodes and trained for 5000 steps.",
  });
  return { config, sid, inEvent: (fn) => withEventConfig(config, fn) };
}
test("relay rubric calculates every bonus, full inches and solo restrictions", () => {
  const scored = run({
    cablesUnplugged: 3,
    cablesPlugged: 4,
    towerHeight: 5.9,
    towerStable: true,
    headToHead: true,
    tallerTower: true,
    golfBalls: 3,
    liveKit: true,
    dimensional: true,
  });
  assert.equal(validHillRun(scored), true);
  assert.deepEqual(hillClimbScore(scored), {
    points: 175,
    disqualified: false,
    automaticLoss: false,
    breakdown: { cables: 100, tower: 45, balls: 15, tools: 15 },
  });
  assert.equal(hillClimbScore({ ...scored, headToHead: false }).points, 165);
  assert.equal(hillClimbScore(run({ cablesUnplugged: 1 })).points, 10);
  assert.equal(hillClimbScore(run()).points, 0);
  // A tower that passed earlier still earns the pass bonus if it falls before the end.
  assert.equal(
    hillClimbScore(
      run({ cablesUnplugged: 1, towerStable: true, towerHeight: 0 }),
    ).points,
    30,
  );
});
test("8-ball keeps points; every DQ flag zeros the score and loses", () => {
  const scored = run({
    cablesUnplugged: 1,
    towerStable: true,
    towerHeight: 4,
    golfBalls: 2,
  });
  assert.equal(hillClimbScore({ ...scored, blackBall: true }).points, 52);
  assert.equal(
    hillClimbScore({ ...scored, blackBall: true }).automaticLoss,
    true,
  );
  for (const flag of ["skippedStage", "humanTouch", "humanInput"]) {
    const result = hillClimbScore({ ...scored, [flag]: true });
    assert.equal(result.points, 0);
    assert.equal(result.disqualified, true);
    assert.equal(result.automaticLoss, true);
  }
});
test("rejects impossible counts, missing booleans, stage skips and unearned taller bonus", () => {
  for (const fields of [
    { cablesPlugged: 5 },
    { golfBalls: -1 },
    { cablesUnplugged: 0.5 },
    { towerHeight: Infinity },
    { liveKit: "yes" },
    { golfBalls: 1 },
    { towerStable: true },
    { tallerTower: true },
    { towerHeight: NaN },
  ])
    assert.equal(validHillRun(run(fields)), false);
  assert.equal(validHillRun(run({ golfBalls: 1, skippedStage: true })), true);
});
test("persists team grades per judge, preserves other judges, checks stale edits and locks publication", async () => {
  const f = await fixture();
  await f.inEvent(async () => {
    const input = {
      id: f.sid,
      run: run({ cablesUnplugged: 1 }),
      previousUpdatedAt: null,
    };
    const a = await saveHillClimbGrade("alex", input);
    await saveHillClimbGrade("sam", {
      ...input,
      run: run({ liveKit: true, dimensional: true }),
    });
    assert.equal((await hillClimbTeams("alex")).teams[0].grade.points, 10);
    assert.equal((await hillClimbTeams("sam")).teams[0].grade.points, 15);
    assert.equal((await hillClimbTeams("new")).teams[0].grade, null);
    const b = await saveHillClimbGrade("alex", {
      ...input,
      previousUpdatedAt: a.updatedAt,
      run: run({ cablesUnplugged: 2 }),
    });
    assert.ok(b.updatedAt > a.updatedAt);
    await assert.rejects(saveHillClimbGrade("alex", input), { status: 409 });
    await assert.rejects(
      saveHillClimbGrade("alex", { ...input, run: run({ cablesPlugged: 5 }) }),
      { status: 400 },
    );
    const other = await fixture();
    await assert.rejects(
      saveHillClimbGrade("alex", { ...input, id: other.sid }),
      { status: 404 },
    );
    await changeEvent(f.config.id, (event) => {
      event.publication = { publishedAt: "locked" };
    });
    assert.equal((await hillClimbTeams("alex")).locked, true);
    await assert.rejects(
      saveHillClimbGrade("alex", { ...input, previousUpdatedAt: b.updatedAt }),
      { status: 409 },
    );
    assert.equal(
      (await readEvent(f.config.id)).data.hillClimbGrades[f.sid]["judge:sam"]
        .points,
      15,
    );
  });
});
test("Hill Climb stays visible in projects and out of creative queue and its counts", async () => {
  const f = await fixture();
  await f.inEvent(async () => {
    assert.equal((await getAllSubmissions()).length, 1);
    assert.equal(await claimNextSubmission("alex"), null);
    assert.deepEqual(await getQueueStats(), {
      total: 0,
      available: 0,
      inProgress: 0,
      completed: 0,
    });
  });
});
test("non-MakerMods and historical events cannot use relay scoring", async () => {
  const f = await fixture();
  await withEventConfig(
    {
      ...f.config,
      settings: { ...f.config.settings, submissionForm: "standard" },
    },
    () => assert.rejects(hillClimbTeams("alex"), { status: 404 }),
  );
});

test("old relay reservations cannot save generic rubric scores or block creative judging", async () => {
  const f = await fixture();
  await changeEvent(f.config.id, (event) => {
    event.submissions[0].claimedBy = "alex";
    event.submissions[0].claimedAt = new Date().toISOString();
  });
  const creativeId = await saveProject(f.config.id, {
    requestId: randomUUID(), projectName: "Creative robot", teamName: "Creators", teamNumber: "008", repositoryUrl: "https://github.com/example/creative",
    submitterNames: "Sam", contactEmail: "sam@example.com", track: "Creative Applications",
    oneLiner: "A robot assistant", description: "A creative project", progressOutline: "Built a demo",
    demoVideoUrl: "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
  });
  await f.inEvent(async () => {
    await assert.rejects(completeSubmission(f.sid, "alex", {
      progress: 5, practicality: 5, complexity: 5, notes: "",
    }), { status: 409 });
    assert.equal((await claimNextSubmission("alex")).id, creativeId);
    assert.equal((await readEvent(f.config.id)).data.submissions[0].reviews.length, 0);
  });
});
