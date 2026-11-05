import { Client } from "pg";
import nextEnv from "@next/env";
const { loadEnvConfig } = nextEnv;
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
if (!process.env.SUPABASE_DB_HOST || !process.env.SUPABASE_PASSWORD)
  throw new Error(
    "Configure the Supabase database host and password before checking the database.",
  );
const client = new Client({
  host: process.env.SUPABASE_DB_HOST,
  port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER || "postgres",
  database: process.env.SUPABASE_DB_NAME || "postgres",
  password: process.env.SUPABASE_PASSWORD,
  ssl: {
    rejectUnauthorized: true,
    ca:
      process.env.SUPABASE_DB_CA_CERT?.replace(/\\n/g, "\n") ||
      readFileSync("supabase/certs/prod-ca-2021.crt", "utf8"),
  },
  connectionTimeoutMillis: 10000,
});
try {
  await client.connect();
  const access = (
    await client.query(
      "SELECT relrowsecurity AS rls, has_table_privilege('anon','public.hackbuddy_events','SELECT') AS anon_read, has_table_privilege('authenticated','public.hackbuddy_events','SELECT') AS authenticated_read FROM pg_class WHERE oid='public.hackbuddy_events'::regclass",
    )
  ).rows[0];
  assert.equal(access.rls, true);
  assert.equal(access.anon_read, false);
  assert.equal(access.authenticated_read, false);
  // The fixture only exists inside this transaction, and is always rolled back.
  await client.query("BEGIN");
  const id = randomUUID();
  await client.query(
    "INSERT INTO public.hackbuddy_events(id,revision,data) VALUES($1,0,$2::jsonb)",
    [id, JSON.stringify({ config: { id, slug: `connection-check-${id}` } })],
  );
  assert.equal(
    (
      await client.query(
        "UPDATE public.hackbuddy_events SET revision=revision+1 WHERE id=$1 AND revision=0",
        [id],
      )
    ).rowCount,
    1,
  );
  assert.equal(
    (
      await client.query(
        "UPDATE public.hackbuddy_events SET revision=revision+1 WHERE id=$1 AND revision=0",
        [id],
      )
    ).rowCount,
    0,
  );
  console.log(
    "Supabase verified: TLS, private table access and atomic revision checks. Test writes rolled back.",
  );
} catch (error) {
  console.error(
    `Database check failed: ${error.code || error.name}. Check the connection settings and migration.`,
  );
  process.exitCode = 1;
} finally {
  await client.query("ROLLBACK").catch(() => {});
  await client.end();
}
