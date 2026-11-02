import assert from "node:assert/strict";
const base = process.env.STUDIO_TEST_URL || "http://127.0.0.1:3000";
const jars = { owner: "", judge: "", outsider: "" };
async function request(path, data, identity = "owner", status = 200) {
  const res = await fetch(`${base}/api/studio/${path}`, {
    method: data ? "POST" : "GET",
    headers: {
      Origin: base,
      ...(data ? { "Content-Type": "application/json" } : {}),
      ...(jars[identity] ? { Cookie: jars[identity] } : {}),
    },
    body: data ? JSON.stringify(data) : undefined,
  });
  const set = res.headers.getSetCookie();
  if (set.length) jars[identity] = set.map((c) => c.split(";")[0]).join("; ");
  const body = await res.json();
  assert.equal(res.status, status, `${path}: ${JSON.stringify(body)}`);
  return body;
}
let ready = false;
for (let i = 0; i < 60; i++) {
  try {
    const res = await fetch(`${base}/studio`);
    if (res.ok) {
      ready = true;
      break;
    }
  } catch {}
  await new Promise((r) => setTimeout(r, 500));
}
assert.ok(ready, "Studio server did not start within 30 seconds.");
const slug = `http-${Date.now()}`;
await request("session", {
  action: "signup",
  workspace: "HTTP smoke lab",
  slug,
  name: "Owner",
  password: "owner-pass",
});
const rules = {
  version: 1,
  template: "single",
  criteria: [
    {
      id: "useful",
      name: "Useful",
      guidance: "Does it help?",
      min: 1,
      max: 5,
      weight: 1,
    },
  ],
  reviews: 1,
  finalReviews: 1,
  finalistCount: 1,
  winnerCount: 1,
  points: [1],
  scoring: "average",
  visibility: "blind",
  publicGallery: true,
  publicResults: true,
  guests: true,
  quorum: "all",
  reservationMinutes: 15,
};
let v = await request("events", { name: slug, password: "judges", rules });
const id = v.event.id;
await request(`events/${id}`, {
  action: "import",
  rows: [
    {
      name: "A useful idea",
      team: "Maya & Alex",
      email: "private@example.com",
    },
  ],
});
await request(`events/${id}`, { action: "ready" });
await request(`events/${id}`, { action: "start" });
await request(`events/${id}`, undefined, "outsider", 401);
await request(
  `join/${slug}`,
  { name: "First Judge", password: "judges" },
  "judge",
);
v = await request(`events/${id}?as=judge`, undefined, "judge");
assert.equal(v.results.length, 0);
assert.equal(v.projects[0].email, "");
const c = await request(`events/${id}?as=judge`, { action: "claim" }, "judge");
await request(
  `events/${id}?as=judge`,
  {
    action: "draft",
    projectId: c.project.id,
    scores: { useful: 4 },
    notes: "Private draft",
  },
  "judge",
);
const resumed = await request(
  `events/${id}?as=judge`,
  { action: "claim" },
  "judge",
);
assert.equal(resumed.draft.notes, "Private draft");
await request(`events/${id}?as=judge`, { action: "publish" }, "judge", 403);
await request(
  `events/${id}?as=judge`,
  {
    action: "submit",
    projectId: c.project.id,
    scores: { useful: 5 },
    notes: "Private review",
  },
  "judge",
);
v = await request(`events/${id}`, { action: "publish" });
assert.equal(v.publication.winners[0].project.name, "A useful idea");
const pub = await request(`public/${slug}`, undefined, "outsider");
const encoded = JSON.stringify(pub);
assert.equal(encoded.includes("private@example.com"), false);
assert.equal(encoded.includes("Private review"), false);
await request(`events/${id}`, { action: "archive" });
assert.equal(
  (await request(`public/${slug}`, undefined, "outsider")).event.stage,
  "archived",
);
for (const path of ["/studio", `/events/${slug}`, `/showcase/${slug}`])
  assert.equal((await fetch(base + path)).status, 200);
console.log(
  "Studio HTTP journey passed: signup → setup → judge login → draft recovery → review → publication → archive; organizer/judge/public isolation verified.",
);
