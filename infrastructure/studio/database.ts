import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const globalDb = globalThis as typeof globalThis & {
  studioDb?: DatabaseSync;
  studioDbPath?: string;
};
export function database() {
  const path =
    process.env.HACKBUDDY_STUDIO_DB ||
    join(process.cwd(), ".data", "studio.sqlite");
  if (globalDb.studioDb && globalDb.studioDbPath === path)
    return globalDb.studioDb;
  if (process.env.VERCEL && !process.env.HACKBUDDY_STUDIO_DB)
    throw new Error(
      "Event studio needs persistent storage. Run locally or configure HACKBUDDY_STUDIO_DB on a server with a durable volume.",
    );
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS studio_records (kind TEXT NOT NULL, id TEXT NOT NULL, scope TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(kind,id));
    CREATE INDEX IF NOT EXISTS studio_scope ON studio_records(kind,scope);
    CREATE TABLE IF NOT EXISTS studio_reservations (event_id TEXT NOT NULL, round TEXT NOT NULL, project_id TEXT NOT NULL, judge_id TEXT NOT NULL, expires_at TEXT NOT NULL, PRIMARY KEY(event_id,round,project_id), UNIQUE(event_id,round,judge_id));
    CREATE TABLE IF NOT EXISTS studio_reviews (event_id TEXT NOT NULL, round TEXT NOT NULL, project_id TEXT NOT NULL, judge_id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(event_id,round,project_id,judge_id));
    CREATE TABLE IF NOT EXISTS studio_auth_attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL);
    PRAGMA user_version=1;`);
  globalDb.studioDb = db;
  globalDb.studioDbPath = path;
  return db;
}
export function list<T>(kind: string, scope?: string): T[] {
  const db = database();
  const rows =
    scope === undefined
      ? db
          .prepare(
            "SELECT data FROM studio_records WHERE kind=? ORDER BY rowid",
          )
          .all(kind)
      : db
          .prepare(
            "SELECT data FROM studio_records WHERE kind=? AND scope=? ORDER BY rowid",
          )
          .all(kind, scope);
  return rows.map((r) => JSON.parse(String(r.data)));
}
export function get<T>(kind: string, id: string): T | undefined {
  const r = database()
    .prepare("SELECT data FROM studio_records WHERE kind=? AND id=?")
    .get(kind, id);
  return r ? JSON.parse(String(r.data)) : undefined;
}
export function put(kind: string, id: string, scope: string, value: unknown) {
  database()
    .prepare(
      "INSERT INTO studio_records(kind,id,scope,data) VALUES(?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET scope=excluded.scope,data=excluded.data",
    )
    .run(kind, id, scope, JSON.stringify(value));
}
export function remove(kind: string, id: string) {
  database()
    .prepare("DELETE FROM studio_records WHERE kind=? AND id=?")
    .run(kind, id);
}
export function transaction<T>(operation: () => T): T {
  const db = database();
  db.exec("BEGIN IMMEDIATE");
  try {
    const value = operation();
    db.exec("COMMIT");
    return value;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
export function throttle(key: string) {
  const db = database();
  const now = Date.now();
  const old = db
    .prepare("SELECT count,reset_at FROM studio_auth_attempts WHERE key=?")
    .get(key);
  if (old && Number(old.reset_at) > now && Number(old.count) >= 15)
    throw new Error("Too many sign-in attempts. Try again in 15 minutes.");
  db.prepare(
    "INSERT INTO studio_auth_attempts(key,count,reset_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN reset_at < ? THEN 1 ELSE count+1 END,reset_at=CASE WHEN reset_at < ? THEN excluded.reset_at ELSE reset_at END",
  ).run(key, now + 900000, now, now);
}
