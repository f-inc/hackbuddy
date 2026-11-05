import { Pool } from "pg";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { HackathonConfig } from "@/lib/hackathons";
import type { Submission, ReviewScores } from "@/domain/submission";
import type { PublishedResults } from "@/domain/publication";
import { ConfigurationError, ConflictError, NotFoundError } from "@/server/http/errors";
export type SavedDraft = { scores: Partial<ReviewScores>; updatedAt: string };
export type EventRecord = {
  config: HackathonConfig;
  submissions: Submission[];
  publication: PublishedResults | null;
  drafts: Record<string, SavedDraft>;
  migration?: { archiveId: string; sourceDigest: string; importedAt: string };
};
type Row = { id: string; revision: number; data: EventRecord };
const globalDb = globalThis as typeof globalThis & {
  hackbuddyEventsDb?: DatabaseSync;
  hackbuddyEventsDbPath?: string;
};
const postgresGlobal = globalThis as typeof globalThis & {
  hackbuddyPool?: Pool;
  hackbuddyPoolKey?: string;
};
function hosted() {
  const host = process.env.SUPABASE_DB_HOST;
  if (!host && process.env.NODE_ENV === "production")
    throw new ConfigurationError("Configure Supabase before running HackBuddy in production.");
  if (!host) return null;
  const password = process.env.SUPABASE_PASSWORD;
  if (!password)
    throw new ConfigurationError(
      "Configure SUPABASE_PASSWORD for the Supabase database connection.",
    );
  const user = process.env.SUPABASE_DB_USER || "postgres",
    port = Number(process.env.SUPABASE_DB_PORT || 5432),
    database = process.env.SUPABASE_DB_NAME || "postgres";
  const key = `${host}:${port}:${user}:${database}`;
  if (!postgresGlobal.hackbuddyPool || postgresGlobal.hackbuddyPoolKey !== key) {
    postgresGlobal.hackbuddyPool = new Pool({
      host,
      port,
      database,
      user,
      password,
      ssl: {
        rejectUnauthorized: true,
        ca:
          process.env.SUPABASE_DB_CA_CERT?.replace(/\\n/g, "\n") ||
          readFileSync(join(process.cwd(), "supabase/certs/prod-ca-2021.crt"), "utf8"),
      },
      max: process.env.VERCEL ? 1 : 5,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 10000,
      allowExitOnIdle: true,
    });
    postgresGlobal.hackbuddyPool.on("error", () =>
      console.error("A Supabase database connection closed. The next request will reconnect."),
    );
    postgresGlobal.hackbuddyPoolKey = key;
  }
  return postgresGlobal.hackbuddyPool;
}

function local() {
  const path = process.env.HACKBUDDY_DB || join(process.cwd(), ".data", "hackbuddy.sqlite");
  if (globalDb.hackbuddyEventsDb && globalDb.hackbuddyEventsDbPath === path)
    return globalDb.hackbuddyEventsDb;
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(
    "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS hackbuddy_events (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, data TEXT NOT NULL); CREATE UNIQUE INDEX IF NOT EXISTS hackbuddy_event_slug ON hackbuddy_events(json_extract(data,'$.config.slug'));",
  );
  globalDb.hackbuddyEventsDb = db;
  globalDb.hackbuddyEventsDbPath = path;
  return db;
}
export async function managedEvents(): Promise<HackathonConfig[]> {
  const pool = hosted();
  if (pool)
    return (
      await pool.query<{ config: HackathonConfig }>(
        "SELECT data->'config' AS config FROM public.hackbuddy_events ORDER BY data->'config'->>'name' ",
      )
    ).rows.map((row) => row.config);
  return local()
    .prepare("SELECT data FROM hackbuddy_events")
    .all()
    .map((row) => (JSON.parse(String(row.data)) as EventRecord).config);
}
export async function readEvent(id: string): Promise<Row | null> {
  const pool = hosted();
  if (pool) {
    const row = (
      await pool.query<Row>("SELECT id, revision, data FROM public.hackbuddy_events WHERE id=$1", [
        id,
      ])
    ).rows[0];
    return row ? { ...row, revision: Number(row.revision) } : null;
  }
  const row = local().prepare("SELECT * FROM hackbuddy_events WHERE id=?").get(id);
  return row ? { id, revision: Number(row.revision), data: JSON.parse(String(row.data)) } : null;
}
export async function insertEvent(data: EventRecord) {
  try {
    const pool = hosted();
    if (pool)
      await pool.query(
        "INSERT INTO public.hackbuddy_events(id,revision,data) VALUES($1,0,$2::jsonb)",
        [data.config.id, JSON.stringify(data)],
      );
    else
      local()
        .prepare("INSERT INTO hackbuddy_events VALUES(?,0,?)")
        .run(data.config.id, JSON.stringify(data));
  } catch (error) {
    if (String(error).includes("UNIQUE") || (error as { code?: string }).code === "23505")
      throw new ConflictError("That event URL already exists.");
    throw error;
  }
}
// Each mutation is an optimistic transaction. Retrying the pure callback preserves
// concurrent claims, drafts and reviews without overwriting another judge's work.
export async function changeEvent<T>(
  id: string,
  change: (event: EventRecord, revision: number) => T,
): Promise<T> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const row = await readEvent(id);
    if (!row) throw new NotFoundError("Hackathon not found.");
    const result = change(row.data, row.revision);
    const pool = hosted();
    const updated = pool
      ? (
          await pool.query(
            "UPDATE public.hackbuddy_events SET data=$1::jsonb, revision=revision+1 WHERE id=$2 AND revision=$3",
            [JSON.stringify(row.data), id, row.revision],
          )
        ).rowCount === 1
      : Number(
          local()
            .prepare(
              "UPDATE hackbuddy_events SET data=?, revision=revision+1 WHERE id=? AND revision=?",
            )
            .run(JSON.stringify(row.data), id, row.revision).changes,
        ) === 1;
    if (updated) return result;
  }
  throw new ConflictError("The event is busy. Your work is saved on this device; please retry.");
}

export function requireDatabasePool() {
  const pool = hosted();
  if (!pool)
    throw new ConfigurationError("This operation requires the configured Supabase database.");
  return pool;
}
