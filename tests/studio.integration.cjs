/* eslint-disable @typescript-eslint/no-require-imports */
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join: pathJoin } = require("node:path");
const directory = mkdtempSync(pathJoin(tmpdir(), "hackbuddy-studio-"));
process.env.HACKBUDDY_STUDIO_DB = pathJoin(directory, "events.sqlite");
const s = require("../application/studio/service.ts");
const m = require("../domain/studio/model.ts");
const db = require("../infrastructure/studio/database.ts");
after(() => {
  db.database().close();
  rmSync(directory, { recursive: true, force: true });
});
let counter = 0;
function setup(
  overrides = {},
  rows = [
    { id: "a", name: "Alpha", email: "private@example.com" },
    { id: "b", name: "Beta" },
  ],
) {
  const n = ++counter,
    actor = s.signup({
      workspace: "Test lab",
      slug: `test-lab-${n}`,
      name: "Owner",
      password: "owner-pass",
    });
  const view = s.createEvent(actor, {
    name: `Event ${n}`,
    password: "judges",
    rules: {
      ...m.defaultRules,
      template: "single",
      reviews: 1,
      finalistCount: 2,
      winnerCount: 1,
      points: [1],
      ...overrides,
    },
  });
  const id = view.event.id;
  s.action(actor, id, { action: "import", rows });
  return { actor, id, slug: view.event.slug };
}
function start(x) {
  s.action(x.actor, x.id, { action: "ready" });
  s.action(x.actor, x.id, { action: "start" });
}
function judge(x, name = "Judge A") {
  return s.join(x.slug, { name, password: "judges" });
}
function complete(x, j, count = 10) {
  let finished = 0;
  for (let i = 0; i < count; i++) {
    const c = s.action(j, x.id, { action: "claim" });
    if (!c.project) break;
    const r = s.eventView(x.actor, x.id).event.rules;
    const high = c.project.name === "Alpha";
    const scores = Object.fromEntries(
      r.criteria.map((v) => [v.id, high ? v.max : v.min]),
    );
    s.action(j, x.id, {
      action: "submit",
      projectId: c.project.id,
      scores,
      notes: "Private reasoning",
    });
    finished++;
  }
  return finished;
}

test("separate workspaces cannot read or mutate another event", () => {
  const x = setup(),
    y = setup();
  assert.throws(() => s.eventView(y.actor, x.id), /not found/);
  assert.throws(
    () => s.action(y.actor, x.id, { action: "archive" }),
    /not found/,
  );
  assert.equal(s.listEvents(x.actor).length, 1);
  assert.equal(s.listEvents(y.actor)[0].id, y.id);
});
test("organizers sign in with their scoped, salted password", () => {
  const x = setup();
  const w = s.workspace(x.actor);
  assert.equal(
    s.login({ slug: w.slug, name: "OWNER", password: "owner-pass" }).orgId,
    x.actor.orgId,
  );
  assert.throws(
    () => s.login({ slug: w.slug, name: "Owner", password: "wrong" }),
    /incorrect/,
  );
  const stored = db.get("event", x.id);
  assert.notEqual(stored.judgePassword, "judges");
  assert.equal("judgePassword" in s.eventView(x.actor, x.id).event, false);
});
test("CSV handles quoted commas, escaped quotes, newlines, BOM and CRLF", () => {
  const rows = m.parseCsv(
    '\uFEFFname,description\r\n"A, B","Say ""hello""\nand build"\r\n',
  );
  assert.equal(rows[0].name, "A, B");
  assert.equal(rows[0].description, 'Say "hello"\nand build');
  assert.throws(() => m.parseCsv("name,name\nx,y"), /unique/);
  assert.throws(() => m.parseCsv("name,team\nx"), /columns/);
  assert.throws(() => m.parseCsv('name\n"x'), /unclosed/);
});
test("CSV export prevents spreadsheet formulas and preserves escaping", () => {
  assert.equal(m.csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.match(m.toCsv([{ name: "A,B" }], ["name"]), /"A,B"/);
});
test("import preview is read-only; repeat IDs update instead of duplicating", () => {
  const x = setup();
  const before = s.eventView(x.actor, x.id).projects.length;
  const preview = s.action(x.actor, x.id, {
    action: "preview-import",
    rows: [
      { id: "a", name: "Alpha revised" },
      { id: "c", name: "Gamma" },
    ],
  });
  assert.equal(preview.added, 1);
  assert.equal(preview.updated, 1);
  assert.equal(s.eventView(x.actor, x.id).projects.length, before);
  s.action(x.actor, x.id, {
    action: "import",
    rows: [{ id: "a", name: "Alpha revised" }],
  });
  assert.equal(s.eventView(x.actor, x.id).projects.length, before);
  assert.throws(
    () =>
      s.action(x.actor, x.id, {
        action: "import",
        rows: [{ name: "Bad", demo: "javascript:alert(1)" }],
      }),
    /http/,
  );
});
test("custom bounds, weights and required review counts drive the entire workflow", () => {
  const criteria = [
    {
      id: "useful",
      name: "Usefulness",
      guidance: "Why?",
      min: 1,
      max: 5,
      weight: 3,
    },
    {
      id: "craft",
      name: "Craft",
      guidance: "How?",
      min: 0,
      max: 100,
      weight: 1,
    },
  ];
  const x = setup({ criteria, reviews: 2 });
  start(x);
  const a = judge(x),
    b = judge(x, "Judge B");
  assert.equal(complete(x, a), 2);
  assert.throws(
    () => s.action(x.actor, x.id, { action: "publish" }),
    /required reviews/,
  );
  assert.equal(complete(x, b), 2);
  const v = s.action(x.actor, x.id, { action: "publish" });
  assert.equal(v.publication.winners[0].project.name, "Alpha");
  assert.equal(v.publication.winners[0].score, 100);
  assert.deepEqual(v.publication.rules.criteria, criteria);
});
test("weighted average rescales different criterion ranges before weighting", () => {
  const r = {
    ...m.defaultRules,
    criteria: [
      { id: "a", name: "A", guidance: "", min: 1, max: 5, weight: 3 },
      { id: "b", name: "B", guidance: "", min: 0, max: 100, weight: 1 },
    ],
  };
  const p = { id: "p", name: "P" };
  const ranked = m.rankProjects(
    [p],
    [{ projectId: "p", judgeId: "j", scores: { a: 5, b: 0 } }],
    r,
  );
  assert.equal(ranked[0].score, 75);
  assert.throws(() => m.validateScores({ a: 6, b: 50 }, r), /between/);
});
test("judging freezes format and projects; duplicate carries settings only", () => {
  const x = setup();
  start(x);
  const v = s.eventView(x.actor, x.id);
  assert.throws(
    () => s.action(x.actor, x.id, { action: "update", ...v.event }),
    /Duplicate/,
  );
  assert.throws(
    () =>
      s.action(x.actor, x.id, { action: "import", rows: [{ name: "New" }] }),
    /Duplicate/,
  );
  const copy = s.action(x.actor, x.id, { action: "duplicate" });
  assert.equal(copy.event.stage, "draft");
  assert.equal(copy.event.passwordSet, false);
  assert.equal(copy.projects.length, 0);
  assert.equal(copy.judges.length, 0);
  assert.equal(copy.reviews.length, 0);
  assert.deepEqual(copy.event.rules, v.event.rules);
});
test("unique reservations prevent double assignment and survive refresh", () => {
  const x = setup();
  start(x);
  const a = judge(x),
    b = judge(x, "Judge B");
  const ac = s.action(a, x.id, { action: "claim" }),
    bc = s.action(b, x.id, { action: "claim" });
  assert.notEqual(ac.project.id, bc.project.id);
  assert.equal(
    s.action(a, x.id, { action: "claim" }).project.id,
    ac.project.id,
  );
  assert.throws(
    () =>
      s.action(b, x.id, {
        action: "submit",
        projectId: ac.project.id,
        scores: { impact: 10, execution: 10, originality: 10 },
      }),
    /expired/,
  );
});
test("drafts do not count as reviews; resume restores notes and partial scores", () => {
  const x = setup();
  start(x);
  const a = judge(x),
    c = s.action(a, x.id, { action: "claim" });
  s.action(a, x.id, {
    action: "draft",
    projectId: c.project.id,
    scores: { impact: 4 },
    notes: "In progress",
  });
  const resumed = s.action(a, x.id, { action: "claim" });
  assert.deepEqual(resumed.draft.scores, { impact: 4 });
  assert.equal(resumed.draft.notes, "In progress");
  assert.equal(s.eventView(x.actor, x.id).reviews.length, 0);
  assert.throws(
    () =>
      s.action(a, x.id, {
        action: "submit",
        projectId: c.project.id,
        scores: { impact: 4 },
      }),
    /between/,
  );
});
test("expired reservations can be reassigned but old judge cannot submit", () => {
  const x = setup();
  start(x);
  const a = judge(x),
    c = s.action(a, x.id, { action: "claim" });
  db.database()
    .prepare("UPDATE studio_reservations SET expires_at=? WHERE event_id=?")
    .run("2000-01-01T00:00:00.000Z", x.id);
  assert.throws(
    () =>
      s.action(a, x.id, {
        action: "submit",
        projectId: c.project.id,
        scores: { impact: 5, execution: 5, originality: 5 },
      }),
    /expired/,
  );
  assert.ok(s.action(judge(x, "Judge B"), x.id, { action: "claim" }).project);
});
test("track assignments and conflicts exclude ineligible projects", () => {
  const x = setup({}, [
    { id: "a", name: "Alpha", track: "Design" },
    { id: "b", name: "Beta", track: "Climate" },
  ]);
  const all = s.eventView(x.actor, x.id).projects;
  s.action(x.actor, x.id, {
    action: "judge",
    name: "Specialist",
    tracks: ["Climate"],
    conflicts: [],
  });
  start(x);
  const j = judge(x, "Specialist"),
    c = s.action(j, x.id, { action: "claim" });
  assert.equal(c.project.name, "Beta");
  s.action(x.actor, x.id, {
    action: "judge",
    id: j.judgeId,
    name: "Specialist",
    tracks: [],
    conflicts: all.map((p) => p.id),
  });
  assert.equal(s.action(j, x.id, { action: "claim" }).project, null);
});
test("revoking and renaming judge identities preserves reviews and stops access", () => {
  const x = setup();
  start(x);
  const j = judge(x);
  complete(x, j);
  s.action(x.actor, x.id, {
    action: "judge",
    id: j.judgeId,
    name: "Renamed Judge",
    active: true,
  });
  assert.equal(judge(x, "Renamed Judge").judgeId, j.judgeId);
  assert.equal(s.eventView(j, x.id).reviews.length, 2);
  s.action(x.actor, x.id, {
    action: "judge",
    id: j.judgeId,
    name: "Renamed Judge",
    active: false,
  });
  assert.throws(() => s.eventView(j, x.id), /revoked/);
  assert.throws(() => judge(x, "Renamed Judge"), /revoked/);
});
test("judges cannot cross events or exercise organizer operations", () => {
  const x = setup(),
    y = setup();
  start(x);
  const j = judge(x);
  assert.throws(() => s.eventView(j, y.id), /not found/);
  assert.throws(() => s.action(j, x.id, { action: "archive" }), /Organizer/);
  assert.equal(s.eventView(j, x.id).projects[0].email, "");
});
test("blind and after-review visibility are enforced in serialized responses", () => {
  const x = setup({ reviews: 2 });
  start(x);
  const a = judge(x),
    b = judge(x, "Other judge");
  complete(x, a, 1);
  const blind = s.eventView(b, x.id);
  assert.equal(blind.preliminary.length, 0);
  assert.equal(blind.reviews.length, 0);
  assert.equal(blind.audit.length, 0);
  s.action(x.actor, x.id, {
    action: "visibility",
    visibility: "after-review",
    publicGallery: true,
    publicResults: false,
  });
  assert.equal(s.eventView(a, x.id).preliminary.length, 1);
  assert.equal(s.eventView(b, x.id).preliminary.length, 0);
});
test("one-project ranked finals use one ballot position and immutable revisions", () => {
  const x = setup(
    {
      template: "ranked-final",
      winnerCount: 3,
      finalistCount: 7,
      points: [3, 2, 1],
    },
    [{ name: "Alpha" }],
  );
  start(x);
  const j = judge(x);
  complete(x, j);
  const final = s.action(x.actor, x.id, { action: "start-final" });
  const id = final.event.finalists[0];
  s.action(j, x.id, { action: "ballot", picks: [id] });
  const p = s.action(x.actor, x.id, { action: "publish" });
  assert.equal(p.publication.winners.length, 1);
  assert.equal(p.publication.winners[0].score, 3);
  const revised = s.action(x.actor, x.id, {
    action: "revise",
    winnerIds: [id],
    reason: "Confirmed team attribution",
  });
  assert.equal(revised.publications.length, 2);
  assert.equal(revised.publications[1].revision, 1);
  s.action(x.actor, x.id, { action: "archive" });
  assert.equal(s.publicShowcase(x.slug).event.stage, "archived");
  assert.throws(
    () => s.action(j, x.id, { action: "ballot", picks: [id] }),
    /not accepting/,
  );
});
test("two-project ranked final validates ballot uniqueness and all-judge quorum", () => {
  const x = setup({
    template: "ranked-final",
    winnerCount: 2,
    finalistCount: 2,
    points: [5, 2],
  });
  start(x);
  const a = judge(x),
    b = judge(x, "Judge B");
  complete(x, a);
  const v = s.action(x.actor, x.id, { action: "start-final" });
  const [p, q] = v.event.finalists;
  assert.throws(
    () => s.action(a, x.id, { action: "ballot", picks: [p, p] }),
    /different/,
  );
  s.action(a, x.id, { action: "ballot", picks: [p, q] });
  assert.throws(
    () => s.action(x.actor, x.id, { action: "publish" }),
    /required final ballots/,
  );
  s.action(b, x.id, { action: "ballot", picks: [p, q] });
  assert.equal(
    s.action(x.actor, x.id, { action: "publish" }).publication.winners[0].score,
    10,
  );
});
test("scored finals keep separate reviews and enforce final coverage", () => {
  const x = setup({ template: "scored-final", finalReviews: 1 });
  start(x);
  const j = judge(x);
  complete(x, j);
  s.action(x.actor, x.id, { action: "start-final" });
  assert.throws(
    () => s.action(x.actor, x.id, { action: "publish" }),
    /required reviews/,
  );
  assert.equal(complete(x, j), 2);
  const v = s.action(x.actor, x.id, { action: "publish" });
  assert.equal(v.reviews.length, 4);
  assert.equal(v.publication.winners[0].project.name, "Alpha");
});
test("publication requires a recorded organizer decision for tied winners", () => {
  const x = setup();
  start(x);
  const j = judge(x);
  for (let i = 0; i < 2; i++) {
    const c = s.action(j, x.id, { action: "claim" });
    s.action(j, x.id, {
      action: "submit",
      projectId: c.project.id,
      scores: { impact: 5, execution: 5, originality: 5 },
    });
  }
  assert.throws(() => s.action(x.actor, x.id, { action: "publish" }), /tied/);
  const p = s.eventView(x.actor, x.id).projects[0];
  const v = s.action(x.actor, x.id, {
    action: "publish",
    winnerIds: [p.id],
    reason: "Panel tie-break decision",
  });
  assert.equal(v.publication.reason, "Panel tie-break decision");
});
test("public gallery omits private notes, contacts, ballots and live scores", () => {
  const x = setup();
  start(x);
  const j = judge(x);
  complete(x, j);
  assert.equal(s.publicShowcase(x.slug).publication, null);
  s.action(x.actor, x.id, { action: "publish" });
  assert.equal(s.publicShowcase(x.slug).publication.results.length, 1);
  const publicView = JSON.stringify(s.publicShowcase(x.slug));
  assert.equal(publicView.includes("private@example.com"), false);
  assert.equal(publicView.includes("Private reasoning"), false);
  assert.equal(publicView.includes("judgePassword"), false);
  assert.equal(publicView.includes("judgeId"), false);
  s.action(x.actor, x.id, {
    action: "visibility",
    visibility: "blind",
    publicGallery: true,
    publicResults: false,
  });
  assert.equal(s.publicShowcase(x.slug).publication, null);
  s.action(x.actor, x.id, {
    action: "visibility",
    visibility: "blind",
    publicGallery: false,
    publicResults: false,
  });
  assert.throws(() => s.publicShowcase(x.slug), /private/);
});
test("sample workspaces are isolated and sample roster IDs resolve correctly", () => {
  const a = s.sampleWorkspace(),
    b = s.sampleWorkspace();
  assert.notEqual(a.actor.orgId, b.actor.orgId);
  assert.equal(s.listEvents(a.actor).length, 3);
  const v = s.eventView(a.actor, a.eventId);
  s.action(a.actor, a.eventId, { action: "ready" });
  const j = s.join(v.event.slug, { name: "Jamie Chen", password: "judges" });
  assert.equal(j.judgeId, v.judges[0].id);
  assert.equal(s.eventView(j, a.eventId).judges.length, 1);
});

test("workspace owners invite and revoke independent organizer identities", () => {
  const x = setup();
  s.editTeam(x.actor, { name: "Co-organizer", password: "team-pass" });
  const co = s.login({
    slug: s.workspace(x.actor).slug,
    name: "Co-organizer",
    password: "team-pass",
  });
  assert.equal(s.eventView(co, x.id).event.id, x.id);
  assert.throws(
    () => s.editTeam(co, { name: "Other", password: "123456" }),
    /owner/,
  );
  s.editTeam(x.actor, { id: co.userId, active: false });
  assert.throws(() => s.workspace(co), /revoked/);
  assert.throws(() => s.listEvents(co), /revoked/);
});
test("retrying the same submitted review is idempotent and edits are rejected", () => {
  const x = setup();
  start(x);
  const j = judge(x),
    c = s.action(j, x.id, { action: "claim" });
  const input = {
    action: "submit",
    projectId: c.project.id,
    scores: { impact: 5, execution: 6, originality: 7 },
    notes: "Done",
  };
  s.action(j, x.id, input);
  s.action(j, x.id, input);
  assert.equal(s.eventView(x.actor, x.id).reviews.length, 1);
  assert.throws(
    () => s.action(j, x.id, { ...input, notes: "Changed" }),
    /already submitted/,
  );
});
test("five-criterion 1–5 events coexist with the default three-criterion event", () => {
  const criteria = Array.from({ length: 5 }, (_, i) => ({
    id: `c${i}`,
    name: `Criterion ${i}`,
    guidance: "Consider this",
    min: 1,
    max: 5,
    weight: i + 1,
  }));
  const x = setup({ criteria, reviews: 3 }, [{ name: "Alpha" }]),
    y = setup();
  start(x);
  for (const name of ["One", "Two", "Three"]) complete(x, judge(x, name));
  assert.equal(
    s.action(x.actor, x.id, { action: "publish" }).publication.winners[0].score,
    100,
  );
  assert.equal(s.eventView(y.actor, y.id).event.rules.criteria.length, 3);
  assert.equal(s.eventView(y.actor, y.id).reviews.length, 0);
});

test("after-review visibility is scoped to the current round", () => {
  const x = setup({
    template: "scored-final",
    visibility: "after-review",
    finalReviews: 1,
  });
  start(x);
  const j = judge(x);
  complete(x, j);
  s.action(x.actor, x.id, { action: "start-final" });
  assert.equal(s.eventView(j, x.id).results.length, 0);
  assert.equal(s.eventView(j, x.id).preliminary.length, 2);
  complete(x, j, 1);
  assert.equal(s.eventView(j, x.id).results.length, 1);
});
test("reserved object property names cannot become criterion IDs", () => {
  for (const id of ["__proto__", "constructor", "prototype"])
    assert.throws(
      () =>
        m.validateRules({
          ...m.defaultRules,
          criteria: [{ ...m.defaultRules.criteria[0], id }],
        }),
      /different criterion/,
    );
});

test("ranked-final coverage and aggregate access follow eligible submitted ballots", () => {
  const x = setup({ template: "ranked-final", visibility: "after-review" });
  start(x);
  const j = judge(x);
  complete(x, j);
  const v = s.action(x.actor, x.id, { action: "start-final" });
  assert.equal(s.eventView(j, x.id).results.length, 0);
  const p = v.event.finalists[0];
  s.action(j, x.id, { action: "ballot", picks: [p] });
  const submitted = s.eventView(j, x.id);
  assert.equal(submitted.results.length, 2);
  assert.equal(submitted.stats.complete, 1);
  assert.equal(submitted.stats.required, 1);
  s.action(x.actor, x.id, {
    action: "judge",
    id: j.judgeId,
    name: j.name,
    conflicts: [p],
  });
  assert.equal(s.eventView(j, x.id).ballots.length, 0);
  assert.throws(
    () => s.action(x.actor, x.id, { action: "publish" }),
    /required final ballots/,
  );
});
