import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

// Exported so tests can exercise the operation with an in-memory Airtable mock.
export async function releaseReservations(
  { baseId, table, apiKey, apply = false, env = process.env },
  { fetchImpl = fetch, log = console.log, pause = (ms) => new Promise((done) => setTimeout(done, ms)) } = {},
) {
  if (!baseId || !table || !apiKey) {
    throw new Error("Airtable API key, base ID, and submissions table are required.");
  }
  const fields = {
    status: env.AIRTABLE_STATUS_FIELD || "Status",
    judge: env.AIRTABLE_CLAIMED_BY_FIELD || "Claimed By",
    claimedAt: env.AIRTABLE_CLAIMED_AT_FIELD || "Claimed At",
    token: env.AIRTABLE_CLAIM_TOKEN_FIELD || "Claim Token",
    project: env.AIRTABLE_PROJECT_NAME_FIELD || "Project Name",
  };
  const inProgress = env.AIRTABLE_IN_PROGRESS_VALUE || "in progress";
  const available = env.AIRTABLE_AVAILABLE_VALUE || "available";
  const url = `https://api.airtable.com/v0/${encodeURIComponent(baseId)}/${encodeURIComponent(table)}`;
  async function request(target, init = {}) {
    // Stay below Airtable's per-base request rate, including per-record checks.
    await pause(225);
    const response = await fetchImpl(target, {
      ...init,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    });
    if (!response.ok) {
      // Avoid printing response bodies, which may contain submission data.
      throw new Error(`Airtable request failed (${response.status}).`);
    }
    return response.json();
  }

  log(`${apply ? "RELEASE" : "DRY RUN"}: base ${baseId}, table "${table}"`);
  const active = [];
  let offset;
  do {
    const params = new URLSearchParams({ pageSize: "100" });
    for (const field of Object.values(fields)) params.append("fields[]", field);
    if (offset) params.set("offset", offset);
    const page = await request(`${url}?${params}`);
    if (!Array.isArray(page.records)) throw new Error("Invalid Airtable records response.");
    active.push(...page.records.filter((record) => record.fields[fields.status] === inProgress));
    offset = page.offset;
  } while (offset);

  log(`Found ${active.length} active first-pass reservation(s).`);
  for (const record of active) {
    log(`${record.id}: ${record.fields[fields.project] || "Untitled project"} — ${record.fields[fields.judge] || "Unknown judge"}`);
  }
  if (!apply) {
    log("No changes made. Add --apply to release these reservations.");
    return { found: active.length, released: 0, skipped: 0, failed: 0 };
  }

  let released = 0;
  let skipped = 0;
  let failed = 0;
  for (const record of active) {
    try {
      const recordUrl = `${url}/${encodeURIComponent(record.id)}`;
      const current = await request(recordUrl);
      // Do not release a reservation completed or reassigned since the preview.
      const unchanged = [fields.status, fields.judge, fields.claimedAt, fields.token].every(
        (field) => (current.fields[field] ?? null) === (record.fields[field] ?? null),
      );
      if (!unchanged) {
        skipped += 1;
        log(`Skipped ${record.id}: reservation changed.`);
        continue;
      }
      // Match the admin release operation; never touch scores or review ledgers.
      // Airtable has no conditional PATCH: pause judging during a bulk release
      // to prevent a reservation changing between this check and the write.
      await request(recordUrl, {
        method: "PATCH",
        body: JSON.stringify({ fields: {
          [fields.status]: available,
          [fields.judge]: null,
          [fields.claimedAt]: null,
          [fields.token]: null,
        } }),
      });
      released += 1;
      log(`Released ${record.id}.`);
    } catch (error) {
      failed += 1;
      log(`Failed ${record.id}: ${error.message}`);
    }
  }
  log(`Finished: ${released} released, ${skipped} changed reservations skipped, ${failed} failed.`);
  return { found: active.length, released, skipped, failed };
}

async function main() {
  const { values } = parseArgs({ options: {
    base: { type: "string" },
    table: { type: "string" },
    apply: { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  } });
  if (values.help) {
    console.log(`Usage: node scripts/release-all-judges.mjs [--base=BASE_ID] [--table=SUBMISSIONS_TABLE] [--apply]
Defaults to AIRTABLE_BASE_ID and AIRTABLE_TABLE_NAME from .env.local.
Without --apply, only lists active reservations. Targets one event's submissions table.
Releases reservations only; saved scores, notes, and reviews are preserved.
Pause judging during --apply; unsaved reviews will no longer be submittable.`);
    return;
  }
  try {
    const text = await readFile(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const result = await releaseReservations({
    baseId: values.base || process.env.AIRTABLE_BASE_ID,
    table: values.table || process.env.AIRTABLE_TABLE_NAME,
    apiKey: process.env.AIRTABLE_API_KEY,
    apply: values.apply,
  });
  if (result.failed) process.exitCode = 1;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
