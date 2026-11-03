import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import {
  database,
  get,
  list,
  put,
  remove,
  throttle,
  transaction,
} from "../../infrastructure/studio/database";
import {
  defaultRules,
  integer,
  object,
  rankBallots,
  rankProjects,
  required,
  slugify,
  text,
  url,
  validateRules,
  validateScores,
  type Award,
  type Ballot,
  type Draft,
  type Event,
  type EventView,
  type Judge,
  type Project,
  type Publication,
  type Reservation,
  type Review,
  type Rules,
  type StudioActor,
  type Workspace,
} from "../../domain/studio/model";
export class StudioError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
const uid = () => randomUUID();
const now = () => new Date().toISOString();
export function hashPassword(value: unknown) {
  const p = required(value, "Password", 200);
  if (p.length < 6)
    throw new StudioError("Use a password of at least 6 characters.");
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(p, salt, 32).toString("hex")}`;
}
function matches(value: unknown, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash || typeof value !== "string" || value.length > 200)
    return false;
  const a = scryptSync(value.trim(), salt, 32);
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
export function organizer(actor: StudioActor) {
  if (actor.role !== "organizer")
    throw new StudioError("Organizer access required.", 403);
  workspace(actor);
}
export function workspace(actor: StudioActor) {
  const w = get<Workspace>("workspace", actor.orgId);
  if (!w) throw new StudioError("Sign in again.", 401);
  if (actor.role === "organizer" && !actor.demo) {
    const u = get<{ orgId: string; active?: boolean }>(
      "user",
      actor.userId || "",
    );
    if (!u || u.orgId !== actor.orgId || u.active === false)
      throw new StudioError("Workspace access has been revoked.", 401);
  }
  return w;
}
export function ownedEvent(actor: StudioActor, id: string) {
  workspace(actor);
  const e = get<Event>("event", id);
  if (
    !e ||
    e.orgId !== actor.orgId ||
    (actor.role === "judge" && actor.eventId !== id)
  )
    throw new StudioError("Event not found.", 404);
  if (
    actor.role === "judge" &&
    !get<Judge>("judge", actor.judgeId || "")?.active
  )
    throw new StudioError("Judge access has been revoked.", 403);
  return e;
}
function audit(e: Event, actor: StudioActor, action: string, detail = "") {
  const id = uid();
  put("audit", id, e.id, { id, action, actor: actor.name, at: now(), detail });
}
function save(e: Event) {
  e.updatedAt = now();
  put("event", e.id, e.orgId, e);
}
function editable(e: Event) {
  if (!["draft", "ready"].includes(e.stage))
    throw new StudioError(
      "Judging has started. Duplicate this event to change its format or projects.",
    );
}
function active(e: Event) {
  if (!["judging", "final"].includes(e.stage))
    throw new StudioError("This event is not accepting reviews right now.");
}
const rules = (e: Event) => e.frozenRules || e.rules;
const round = (e: Event) => (e.stage === "final" ? "final" : "preliminary");
const projects = (e: Event) => list<Project>("project", e.id);
const judges = (e: Event) => list<Judge>("judge", e.id);
function reviews(e: Event): Review[] {
  return database()
    .prepare("SELECT data FROM studio_reviews WHERE event_id=?")
    .all(e.id)
    .map((r) => JSON.parse(String(r.data)));
}
function reservations(e: Event): Reservation[] {
  return database()
    .prepare(
      "SELECT project_id AS projectId,judge_id AS judgeId,expires_at AS expiresAt,round FROM studio_reservations WHERE event_id=? AND expires_at>?",
    )
    .all(e.id, now()) as Reservation[];
}
function ballots(e: Event) {
  const active = judges(e).filter((j) => j.active);
  const count = Math.min(rules(e).winnerCount, e.finalists.length);
  return list<Ballot>("ballot", e.id).filter((b) => {
    const j = active.find((j) => j.id === b.judgeId);
    if (!j || b.picks.length !== count || new Set(b.picks).size !== count)
      return false;
    const allowed = new Set(
      eligible({ ...e, stage: "final" }, j).map((p) => p.id),
    );
    return b.picks.every((id) => allowed.has(id));
  });
}
const publicProject = (p: Project): Project => ({ ...p, email: "" });
function cleanPublication(p: Publication): Publication {
  return {
    ...p,
    results: p.winners.map((r) => ({
      ...r,
      project: publicProject(r.project),
    })),
    winners: p.winners.map((r) => ({
      ...r,
      project: publicProject(r.project),
    })),
    finalists: p.finalists
      .map(publicProject)
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}
function rankings(e: Event) {
  const ps = projects(e),
    rs = reviews(e),
    r = rules(e);
  const preliminary = rankProjects(
    ps,
    rs.filter((v) => v.round === "preliminary"),
    r,
  );
  const cohort = ps.filter((p) => e.finalists.includes(p.id));
  const results =
    r.template === "single"
      ? preliminary
      : r.template === "ranked-final"
        ? rankBallots(cohort, ballots(e), r)
        : rankProjects(
            cohort,
            rs.filter((v) => v.round === "final"),
            r,
          );
  return { preliminary, results };
}
function shortlist(e: Event) {
  if (e.finalists.length)
    return projects(e).filter((p) => e.finalists.includes(p.id));
  return rankings(e)
    .preliminary.filter((r) => r.reviews >= rules(e).reviews)
    .slice(0, rules(e).finalistCount)
    .map((r) => r.project);
}
function eligible(e: Event, j: Judge) {
  if (
    round(e) === "final" &&
    e.finalJudgeIds &&
    !e.finalJudgeIds.includes(j.id)
  )
    return [];
  return projects(e).filter(
    (p) =>
      !j.conflicts.includes(p.id) &&
      (!j.tracks.length || j.tracks.includes(p.track)) &&
      (round(e) !== "final" || e.finalists.includes(p.id)),
  );
}
function readiness(e: Event) {
  const ps = projects(e),
    js = judges(e).filter((j) => j.active);
  return [
    { label: "At least one project imported", ok: ps.length > 0 },
    { label: "Judging criteria configured", ok: e.rules.criteria.length > 0 },
    { label: "Judge password set", ok: !!e.judgePassword },
    {
      label: "Enough eligible judges for every project",
      ok:
        e.rules.guests ||
        (ps.length > 0 &&
          ps.every(
            (p) =>
              js.filter(
                (j) =>
                  !j.conflicts.includes(p.id) &&
                  (!j.tracks.length || j.tracks.includes(p.track)),
              ).length >=
              Math.max(
                e.rules.reviews,
                e.rules.template === "scored-final" ? e.rules.finalReviews : 1,
              ),
          )),
    },
  ];
}
export function eventView(actor: StudioActor, id: string): EventView {
  const e = ownedEvent(actor, id),
    all = projects(e),
    rs = reviews(e),
    r = rules(e),
    js = judges(e),
    ranked = rankings(e);
  const pubs = list<Publication>("publication", e.id).sort(
    (a, b) => b.revision - a.revision,
  );
  const admin = actor.role === "organizer",
    own = rs.filter((v) => v.judgeId === actor.judgeId);
  const visible = (id: string, roundId: string) =>
    admin ||
    r.visibility === "live" ||
    (r.visibility === "after-review" &&
      (roundId === "final" && r.template === "ranked-final"
        ? ballots(e).some((b) => b.judgeId === actor.judgeId)
        : own.some((v) => v.projectId === id && v.round === roundId)));
  const { judgePassword, ...safe } = e;
  const finalRound =
    e.finalists.length > 0 &&
    ["final", "published", "archived"].includes(e.stage);
  const current = finalRound
    ? all.filter((p) => e.finalists.includes(p.id))
    : all;
  const needed = finalRound ? r.finalReviews : r.reviews;
  const ballotRound = finalRound && r.template === "ranked-final";
  const eligibleVoters = js.filter(
    (j) =>
      j.active &&
      eligible({ ...e, stage: "final" }, j).length >=
        Math.min(r.winnerCount, e.finalists.length),
  );
  return {
    event: { ...safe, passwordSet: !!judgePassword },
    projects: admin ? all : all.map(publicProject),
    judges: admin ? js : js.filter((j) => j.id === actor.judgeId),
    results: ranked.results
      .filter((v) =>
        visible(
          v.project.id,
          r.template === "single" ? "preliminary" : "final",
        ),
      )
      .map((v) => ({
        ...v,
        project: admin ? v.project : publicProject(v.project),
      })),
    shortlist: shortlist(e)
      .map(publicProject)
      .sort((a, b) => a.name.localeCompare(b.name)),
    liveWinners: (admin || (r.publicResults && e.stage === "final")
      ? ranked.results
          .filter((v) =>
            r.template === "ranked-final"
              ? ballots(e).length > 0
              : v.reviews > 0,
          )
          .slice(0, r.winnerCount)
      : []
    ).map((v) => ({
      ...v,
      project: admin ? v.project : publicProject(v.project),
    })),
    preliminary: ranked.preliminary
      .filter((v) => visible(v.project.id, "preliminary"))
      .map((v) => ({
        ...v,
        project: admin ? v.project : publicProject(v.project),
      })),
    publication: pubs[0]
      ? admin
        ? pubs[0]
        : r.publicResults
          ? cleanPublication(pubs[0])
          : null
      : null,
    publications: admin ? pubs : [],
    reviews: admin ? rs : own,
    ballots: admin
      ? ballots(e)
      : ballots(e).filter((b) => b.judgeId === actor.judgeId),
    reservations: reservations(e).filter(
      (v) => admin || v.judgeId === actor.judgeId,
    ),
    actor,
    readiness: admin ? readiness(e) : [],
    stats: {
      projects: all.length,
      reviews: rs.length,
      complete: ballotRound
        ? ballots(e).length
        : current.filter(
            (p) =>
              rs.filter(
                (v) =>
                  v.projectId === p.id &&
                  v.round === (finalRound ? "final" : "preliminary"),
              ).length >= needed,
          ).length,
      required: ballotRound ? eligibleVoters.length : current.length,
      ballots: ballots(e).length,
    },
    audit: admin
      ? list<EventView["audit"][number]>("audit", e.id).reverse().slice(0, 200)
      : [],
  };
}
export function signup(input: Record<string, unknown>) {
  const slug = slugify(required(input.slug, "Workspace address"));
  if (!slug)
    throw new StudioError(
      "Choose a workspace address with letters or numbers.",
    );
  const password = hashPassword(input.password);
  return transaction(() => {
    if (list<Workspace>("workspace").some((w) => w.slug === slug))
      throw new StudioError("That workspace address is already in use.");
    const w: Workspace = {
      id: uid(),
      name: required(input.workspace, "Workspace name"),
      slug,
    };
    const user = {
      id: uid(),
      orgId: w.id,
      name: required(input.name, "Your name"),
      password,
      active: true,
      owner: true,
    };
    put("workspace", w.id, w.id, w);
    put("user", user.id, w.id, user);
    return {
      role: "organizer",
      orgId: w.id,
      name: user.name,
      userId: user.id,
    } as StudioActor;
  });
}
export function login(input: Record<string, unknown>) {
  const slug = slugify(required(input.slug, "Workspace address")),
    name = required(input.name, "Name");
  throttle(`organizer:${slug}:${name.toLowerCase()}`);
  const w = list<Workspace>("workspace").find((w) => w.slug === slug);
  const u =
    w &&
    list<{ id: string; name: string; password: string; active?: boolean }>(
      "user",
      w.id,
    ).find((u) => u.name.toLowerCase() === name.toLowerCase());
  if (!w || !u || u.active === false || !matches(input.password, u.password))
    throw new StudioError("Workspace, name, or password is incorrect.", 401);
  return {
    role: "organizer",
    orgId: w.id,
    name: u.name,
    userId: u.id,
  } as StudioActor;
}
export function listEvents(actor: StudioActor) {
  organizer(actor);
  return list<Event>("event", actor.orgId).map((e) => {
    const { judgePassword, ...safe } = e;
    return {
      ...safe,
      passwordSet: !!judgePassword,
      projectCount: projects(e).length,
      judgeCount: judges(e).length,
    };
  });
}
function newEvent(actor: StudioActor, input: Record<string, unknown>) {
  const name = required(input.name, "Event name"),
    slug = slugify(text(input.slug) || name);
  if (!slug)
    throw new StudioError("Choose an event address with letters or numbers.");
  if (list<Event>("event").some((e) => e.slug === slug))
    throw new StudioError("That event address is already in use.");
  const e: Event = {
    id: uid(),
    orgId: actor.orgId,
    name,
    slug,
    description: text(input.description),
    image: url(input.image),
    stage: "draft",
    rules: validateRules(input.rules || defaultRules),
    sponsors: [],
    finalists: [],
    frozenRules: null,
    judgePassword: input.password ? hashPassword(input.password) : "",
    createdAt: now(),
    updatedAt: now(),
  };
  save(e);
  audit(e, actor, "Event created");
  return e;
}
export function createEvent(
  actor: StudioActor,
  input: Record<string, unknown>,
) {
  organizer(actor);
  return transaction(() => eventView(actor, newEvent(actor, input).id));
}
export function publicInfo(slug: string) {
  const e = list<Event>("event").find((e) => e.slug === slug);
  if (!e) throw new StudioError("Event not found.", 404);
  return {
    id: e.id,
    slug: e.slug,
    name: e.name,
    description: e.description,
    image: e.image,
    stage: e.stage,
    hasGallery: e.rules.publicGallery,
  };
}
export function join(slug: string, input: Record<string, unknown>) {
  const info = publicInfo(slug),
    name = required(input.name, "Your name", 100);
  throttle(`judge:${info.id}:${name.toLowerCase()}`);
  return transaction(() => {
    const e = get<Event>("event", info.id)!;
    if (!matches(input.password, e.judgePassword))
      throw new StudioError("Incorrect event password.", 401);
    if (["draft", "archived"].includes(e.stage))
      throw new StudioError("This event is not open to judges.");
    let j = judges(e).find((j) => j.key === name.toLowerCase());
    if (j && !j.active)
      throw new StudioError("Judge access has been revoked.", 403);
    if (!j && !e.rules.guests)
      throw new StudioError(
        "Your name is not on the judge roster. Use the exact name on your invitation.",
        403,
      );
    if (!j) {
      j = {
        id: uid(),
        eventId: e.id,
        name,
        key: name.toLowerCase(),
        active: true,
        tracks: [],
        conflicts: [],
      };
      put("judge", j.id, e.id, j);
    }
    const actor: StudioActor = {
      role: "judge",
      orgId: e.orgId,
      eventId: e.id,
      judgeId: j.id,
      name: j.name,
    };
    audit(e, actor, "Judge signed in");
    return actor;
  });
}
export function importProjects(
  actor: StudioActor,
  e: Event,
  rows: unknown,
  apply: boolean,
) {
  organizer(actor);
  editable(e);
  if (!Array.isArray(rows) || !rows.length || rows.length > 5000)
    throw new StudioError("Import between 1 and 5,000 projects.");
  const old = projects(e);
  const seen = new Set<string>();
  let added = 0,
    updated = 0;
  const prepared = rows.map((item, i) => {
    const row = object(item),
      name = required(row.name, `Row ${i + 1}: name`),
      externalId = text(row.id, 200);
    const key = externalId || name.toLowerCase();
    if (seen.has(key))
      throw new StudioError(`Duplicate import key on row ${i + 1}: ${key}`);
    seen.add(key);
    const existing = old.find((p) =>
      externalId
        ? p.externalId === externalId
        : p.name.toLowerCase() === name.toLowerCase(),
    );
    if (existing) updated++;
    else added++;
    return {
      id: existing?.id || uid(),
      eventId: e.id,
      externalId,
      name,
      team: text(row.team, 500),
      description: text(row.description, 5000),
      track: text(row.track, 100),
      tools: text(row.tools, 1000),
      demo: url(row.demo),
      repository: url(row.repository),
      image: url(row.image),
      email: text(row.email, 300),
      createdAt: existing?.createdAt || now(),
    } satisfies Project;
  });
  if (apply) {
    for (const p of prepared) put("project", p.id, e.id, p);
    e.stage = "draft";
    save(e);
    audit(e, actor, "Projects imported", `${added} added, ${updated} updated`);
  }
  return { added, updated, rows: prepared };
}
function assertReservation(e: Event, actor: StudioActor, projectId: string) {
  const found = reservations(e).find(
    (v) =>
      v.round === round(e) &&
      v.projectId === projectId &&
      v.judgeId === actor.judgeId,
  );
  if (!found)
    throw new StudioError(
      "Your reservation expired. Get a project again; your draft is saved.",
      409,
    );
}
function claim(e: Event, j: Judge, skip: string[] = []) {
  active(e);
  if (e.stage === "final" && rules(e).template === "ranked-final")
    throw new StudioError("The final round uses a ranked ballot.");
  const db = database(),
    r = round(e);
  db.prepare("DELETE FROM studio_reservations WHERE expires_at<=?").run(now());
  const own = reservations(e).find((v) => v.judgeId === j.id && v.round === r);
  if (own)
    return {
      project: publicProject(projects(e).find((p) => p.id === own.projectId)!),
      draft:
        get<Draft>("draft", `${e.id}:${r}:${j.id}:${own.projectId}`) || null,
    };
  const rs = reviews(e).filter((v) => v.round === r),
    busy = new Set(
      reservations(e)
        .filter((v) => v.round === r)
        .map((v) => v.projectId),
    );
  const target = r === "final" ? rules(e).finalReviews : rules(e).reviews;
  const count = (id: string) => rs.filter((v) => v.projectId === id).length;
  const options = eligible(e, j)
    .filter(
      (p) =>
        !skip.includes(p.id) &&
        !busy.has(p.id) &&
        !rs.some((v) => v.projectId === p.id && v.judgeId === j.id) &&
        count(p.id) < target,
    )
    .sort(
      (a, b) =>
        count(a.id) - count(b.id) ||
        a.createdAt.localeCompare(b.createdAt) ||
        a.id.localeCompare(b.id),
    );
  const p = options[0];
  if (!p) return { project: null, draft: null };
  db.prepare("INSERT INTO studio_reservations VALUES(?,?,?,?,?)").run(
    e.id,
    r,
    p.id,
    j.id,
    new Date(Date.now() + rules(e).reservationMinutes * 60000).toISOString(),
  );
  return {
    project: publicProject(p),
    draft: get<Draft>("draft", `${e.id}:${r}:${j.id}:${p.id}`) || null,
  };
}
function awards(input: unknown): Award[] {
  if (!Array.isArray(input) || input.length > 30)
    throw new StudioError("Use at most 30 award collections.");
  return input.map((item) => {
    const a = object(item);
    return {
      id: text(a.id) || uid(),
      name: required(a.name, "Award name"),
      sponsor: text(a.sponsor, 200),
      logo: url(a.logo),
      tool: text(a.tool, 100),
      track: text(a.track, 100),
      prize: text(a.prize, 500),
    };
  });
}
export function action(
  actor: StudioActor,
  id: string,
  input: Record<string, unknown>,
): unknown {
  return transaction(() => {
    const e = ownedEvent(actor, id),
      kind = required(input.action, "Action");
    if (
      ["claim", "draft", "submit", "heartbeat", "skip", "ballot"].includes(kind)
    ) {
      if (actor.role !== "judge")
        throw new StudioError("Sign in as a judge to review projects.", 403);
      active(e);
      const j = get<Judge>("judge", actor.judgeId!)!;
      if (kind === "claim")
        return claim(
          e,
          j,
          Array.isArray(input.skip) ? input.skip.map(String) : [],
        );
      if (kind === "ballot") {
        if (e.stage !== "final" || rules(e).template !== "ranked-final")
          throw new StudioError("Ranked ballots are not open.");
        const count = Math.min(rules(e).winnerCount, e.finalists.length);
        const picks = Array.isArray(input.picks) ? input.picks.map(String) : [];
        if (
          picks.length !== count ||
          new Set(picks).size !== count ||
          picks.some((p) => !eligible(e, j).some((v) => v.id === p))
        )
          throw new StudioError(
            `Choose ${count} different eligible finalists in order.`,
          );
        put("ballot", `${e.id}:${j.id}`, e.id, {
          judgeId: j.id,
          picks,
          submittedAt: now(),
        });
        audit(e, actor, "Final ballot submitted");
        return eventView(actor, id);
      }
      const projectId = required(input.projectId, "Project");
      if (kind === "submit") {
        const existing = reviews(e).find(
          (v) =>
            v.projectId === projectId &&
            v.judgeId === j.id &&
            v.round === round(e),
        );
        if (existing) {
          const next = validateScores(input.scores, rules(e));
          if (
            JSON.stringify(existing.scores) !== JSON.stringify(next) ||
            existing.notes !== text(input.notes, 10000)
          )
            throw new StudioError(
              "This review was already submitted and cannot be changed.",
              409,
            );
          return { ok: true };
        }
      }
      assertReservation(e, actor, projectId);
      const db = database(),
        r = round(e),
        draftId = `${e.id}:${r}:${j.id}:${projectId}`;
      if (kind === "heartbeat") {
        db.prepare(
          "UPDATE studio_reservations SET expires_at=? WHERE event_id=? AND round=? AND project_id=? AND judge_id=?",
        ).run(
          new Date(
            Date.now() + rules(e).reservationMinutes * 60000,
          ).toISOString(),
          id,
          r,
          projectId,
          j.id,
        );
        return { ok: true };
      }
      if (kind === "skip") {
        db.prepare(
          "DELETE FROM studio_reservations WHERE event_id=? AND round=? AND project_id=? AND judge_id=?",
        ).run(id, r, projectId, j.id);
        audit(e, actor, "Project skipped", projectId);
        return { ok: true };
      }
      if (!eligible(e, j).some((p) => p.id === projectId))
        throw new StudioError(
          "You are not eligible to review this project.",
          403,
        );
      const scores =
        kind === "submit"
          ? validateScores(input.scores, rules(e))
          : Object.fromEntries(
              rules(e)
                .criteria.filter(
                  (c) => object(input.scores)[c.id] !== undefined,
                )
                .map((c) => [
                  c.id,
                  integer(object(input.scores)[c.id], c.name, c.min, c.max),
                ]),
            );
      const notes = text(input.notes, 10000);
      if (kind === "draft") {
        put("draft", draftId, e.id, { scores, notes, updatedAt: now() });
        return { ok: true };
      }
      const review: Review = {
        id: uid(),
        eventId: id,
        projectId,
        judgeId: j.id,
        round: r,
        scores,
        notes,
        submittedAt: now(),
      };
      db.prepare("INSERT INTO studio_reviews VALUES(?,?,?,?,?)").run(
        id,
        r,
        projectId,
        j.id,
        JSON.stringify(review),
      );
      remove("draft", draftId);
      db.prepare(
        "DELETE FROM studio_reservations WHERE event_id=? AND round=? AND project_id=? AND judge_id=?",
      ).run(id, r, projectId, j.id);
      audit(e, actor, "Review submitted", projectId);
      return { ok: true };
    }
    organizer(actor);
    if (kind === "configure") {
      const next = validateRules(input.rules);
      const reason = required(input.reason, "Change reason", 2000);
      for (const review of reviews(e)) validateScores(review.scores, next);
      if (
        e.finalists.length &&
        (next.template !== rules(e).template ||
          next.winnerCount !== rules(e).winnerCount ||
          JSON.stringify(next.points) !== JSON.stringify(rules(e).points))
      )
        throw new StudioError(
          "Reset the second pass before changing its voting format, winner count, or points.",
        );
      e.name = required(input.name, "Event name");
      e.description = text(input.description, 5000);
      e.image = url(input.image);
      e.sponsors = awards(input.sponsors || e.sponsors);
      e.rules = next;
      if (e.frozenRules) e.frozenRules = structuredClone(next);
      if (input.password) e.judgePassword = hashPassword(input.password);
      save(e);
      audit(e, actor, "Event configuration edited", reason);
    } else if (kind === "edit-project") {
      const old = projects(e).find((p) => p.id === input.projectId);
      if (!old) throw new StudioError("Project not found.", 404);
      const row = object(input.project);
      const next: Project = {
        ...old,
        name: required(row.name, "Project name"),
        team: text(row.team, 500),
        description: text(row.description, 5000),
        track: text(row.track, 100),
        tools: text(row.tools, 1000),
        demo: url(row.demo),
        repository: url(row.repository),
        image: url(row.image),
        email: text(row.email, 300),
      };
      put("project", next.id, e.id, next);
      audit(
        e,
        actor,
        "Project edited",
        JSON.stringify({ before: old, after: next }),
      );
    } else if (kind === "final-roster") {
      if (e.stage !== "final")
        throw new StudioError(
          "Edit the voting panel while the second pass is open.",
        );
      const ids = Array.isArray(input.judgeIds)
        ? input.judgeIds.map(String)
        : [];
      const reason = required(input.reason, "Roster change reason");
      if (
        !ids.length ||
        new Set(ids).size !== ids.length ||
        ids.some((id) => !judges(e).some((j) => j.id === id && j.active))
      )
        throw new StudioError("Choose active second-pass judges.");
      e.finalJudgeIds = ids;
      if (
        !judges(e).some(
          (j) =>
            j.active &&
            eligible(e, j).length >=
              Math.min(rules(e).winnerCount, e.finalists.length),
        )
      )
        throw new StudioError(
          "Choose at least one eligible second-pass judge.",
        );
      save(e);
      audit(e, actor, "Second-pass roster edited", reason);
    } else if (kind === "edit-ballot") {
      if (
        !["final", "published", "archived"].includes(e.stage) ||
        rules(e).template !== "ranked-final"
      )
        throw new StudioError("Second-pass ballots are not available.");
      const j = judges(e).find((j) => j.id === input.judgeId && j.active);
      if (!j) throw new StudioError("Judge not found.", 404);
      const reason = required(input.reason, "Correction reason");
      const picks = Array.isArray(input.picks) ? input.picks.map(String) : [];
      const count = Math.min(rules(e).winnerCount, e.finalists.length);
      if (
        picks.length !== count ||
        new Set(picks).size !== count ||
        picks.some(
          (id) =>
            !eligible({ ...e, stage: "final" }, j).some((p) => p.id === id),
        )
      )
        throw new StudioError(`Choose ${count} different eligible finalists.`);
      const old = get<Ballot>("ballot", `${e.id}:${j.id}`);
      const next = { judgeId: j.id, picks, submittedAt: now() };
      put("ballot", `${e.id}:${j.id}`, e.id, next);
      audit(
        e,
        actor,
        "Final ballot corrected",
        JSON.stringify({ reason, before: old || null, after: next }),
      );
    } else if (kind === "edit-review") {
      const old = reviews(e).find((r) => r.id === input.reviewId);
      if (!old) throw new StudioError("Review not found.", 404);
      const reason = required(input.reason, "Change reason", 2000);
      const next = {
        ...old,
        scores: validateScores(input.scores, rules(e)),
        notes: text(input.notes, 10000),
      };
      database()
        .prepare(
          "UPDATE studio_reviews SET data=? WHERE event_id=? AND round=? AND project_id=? AND judge_id=?",
        )
        .run(JSON.stringify(next), e.id, old.round, old.projectId, old.judgeId);
      audit(
        e,
        actor,
        "Submitted score edited",
        JSON.stringify({ reason, before: old, after: next }),
      );
    } else if (kind === "select-finalists") {
      if (e.stage !== "judging")
        throw new StudioError("Edit Top 7 before starting the second pass.");
      const pool = rankings(e).preliminary.filter(
        (r) => r.reviews >= rules(e).reviews,
      );
      const ids = Array.isArray(input.finalistIds)
        ? input.finalistIds.map(String)
        : [];
      const count = Math.min(rules(e).finalistCount, pool.length);
      if (
        !count ||
        ids.length !== count ||
        new Set(ids).size !== count ||
        ids.some((id) => !pool.some((r) => r.project.id === id))
      )
        throw new StudioError(
          `Choose ${count} different projects with complete first-pass reviews.`,
        );
      const reason = required(input.reason, "Selection reason");
      e.finalists = ids;
      save(e);
      audit(e, actor, "Top finalists edited", reason);
    } else if (kind === "reset-final") {
      if (e.stage !== "final")
        throw new StudioError("Only an unpublished second pass can be reset.");
      const reason = required(input.reason, "Reset reason");
      database()
        .prepare(
          "DELETE FROM studio_records WHERE kind='draft' AND scope=? AND id LIKE ?",
        )
        .run(e.id, `${e.id}:final:%`);
      database()
        .prepare(
          "DELETE FROM studio_reviews WHERE event_id=? AND round='final'",
        )
        .run(e.id);
      database()
        .prepare("DELETE FROM studio_reservations WHERE event_id=?")
        .run(e.id);
      for (const b of list<Ballot>("ballot", e.id))
        remove("ballot", `${e.id}:${b.judgeId}`);
      e.finalists = [];
      delete e.finalJudgeIds;
      e.stage = "judging";
      save(e);
      audit(e, actor, "Second pass reset", reason);
    } else if (kind === "update") {
      editable(e);
      e.name = required(input.name, "Event name");
      e.description = text(input.description, 5000);
      e.image = url(input.image);
      e.rules = validateRules(input.rules);
      e.sponsors = awards(input.sponsors || e.sponsors);
      if (input.password) e.judgePassword = hashPassword(input.password);
      e.stage = "draft";
      save(e);
      audit(e, actor, "Event settings updated");
    } else if (kind === "visibility") {
      e.rules = {
        ...e.rules,
        visibility: ["blind", "after-review", "live"].includes(
          String(input.visibility),
        )
          ? (input.visibility as Rules["visibility"])
          : e.rules.visibility,
        publicGallery: input.publicGallery === true,
        publicResults: input.publicResults === true,
      };
      if (e.frozenRules)
        e.frozenRules = {
          ...e.frozenRules,
          visibility: e.rules.visibility,
          publicGallery: e.rules.publicGallery,
          publicResults: e.rules.publicResults,
        };
      save(e);
      audit(e, actor, "Visibility updated");
    } else if (kind === "import" || kind === "preview-import")
      return importProjects(actor, e, input.rows, kind === "import");
    else if (kind === "remove-project") {
      editable(e);
      const p = projects(e).find((p) => p.id === input.projectId);
      if (!p) throw new StudioError("Project not found.", 404);
      remove("project", p.id);
      e.stage = "draft";
      save(e);
      audit(e, actor, "Project removed", p.name);
    } else if (kind === "judge") {
      if (["published", "archived"].includes(e.stage))
        throw new StudioError("Judge roster is closed.");
      const name = required(input.name, "Judge name", 100);
      const old = input.id
        ? judges(e).find((j) => j.id === input.id)
        : judges(e).find((j) => j.key === name.toLowerCase());
      if (input.id && !old) throw new StudioError("Judge not found.", 404);
      if (
        judges(e).some((j) => j.key === name.toLowerCase() && j.id !== old?.id)
      )
        throw new StudioError("That judge name is already in use.");
      const conflicts = Array.isArray(input.conflicts)
        ? input.conflicts.map(String)
        : [];
      if (conflicts.some((c) => !projects(e).some((p) => p.id === c)))
        throw new StudioError("Unknown conflict project.");
      const j: Judge = {
        id: old?.id || uid(),
        eventId: id,
        name,
        key: name.toLowerCase(),
        active: input.active !== false,
        tracks: Array.isArray(input.tracks)
          ? input.tracks.map((t) => text(t, 100)).filter(Boolean)
          : [],
        conflicts,
      };
      put("judge", j.id, id, j);
      database()
        .prepare(
          "DELETE FROM studio_reservations WHERE event_id=? AND judge_id=?",
        )
        .run(id, j.id);
      audit(e, actor, old ? "Judge updated" : "Judge invited", name);
    } else if (kind === "ready") {
      editable(e);
      if (readiness(e).some((v) => !v.ok))
        throw new StudioError("Complete the setup checklist first.");
      e.stage = "ready";
      save(e);
      audit(e, actor, "Event ready");
    } else if (kind === "start") {
      if (e.stage !== "ready" || readiness(e).some((v) => !v.ok))
        throw new StudioError("Mark the event ready before opening judging.");
      e.frozenRules = structuredClone(e.rules);
      e.stage = "judging";
      save(e);
      audit(e, actor, "Judging opened", "Rules frozen");
    } else if (kind === "start-final") {
      if (e.stage !== "judging" || rules(e).template === "single")
        throw new StudioError("Finals cannot start in this stage.");
      const ranked = rankings(e).preliminary.filter(
        (p) => p.reviews >= rules(e).reviews,
      );
      const minimum = Math.min(rules(e).winnerCount, projects(e).length);
      if (ranked.length < minimum)
        throw new StudioError(
          `At least ${minimum} projects need their required first-pass reviews.`,
        );
      const count = Math.min(rules(e).finalistCount, ranked.length);
      const chosen = Array.isArray(input.finalistIds)
        ? input.finalistIds.map(String)
        : e.finalists;
      if (chosen.length) {
        if (
          (!text(input.reason) && !e.finalists.length) ||
          chosen.length !== count ||
          new Set(chosen).size !== count ||
          chosen.some((p) => !ranked.some((r) => r.project.id === p))
        )
          throw new StudioError(
            "A finalist override needs a reason and the complete, unique finalist selection.",
          );
        e.finalists = chosen;
      } else {
        if (
          ranked[count] &&
          Math.abs(ranked[count - 1].score - ranked[count].score) < 1e-10
        )
          throw new StudioError(
            "There is a tie at the finalist cutoff. Select finalists and record a reason.",
          );
        e.finalists = ranked.slice(0, count).map((v) => v.project.id);
      }
      if (Array.isArray(input.judgeIds)) {
        const ids = input.judgeIds.map(String);
        if (
          !ids.length ||
          new Set(ids).size !== ids.length ||
          ids.some((id) => !judges(e).some((j) => j.id === id && j.active))
        )
          throw new StudioError("Choose an active second-pass judge roster.");
        e.finalJudgeIds = ids;
      }
      if (
        !judges(e).some(
          (j) =>
            j.active &&
            eligible({ ...e, stage: "final" }, j).length >=
              Math.min(rules(e).winnerCount, e.finalists.length),
        )
      )
        throw new StudioError(
          "Choose at least one judge eligible to vote on the finalists.",
        );
      e.stage = "final";
      save(e);
      database()
        .prepare("DELETE FROM studio_reservations WHERE event_id=?")
        .run(id);
      audit(e, actor, "Final round opened", text(input.reason));
    } else if (kind === "release") {
      active(e);
      database()
        .prepare(
          "DELETE FROM studio_reservations WHERE event_id=? AND project_id=?",
        )
        .run(id, required(input.projectId, "Project"));
      audit(e, actor, "Reservation released", text(input.projectId));
    } else if (kind === "duplicate") {
      const copy = newEvent(actor, {
        name: `${e.name} — next edition`,
        slug: `${e.slug}-${randomBytes(3).toString("hex")}`,
        description: e.description,
        image: e.image,
        rules: e.rules,
      });
      copy.sponsors = structuredClone(e.sponsors);
      save(copy);
      audit(copy, actor, "Configuration copied", e.id);
      return eventView(actor, copy.id);
    } else if (kind === "archive") {
      if (e.stage !== "published")
        throw new StudioError("Publish results before archiving.");
      e.stage = "archived";
      save(e);
      audit(e, actor, "Event archived");
    } else if (kind === "publish" || kind === "revise")
      publish(e, actor, input, kind === "revise");
    else throw new StudioError("Unknown action.");
    return eventView(actor, id);
  });
}
function publish(
  e: Event,
  actor: StudioActor,
  input: Record<string, unknown>,
  revise: boolean,
) {
  const previous = list<Publication>("publication", e.id).sort(
    (a, b) => b.revision - a.revision,
  )[0];
  if (previous && !revise) return;
  if (
    revise
      ? !["published", "archived"].includes(e.stage)
      : !(rules(e).template === "single"
          ? e.stage === "judging"
          : e.stage === "final")
  )
    throw new StudioError("This event is not ready to publish.");
  const reason = text(input.reason);
  if (revise && !reason)
    throw new StudioError(
      "Explain the correction. Previous publications stay in the audit history.",
    );
  const r = rules(e),
    ranked = rankings(e),
    cohort =
      r.template === "single"
        ? projects(e)
        : projects(e).filter((p) => e.finalists.includes(p.id));
  if (r.template === "ranked-final") {
    const bs = ballots(e),
      eligibleJudges = judges(e).filter(
        (j) =>
          j.active &&
          eligible({ ...e, stage: "final" }, j).length >=
            Math.min(r.winnerCount, cohort.length),
      );
    if (
      !bs.length ||
      (r.quorum === "all" &&
        eligibleJudges.some((j) => !bs.some((b) => b.judgeId === j.id)))
    )
      throw new StudioError(
        "Wait for the required final ballots before publishing.",
      );
  } else if (
    ranked.results.some(
      (v) => v.reviews < (r.template === "single" ? r.reviews : r.finalReviews),
    )
  )
    throw new StudioError(
      "Every project needs its required reviews before publishing.",
    );
  const count = Math.min(r.winnerCount, cohort.length),
    ids = Array.isArray(input.winnerIds) ? input.winnerIds.map(String) : [];
  let winners = ranked.results.slice(0, count);
  if (ids.length) {
    if (
      !reason ||
      ids.length !== count ||
      new Set(ids).size !== count ||
      ids.some((id) => !cohort.some((p) => p.id === id))
    )
      throw new StudioError(
        "A winner override needs a reason and a complete, unique winner selection.",
      );
    winners = ids.map((id) => ranked.results.find((v) => v.project.id === id)!);
  } else if (revise || winners.some((v) => v.tied))
    throw new StudioError(
      "Resolve tied winners or corrections with an explicit ordered winner selection and reason.",
    );
  const p: Publication = {
    id: uid(),
    eventId: e.id,
    revision: (previous?.revision || 0) + 1,
    reason,
    publishedAt: now(),
    publishedBy: actor.name,
    eventName: e.name,
    rules: structuredClone(r),
    results: ranked.preliminary,
    winners,
    finalists: cohort,
    sponsors: structuredClone(e.sponsors),
  };
  put("publication", p.id, e.id, p);
  if (e.stage !== "archived") e.stage = "published";
  save(e);
  database()
    .prepare("DELETE FROM studio_reservations WHERE event_id=?")
    .run(e.id);
  audit(
    e,
    actor,
    revise ? "Results corrected" : "Results published",
    reason || `Revision ${p.revision}`,
  );
}
export function publicShowcase(slug: string) {
  const e = get<Event>("event", publicInfo(slug).id)!;
  if (!e.rules.publicGallery)
    throw new StudioError("This gallery is private.", 404);
  const p = list<Publication>("publication", e.id).sort(
    (a, b) => b.revision - a.revision,
  )[0];
  return {
    event: {
      name: e.name,
      slug: e.slug,
      description: e.description,
      image: e.image,
      stage: e.stage,
      finalistCount: rules(e).finalistCount,
    },
    projects: projects(e)
      .map(publicProject)
      .sort((a, b) => a.name.localeCompare(b.name)),
    finalists: shortlist(e)
      .map(publicProject)
      .sort((a, b) => a.name.localeCompare(b.name)),
    liveWinners:
      e.rules.publicResults && e.stage === "final"
        ? rankings(e)
            .results.filter((r) =>
              rules(e).template === "ranked-final"
                ? ballots(e).length > 0
                : r.reviews > 0,
            )
            .slice(0, rules(e).winnerCount)
            .map((r) => ({ ...r, project: publicProject(r.project) }))
        : [],
    sponsors: e.sponsors,
    publication: e.rules.publicResults && p ? cleanPublication(p) : null,
  };
}
export function sampleWorkspace(): { actor: StudioActor; eventId: string } {
  return transaction(() => {
    const id = uid(),
      w: Workspace = {
        id,
        name: "The community lab",
        slug: `preview-${randomBytes(5).toString("hex")}`,
      };
    put("workspace", id, id, w);
    const actor: StudioActor = {
      role: "organizer",
      orgId: id,
      name: "Demo organizer",
      demo: true,
    };
    const e = newEvent(actor, {
      name: "Builders Weekend",
      slug: `builders-weekend-${randomBytes(4).toString("hex")}`,
      description:
        "Small teams. Thoughtful ideas. A weekend to make them real.",
      password: "judges",
      rules: defaultRules,
    });
    const names = [
      [
        "Canopy",
        "Maya & Oliver",
        "A neighborhood map for sharing surplus food.",
        "Community",
        "Photon",
      ],
      [
        "Common Ground",
        "Alex & Priya",
        "Helping neighbors find the projects they can build together.",
        "Community",
        "",
      ],
      [
        "Forma",
        "Sam & Jamie",
        "Turn a rough idea into a working accessible interface.",
        "Design",
        "Photon",
      ],
      [
        "Loop",
        "Ren & Casey",
        "Give everyday objects a second life.",
        "Climate",
        "",
      ],
      [
        "Open Shelf",
        "Jordan & Ari",
        "A community library for tools, skills, and good ideas.",
        "Community",
        "",
      ],
      [
        "Patchwork",
        "Lee & Taylor",
        "A quieter, more personal way to discover local events.",
        "Design",
        "Photon",
      ],
      [
        "Signal",
        "Morgan & Robin",
        "Make city services easier to find and understand.",
        "Community",
        "",
      ],
      [
        "Tandem",
        "Drew & Quinn",
        "A daily companion for building better mobility habits.",
        "Climate",
        "",
      ],
    ];
    importProjects(
      actor,
      e,
      names.map((v, i) => ({
        id: `sample-${i}`,
        name: v[0],
        team: v[1],
        description: v[2],
        track: v[3],
        tools: v[4],
      })),
      true,
    );
    for (const name of ["Jamie Chen", "Alex Rivera", "Morgan Lee"]) {
      const judgeId = uid();
      put("judge", judgeId, e.id, {
        id: judgeId,
        eventId: e.id,
        name,
        key: name.toLowerCase(),
        active: true,
        tracks: [],
        conflicts: [],
      } satisfies Judge);
    }
    e.sponsors = [
      {
        id: uid(),
        name: "Built with Photon",
        sponsor: "Photon",
        logo: "",
        tool: "Photon",
        track: "",
        prize: "Community partner award",
      },
    ];
    save(e);
    newEvent(actor, {
      name: "Community Demo Day",
      slug: `demo-day-${randomBytes(4).toString("hex")}`,
      rules: {
        ...defaultRules,
        template: "single",
        reviews: 1,
        winnerCount: 1,
        finalistCount: 3,
        points: [1],
      },
    });
    const finished = newEvent(actor, {
      name: "Builders Weekend — the archive",
      slug: `builders-archive-${randomBytes(4).toString("hex")}`,
      description:
        "Eight teams. One weekend. A collection of ideas worth celebrating.",
      password: "judges",
      rules: { ...defaultRules, reviews: 1 },
    });
    importProjects(
      actor,
      finished,
      names.map((v, i) => ({
        id: `archive-${i}`,
        name: v[0],
        team: v[1],
        description: v[2],
        track: v[3],
        tools: v[4],
      })),
      true,
    );
    const judgeId = uid();
    put("judge", judgeId, finished.id, {
      id: judgeId,
      eventId: finished.id,
      name: "Sample panel",
      key: "sample panel",
      active: true,
      tracks: [],
      conflicts: [],
    } satisfies Judge);
    finished.frozenRules = structuredClone(finished.rules);
    finished.stage = "judging";
    finished.sponsors = structuredClone(e.sponsors);
    save(finished);
    projects(finished).forEach((p, i) => {
      const review: Review = {
        id: uid(),
        eventId: finished.id,
        projectId: p.id,
        judgeId,
        round: "preliminary",
        scores: Object.fromEntries(
          finished.rules.criteria.map((c) => [c.id, i + 2]),
        ),
        notes: "Sample review for the preview event.",
        submittedAt: now(),
      };
      database()
        .prepare("INSERT INTO studio_reviews VALUES(?,?,?,?,?)")
        .run(finished.id, "preliminary", p.id, judgeId, JSON.stringify(review));
    });
    finished.finalists = rankings(finished)
      .preliminary.slice(0, 7)
      .map((v) => v.project.id);
    finished.stage = "final";
    save(finished);
    put("ballot", `${finished.id}:${judgeId}`, finished.id, {
      judgeId,
      picks: finished.finalists.slice(0, 3),
      submittedAt: now(),
    } satisfies Ballot);
    publish(finished, actor, {}, false);
    finished.stage = "archived";
    save(finished);
    audit(finished, actor, "Sample event archived");
    return { actor, eventId: e.id };
  });
}

type Member = {
  id: string;
  orgId: string;
  name: string;
  password: string;
  active: boolean;
  owner: boolean;
};
export function team(actor: StudioActor) {
  organizer(actor);
  return {
    owner:
      actor.demo === true ||
      get<Member>("user", actor.userId || "")?.owner === true,
    members: list<Member>("user", actor.orgId).map((u) => ({
      id: u.id,
      name: u.name,
      active: u.active !== false,
      owner: u.owner === true,
    })),
  };
}
export function editTeam(actor: StudioActor, input: Record<string, unknown>) {
  if (!team(actor).owner)
    throw new StudioError(
      "Only the workspace owner can manage organizers.",
      403,
    );
  return transaction(() => {
    if (input.id) {
      const u = get<Member>("user", String(input.id));
      if (!u || u.orgId !== actor.orgId)
        throw new StudioError("Organizer not found.", 404);
      if (u.owner) throw new StudioError("Owner access cannot be revoked.");
      u.active = input.active === true;
      put("user", u.id, u.orgId, u);
    } else {
      const name = required(input.name, "Organizer name", 100);
      if (
        list<Member>("user", actor.orgId).some(
          (u) => u.name.toLowerCase() === name.toLowerCase(),
        )
      )
        throw new StudioError("That organizer name is in use.");
      const u: Member = {
        id: uid(),
        orgId: actor.orgId,
        name,
        password: hashPassword(input.password),
        active: true,
        owner: false,
      };
      put("user", u.id, u.orgId, u);
    }
    return team(actor);
  });
}
