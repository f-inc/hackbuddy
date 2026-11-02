import { NextRequest, NextResponse } from "next/server";
import {
  action,
  createEvent,
  editTeam,
  team,
  eventView,
  join,
  listEvents,
  login,
  organizer,
  publicInfo,
  publicShowcase,
  sampleWorkspace,
  signup,
  StudioError,
  workspace,
} from "@/application/studio/service";
import { clearSession, session, setSession } from "@/lib/studio/session";
import {
  csvHeaders,
  object,
  required,
  text,
  toCsv,
} from "@/domain/studio/model";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path?: string[] }> };
const json = (value: unknown, status = 200) =>
  NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
function failure(error: unknown) {
  const e = error instanceof Error ? error : new Error("Request failed.");
  console.error("[studio]", e.message);
  const databaseError = /SQLITE|UNIQUE constraint|database is locked/i.test(
    e.message,
  );
  return json(
    {
      error: databaseError
        ? "The event changed while you were working. Refresh and try again."
        : e.message,
    },
    error instanceof StudioError ? error.status : 400,
  );
}
async function actor(req: NextRequest) {
  const a = await session(req.nextUrl.searchParams.get("as") === "judge");
  if (!a) throw new StudioError("Sign in to continue.", 401);
  workspace(a);
  return a;
}
export async function GET(req: NextRequest, context: Context) {
  try {
    const { path = [] } = await context.params;
    if (path[0] === "info" && path[1]) return json(publicInfo(path[1]));
    if (path[0] === "public" && path[1]) return json(publicShowcase(path[1]));
    const a = await actor(req);
    if (path[0] === "team") return json(team(a));
    if (path[0] === "session")
      return json({ actor: a, workspace: workspace(a) });
    if (path[0] === "events" && !path[1])
      return json({ events: listEvents(a), actor: a, workspace: workspace(a) });
    if (path[0] === "events" && path[1]) {
      const view = eventView(a, path[1]);
      if (path[2] === "export") {
        organizer(a);
        const kind = req.nextUrl.searchParams.get("kind") || "projects";
        let rows: Record<string, unknown>[], headers: string[];
        if (kind === "projects") {
          headers = csvHeaders;
          rows = view.projects.map((p) => ({ ...p, id: p.externalId || p.id }));
        } else if (kind === "reviews") {
          headers = [
            "project",
            "judge",
            "round",
            ...view.event.rules.criteria.map((c) => c.id),
            "notes",
            "submittedAt",
          ];
          rows = view.reviews.map((r) => ({
            project: view.projects.find((p) => p.id === r.projectId)?.name,
            judge: view.judges.find((j) => j.id === r.judgeId)?.name,
            round: r.round,
            ...r.scores,
            notes: r.notes,
            submittedAt: r.submittedAt,
          }));
        } else if (kind === "results") {
          headers = [
            "project",
            "team",
            "score",
            "rawScore",
            "reviews",
            "tied",
            "officialPlace",
            "publicationRevision",
          ];
          rows = view.results.map((r) => ({
            officialPlace: view.publication?.winners.some(
              (w) => w.project.id === r.project.id,
            )
              ? view.publication.winners.findIndex(
                  (w) => w.project.id === r.project.id,
                ) + 1
              : "",
            publicationRevision: view.publication?.revision || "",
            project: r.project.name,
            team: r.project.team,
            score: r.score,
            rawScore: r.rawScore,
            reviews: r.reviews,
            tied: r.tied,
          }));
        } else if (kind === "audit") {
          headers = ["action", "actor", "at", "detail"];
          rows = view.audit;
        } else throw new StudioError("Unknown export.");
        return new NextResponse(toCsv(rows, headers), {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="${view.event.slug}-${kind}.csv"`,
            "Cache-Control": "no-store",
          },
        });
      }
      return json(view);
    }
    throw new StudioError("Not found.", 404);
  } catch (error) {
    return failure(error);
  }
}
export async function POST(req: NextRequest, context: Context) {
  try {
    const origin = req.headers.get("origin");
    if (origin && new URL(origin).host !== req.headers.get("host"))
      throw new StudioError("Request origin is not allowed.", 403);
    if (Number(req.headers.get("content-length")) > 6_000_000)
      throw new StudioError("Request is too large.", 413);
    const raw = await req.text();
    if (raw.length > 6_000_000)
      throw new StudioError("Request is too large.", 413);
    const input = object(JSON.parse(raw || "{}"));
    const { path = [] } = await context.params;
    if (path[0] === "session") {
      if (input.action === "logout") {
        await clearSession(input.judge === true);
        return json({ ok: true });
      }
      if (input.action === "demo") {
        const demo = sampleWorkspace();
        await setSession(demo.actor);
        return json({ ...demo, workspace: workspace(demo.actor) });
      }
      if (input.action !== "signup" && input.action !== "login")
        throw new StudioError("Choose sign in or create workspace.");
      const a = input.action === "signup" ? signup(input) : login(input);
      await setSession(a);
      return json({ actor: a, workspace: workspace(a) });
    }
    if (path[0] === "join" && path[1]) {
      const a = join(path[1], input);
      await setSession(a);
      return json({ actor: a });
    }
    const a = await actor(req);
    if (path[0] === "team") return json(editTeam(a, input));
    if (path[0] === "events" && !path[1]) return json(createEvent(a, input));
    if (path[0] === "events" && path[1]) {
      if (path[2] === "airtable") {
        organizer(a);
        eventView(a, path[1]);
        const rows = await airtable(input);
        return json(action(a, path[1], { action: "preview-import", rows }));
      }
      return json(action(a, path[1], input));
    }
    throw new StudioError("Not found.", 404);
  } catch (error) {
    return failure(error);
  }
}
async function airtable(input: Record<string, unknown>) {
  const base = required(input.base, "Airtable base ID", 100);
  if (!/^app[a-zA-Z0-9]+$/.test(base))
    throw new StudioError("Use an Airtable base ID starting with app.");
  const table = required(input.table, "Table name", 200),
    token = required(input.token, "Read-only Airtable token", 500);
  const mapping = object(input.mapping);
  const rows: Record<string, string>[] = [];
  let offset = "";
  do {
    const endpoint = new URL(
      `https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}`,
    );
    endpoint.searchParams.set("pageSize", "100");
    if (offset) endpoint.searchParams.set("offset", offset);
    const res = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20000),
      cache: "no-store",
    });
    if (!res.ok)
      throw new StudioError(
        `Airtable returned ${res.status}. Check token access, base, and table.`,
      );
    const body = await res.json();
    if (!Array.isArray(body.records))
      throw new StudioError("Invalid Airtable response.");
    for (const rec of body.records) {
      const row: Record<string, string> = { id: rec.id };
      for (const h of csvHeaders.filter((h) => h !== "id")) {
        const value = rec.fields[String(mapping[h] || h)];
        row[h] = Array.isArray(value)
          ? value
              .map((v) =>
                typeof v === "object" ? v.url || v.name || "" : String(v),
              )
              .join(", ")
          : String(value ?? "");
      }
      rows.push(row);
    }
    offset = text(body.offset);
    if (rows.length > 5000)
      throw new StudioError("Import at most 5,000 Airtable records at a time.");
  } while (offset);
  return rows;
}
