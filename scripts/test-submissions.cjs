/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
require("@next/env").loadEnvConfig(process.cwd(), true, {
  info() {},
  error() {},
});
const {
  insertEvent,
  readEvent,
  changeEvent,
  requireDatabasePool,
} = require("../infrastructure/database/events.ts");
const base = process.env.HACKBUDDY_TEST_URL || "http://localhost:3010";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
  throw new Error("Submission checks require a local server.");
const eventId = randomUUID(),
  slug = "qa-submissions-" + eventId;
const endpoint = base + "/api/hackathons/" + slug;
function answers(overrides = {}) {
  return {
    requestId: randomUUID(),
    projectName: "TEST ONLY — Robot helper",
    teamName: "TEST ONLY — Builders",
    teamNumber: "007",
    submitterNames: "Test Alex, Test Sam, Test Jo",
    contactEmail: "submission-test@example.com",
    oneLiner: "A voice-controlled sorting robot",
    description:
      "TEST ONLY: A robot that sorts objects using voice instructions.",
    progressOutline:
      "1. Collected demonstrations. 2. Integrated voice. 3. Tested recovery.",
    track: "Creative Applications",
    toolsUsed: "Dream-1, LiveKit, Dimensional, Python, ROS 2",
    demoVideoUrl: "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
    demoUrl: "https://example.com/demo",
    repositoryUrl: "https://github.com/example/robot",
    teamPhotoUrl: "https://example.com/team.png",
    ...overrides,
  };
}
async function post(input, headers = {}) {
  return fetch(endpoint + "/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base, ...headers },
    body: typeof input === "string" ? input : JSON.stringify(input),
  });
}
async function login(password, hackathon) {
  const response = await fetch(base + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify({
      name: "submission-qa",
      password,
      ...(hackathon ? { hackathon } : {}),
    }),
  });
  assert.equal(response.status, 200);
  return response.headers.get("set-cookie").split(";")[0];
}
async function run() {
  const pool = requireDatabasePool();
  try {
    await insertEvent({
      config: {
        id: eventId,
        slug,
        name: "TEST ONLY — Submission QA",
        active: true,
        storage: "database",
        scoringPolicy: "normalized-v1",
        baseId: "",
        tableName: "",
        reviewsTableName: "",
        imageUrl: "",
        squareImageUrl: "",
        settings: {
          requiredReviews: 2,
          finalistCount: 7,
          scoreMax: 10,
          collections: [],
          submissionsOpen: true,
          submissionForm: "makermods-physical-ai",
        },
      },
      submissions: [],
      drafts: {},
      publication: null,
    });
    const form = await fetch(base + "/" + slug + "/submit");
    assert.equal(form.status, 200, "public form");
    for (const [body, headers] of [
      ["{", {}],
      [[], {}],
      [null, {}],
      [answers({ description: "" }), {}],
      [answers({ track: "wrong" }), {}],
      [answers({ demoVideoUrl: "javascript:alert(1)" }), {}],
      [answers(), { Origin: "https://unrelated.example.com" }],
      [answers(), { Origin: "null" }],
      [answers({ description: "x".repeat(41000) }), {}],
    ]) {
      const response = await post(body, headers);
      assert.equal(response.status, 400, "invalid submission rejected");
      assert.equal((await response.json()).code, "VALIDATION_ERROR");
    }
    const input = answers();
    const created = await post(input);
    assert.equal(created.status, 201);
    const receipt = (await created.json()).id;
    assert.equal(receipt, input.requestId);
    const retry = await post(input);
    assert.equal(retry.status, 201);
    assert.equal((await retry.json()).id, receipt);
    assert.equal(
      (await post({ ...input, description: "Changed answers" })).status,
      409,
    );
    assert.equal((await post({ ...input, id: receipt })).status, 400);
    const hill = answers({
      track: "Hill Climb",
      oneLiner: "",
      demoVideoUrl: "",
      progressOutline: "",
      description: "Collected 120 episodes and trained for 5000 steps.",
    });
    assert.equal((await post(hill)).status, 201);
    assert.equal(
      (await post(answers({ track: "", demoVideoUrl: "" }))).status,
      400,
    );
    const concurrent = Array.from({ length: 8 }, (_, i) =>
      answers({ projectName: "TEST ONLY — Concurrent " + i }),
    );
    const responses = await Promise.all(concurrent.map((a) => post(a)));
    for (const response of responses)
      assert.equal(response.status, 201, await response.text());
    const retries = await Promise.all(
      Array.from({ length: 5 }, () => post(input)),
    );
    for (const response of retries) assert.equal(response.status, 201);
    const row = (
      await pool.query(
        "SELECT data,revision FROM public.hackbuddy_events WHERE id=$1",
        [eventId],
      )
    ).rows[0];
    assert.equal(row.data.submissions.length, 10);
    assert.equal(
      row.data.submissions.filter(
        (project) => project.track === "Creative Applications",
      ).length,
      9,
    );
    const hillProject = row.data.submissions.find(
      (project) => project.id === hill.requestId,
    );
    assert.equal(hillProject.track, "Hill Climb");
    assert.equal(hillProject.description, hill.description);
    assert.equal(hillProject.teamPhotoUrl, hill.teamPhotoUrl);
    assert.deepEqual(hillProject.toolsUsed, [
      "Dream-1",
      "LiveKit",
      "Dimensional",
      "Python",
      "ROS 2",
    ]);
    for (const key of ["oneLiner", "demoVideoUrl", "progressOutline"])
      assert.equal(hillProject[key], "");
    const project = row.data.submissions.find((s) => s.id === receipt);
    for (const key of [
      "projectName",
      "teamName",
      "teamNumber",
      "submitterNames",
      "contactEmail",
      "oneLiner",
      "description",
      "progressOutline",
      "track",
      "demoUrl",
      "demoVideoUrl",
      "teamPhotoUrl",
      "repositoryUrl",
    ])
      assert.equal(project[key], input[key], key + " round-trip");
    assert.deepEqual(project.toolsUsed, [
      "Dream-1",
      "LiveKit",
      "Dimensional",
      "Python",
      "ROS 2",
    ]);
    assert.equal(project.status, "available");
    assert.equal(project.reviews.length, 0);
    assert.equal((await fetch(endpoint + "/projects")).status, 401);
    assert.equal(
      (await fetch(endpoint + "/submission?id=" + receipt)).status,
      401,
    );
    const judgeCookie = await login(process.env.JUDGE_PASSWORD, slug);
    const judgeRead = await fetch(endpoint + "/submission?id=" + receipt, {
      headers: { Cookie: judgeCookie },
    });
    assert.equal(judgeRead.status, 200);
    assert.equal((await judgeRead.json()).submission.contactEmail, "");
    const adminCookie = await login(process.env.ADMIN_PASSWORD);
    const adminRead = await fetch(endpoint + "/submission?id=" + receipt, {
      headers: { Cookie: adminCookie },
    });
    assert.equal(adminRead.status, 200);
    assert.equal(
      (await adminRead.json()).submission.contactEmail,
      input.contactEmail,
    );
    await changeEvent(eventId, (e) => {
      e.config.settings.submissionsOpen = false;
    });
    assert.equal((await post(answers())).status, 409);
    assert.equal(
      (await post(input)).status,
      201,
      "retry still confirms existing submission after close",
    );
    const before = (await readEvent(eventId)).data.submissions.length;
    assert.equal(before, 10);
    console.log(
      "Submission HTTP + Supabase checks passed: both dynamic tracks, 10 persisted projects, 8 concurrent writes, retries, validation, origin checks, private contacts, closed events. Every form field matched the database.",
    );
  } finally {
    await pool.query(
      "DELETE FROM public.hackbuddy_events WHERE id=$1 AND data->'config'->>'slug'=$2",
      [eventId, slug],
    );
    assert.equal(
      (
        await pool.query("SELECT id FROM public.hackbuddy_events WHERE id=$1", [
          eventId,
        ])
      ).rows.length,
      0,
    );
    console.log(
      "Isolated QA event and its submissions removed; real events were untouched.",
    );
    await pool.end();
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
