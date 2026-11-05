/* eslint-disable @typescript-eslint/no-require-imports -- CLI reuses the server TypeScript adapters. */
require("./register-test-typescript.cjs");
require("@next/env").loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { Readable, Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const { gunzipSync } = require("node:zlib");
const { AirtableClient } = require("../infrastructure/airtable/client.ts");
const { listAirtableHackathons, readEventScoringRecord } = require("../lib/hackathons.ts");
const { validatePublication } = require("../domain/publication.ts");
const {
  sourceAttachments,
  sourceSubmissions,
  sourceDigest,
  buildImportedEvent,
  verifyImportedEvent,
} = require("../application/airtable-migration.ts");
const {
  checkStorageBucket,
  uploadStoredAsset,
  fetchStoredAsset,
} = require("../infrastructure/database/assets.ts");
const { requireDatabasePool, readEvent } = require("../infrastructure/database/events.ts");
const { persistAirtableImport } = require("../infrastructure/database/airtable-import.ts");
const args = process.argv.slice(2);
const value = (name) => args.find((arg) => arg.startsWith(name + "="))?.slice(name.length + 1);
const directory = path.resolve(value("--directory") || ".data/migrations/night-hack");
const snapshotPath = path.join(directory, "source.json");
const bucket = process.env.R2_BUCKET || "hackbuddy-media";
fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
function save(file, data) {
  const temp = file + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(temp, file);
}
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function capture() {
  const configs = (await listAirtableHackathons()).filter((e) =>
    /night\s*hack|nighthack/i.test(e.name + " " + e.slug),
  );
  const bases = [...new Set(configs.map((e) => e.baseId))];
  const schemas = {};
  for (const base of bases) {
    const response = await fetch(`https://api.airtable.com/v0/meta/bases/${base}/tables`, {
      headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` },
    });
    if (!response.ok) throw new Error(`Airtable schema failed (${response.status}).`);
    schemas[base] = (await response.json()).tables;
  }
  const events = [];
  for (const config of configs) {
    const records = await new AirtableClient(config.baseId, config.tableName).list();
    await delay(250);
    const reviews = await new AirtableClient(config.baseId, config.reviewsTableName).list();
    await delay(250);
    const registry = await new AirtableClient(
      process.env.AIRTABLE_BASE_ID,
      process.env.AIRTABLE_HACKATHONS_TABLE || "Hackathons",
    ).get(config.id);
    const journal = await new AirtableClient(
      process.env.AIRTABLE_BASE_ID,
      process.env.AIRTABLE_PUBLICATIONS_TABLE || "HackBuddy Publications",
    ).list(`{Hackathon ID}='${config.id}'`);
    const scoring = await readEventScoringRecord(config.id);
    let publication = null;
    if (scoring.encodedPublication) {
      if (!scoring.encodedPublication.startsWith("gzip-v1:"))
        throw new Error("Unknown publication encoding.");
      publication = validatePublication(
        JSON.parse(
          gunzipSync(Buffer.from(scoring.encodedPublication.slice(8), "base64"), {
            maxOutputLength: 20000000,
          }).toString("utf8"),
        ),
      );
    }
    const source = {
      config,
      records,
      reviews,
      registry,
      journal,
      publication,
      relatedTables: [],
      schema: schemas[config.baseId].filter((t) =>
        [
          config.tableName,
          config.reviewsTableName,
          process.env.AIRTABLE_HACKATHONS_TABLE || "Hackathons",
          process.env.AIRTABLE_PUBLICATIONS_TABLE || "HackBuddy Publications",
        ].includes(t.name),
      ),
      capturedAt: new Date().toISOString(),
    };
    sourceSubmissions(source);
    events.push(source);
    console.log(
      `${config.name}: captured ${records.length} submissions and ${reviews.length} review records; publication ${publication ? "preserved" : "absent"}.`,
    );
  }
  const otherTables = [];
  for (const [base, tables] of Object.entries(schemas))
    for (const table of tables.filter(
      (t) =>
        /night\s*hack/i.test(t.name) &&
        !configs.some(
          (c) => c.baseId === base && [c.tableName, c.reviewsTableName].includes(t.name),
        ),
    )) {
      const records = await new AirtableClient(base, table.name).list();
      otherTables.push({ baseId: base, id: table.id, name: table.name, schema: table, records });
      console.log(`Source archive includes ${table.name}: ${records.length} records.`);
    }
  const snapshot = { version: 1, capturedAt: new Date().toISOString(), events, otherTables };
  if (fs.existsSync(snapshotPath))
    fs.copyFileSync(snapshotPath, path.join(directory, `source-before-${Date.now()}.json`));
  save(snapshotPath, snapshot);
  return snapshot;
}
function summary(snapshot) {
  for (const source of snapshot.events) {
    const files = sourceAttachments(source);
    console.log(
      JSON.stringify({
        slug: source.config.slug,
        submissions: source.records.length,
        reviews: source.reviews.length,
        files: files.length,
        bytes: files.reduce((sum, f) => sum + f.size, 0),
        publication: !!source.publication,
        digest: sourceDigest(source),
      }),
    );
  }
}
async function download(file) {
  const destination = path.join(directory, "files", file.assetId);
  if (fs.existsSync(destination) && fs.statSync(destination).size === file.size) {
    const sha = crypto.createHash("sha256"),
      md5 = crypto.createHash("md5");
    for await (const chunk of fs.createReadStream(destination)) {
      sha.update(chunk);
      md5.update(chunk);
    }
    return { destination, sha256: sha.digest("hex"), md5: md5.digest("hex") };
  }
  const u = new URL(file.sourceUrl);
  if (
    u.protocol !== "https:" ||
    !(u.hostname.endsWith(".airtableusercontent.com") || u.hostname === "dl.airtable.com")
  )
    throw new Error("Unexpected attachment download host.");
  const response = await fetch(file.sourceUrl, { signal: AbortSignal.timeout(180000) });
  if (!response.ok)
    throw new Error(
      `Airtable attachment download failed (${response.status}). Refresh the snapshot if its URLs expired.`,
    );
  const sha = crypto.createHash("sha256"),
    md5 = crypto.createHash("md5");
  let size = 0;
  const meter = new Transform({
    transform(chunk, _encoding, done) {
      size += chunk.length;
      sha.update(chunk);
      md5.update(chunk);
      done(null, chunk);
    },
  });
  await pipeline(
    Readable.fromWeb(response.body),
    meter,
    fs.createWriteStream(destination + ".part", { mode: 0o600 }),
  );
  if (size !== file.size) throw new Error("Attachment length does not match the source metadata.");
  fs.renameSync(destination + ".part", destination);
  return { destination, sha256: sha.digest("hex"), md5: md5.digest("hex") };
}
async function verifyRemote(file, local) {
  const response = await fetchStoredAsset({ bucket, path: file.path }, null, true);
  if (response.status === 404 || response.status === 400) return false;
  if (!response.ok) throw new Error(`Storage verification failed (${response.status}).`);
  if (Number(response.headers.get("content-length")) !== file.size)
    throw new Error("Stored attachment size mismatch.");
  const etag = response.headers.get("etag")?.replaceAll('"', "");
  if (etag === local.md5) return true;
  const downloaded = await fetchStoredAsset({ bucket, path: file.path });
  if (!downloaded.ok) throw new Error("Stored attachment checksum download failed.");
  const sha = crypto.createHash("sha256");
  let bytes = 0;
  for await (const chunk of Readable.fromWeb(downloaded.body)) {
    sha.update(chunk);
    bytes += chunk.length;
  }
  if (bytes !== file.size || sha.digest("hex") !== local.sha256)
    throw new Error("Stored attachment checksum mismatch.");
  return true;
}
async function copyFile(file, source, manifest) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const local = await download(file);
      if (!(await verifyRemote(file, local))) {
        await uploadStoredAsset(
          { bucket, path: file.path, contentType: file.contentType },
          fs.readFileSync(local.destination),
          Buffer.from(local.md5, "hex").toString("base64"),
        );
        if (!(await verifyRemote(file, local)))
          throw new Error("Uploaded attachment could not be verified.");
      }
      const asset = {
        id: file.assetId,
        eventId: source.config.id,
        submissionId: file.recordId,
        sourceField: file.field,
        storageProvider: "r2",
        bucket,
        path: file.path,
        filename: file.filename,
        contentType: file.contentType,
        size: file.size,
        sha256: local.sha256,
        sourceAttachmentId: file.id,
      };
      manifest[file.assetId] = asset;
      save(path.join(directory, "r2-files.json"), manifest);
      return asset;
    } catch (error) {
      lastError = error;
      if (attempt < 2) await delay(1000 * (attempt + 1));
    }
  }
  throw lastError;
}
async function apply(snapshot) {
  const requested = (value("--events") || "nighthack3,nighthack4").split(",");
  const events = snapshot.events.filter((source) => requested.includes(source.config.slug));
  if (events.length !== requested.length)
    throw new Error("An explicitly requested event was not found in the snapshot.");
  const pool = requireDatabasePool();
  await pool.query(
    fs.readFileSync(
      path.join(process.cwd(), "supabase/migrations/202611040002_airtable_import.sql"),
      "utf8",
    ),
  );
  await pool.query(
    fs.readFileSync(
      path.join(process.cwd(), "supabase/migrations/202611050001_r2_assets.sql"),
      "utf8",
    ),
  );
  await checkStorageBucket(bucket);
  fs.mkdirSync(path.join(directory, "files"), { recursive: true, mode: 0o700 });
  const manifestPath = path.join(directory, "r2-files.json");
  const manifest = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
    : {};
  for (const source of events) {
    const existing = await readEvent(source.config.id);
    if (existing) {
      verifyImportedEvent(source, existing.data);
      console.log(`${source.config.name}: existing verified import retained.`);
      continue;
    }
    const attachments = sourceAttachments(source);
    const assets = [];
    let done = 0;
    let cursor = 0;
    console.log(`${source.config.name}: copying and verifying ${attachments.length} files.`);
    await Promise.all(
      Array.from({ length: 2 }, async () => {
        while (cursor < attachments.length) {
          const file = attachments[cursor++];
          assets.push(await copyFile(file, source, manifest));
          done++;
          if (done % 10 === 0 || done === attachments.length)
            console.log(`${source.config.name}: ${done}/${attachments.length} files verified.`);
        }
      }),
    );
    const target = buildImportedEvent(source, assets);
    const result = verifyImportedEvent(source, target);
    // Read source rows again before cutover. Expiring attachment URLs are excluded
    // from the digest, but any actual record/review change stops activation.
    const freshRecords = await new AirtableClient(
      source.config.baseId,
      source.config.tableName,
    ).list();
    const freshReviews = await new AirtableClient(
      source.config.baseId,
      source.config.reviewsTableName,
    ).list();
    if (
      sourceDigest({ ...source, records: freshRecords, reviews: freshReviews }) !==
      sourceDigest(source)
    )
      throw new Error(
        "Airtable changed during migration. Capture a fresh snapshot before activating the event.",
      );
    const status = await persistAirtableImport(source, target, assets);
    console.log(`${source.config.name}: ${status}. ${JSON.stringify(result)}`);
  }
}
(async () => {
  if (
    !args.some((arg) =>
      ["--snapshot", "--apply", "--verify", "--download", "--archive"].includes(arg),
    )
  ) {
    console.log(
      "Usage: node scripts/migrate-airtable.cjs --snapshot | --apply | --verify [--directory=PATH] [--events=nighthack3,nighthack4]",
    );
    return;
  }
  const snapshot = args.includes("--snapshot")
    ? await capture()
    : JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
  summary(snapshot);
  if (args.includes("--archive")) {
    const selected = (value("--events") || "nighthack3,nighthack4").split(",");
    const pool = requireDatabasePool();
    await pool.query(
      fs.readFileSync(
        path.join(process.cwd(), "supabase/migrations/202611040002_airtable_import.sql"),
        "utf8",
      ),
    );
    for (const source of snapshot.events.filter((e) => selected.includes(e.config.slug))) {
      const digest = sourceDigest(source),
        id = `${source.config.id}:${digest}`;
      await pool.query(
        "INSERT INTO public.hackbuddy_airtable_archives(id,event_id,source_digest,captured_at,data) VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT(id) DO NOTHING",
        [id, source.config.id, digest, source.capturedAt, JSON.stringify(source)],
      );
      const saved = (
        await pool.query("SELECT data FROM public.hackbuddy_airtable_archives WHERE id=$1", [id])
      ).rows[0];
      if (!saved || sourceDigest(saved.data) !== digest)
        throw new Error("Database archive failed verification.");
      console.log(`${source.config.name}: immutable database source archive verified.`);
    }
  }
  if (args.includes("--download")) {
    fs.mkdirSync(path.join(directory, "files"), { recursive: true, mode: 0o700 });
    const selected = (value("--events") || "nighthack3,nighthack4").split(",");
    for (const source of snapshot.events.filter((e) => selected.includes(e.config.slug))) {
      const files = sourceAttachments(source);
      let cursor = 0,
        done = 0;
      await Promise.all(
        Array.from({ length: 3 }, async () => {
          while (cursor < files.length) {
            await download(files[cursor++]);
            done++;
            if (done % 10 === 0 || done === files.length)
              console.log(
                `${source.config.name}: ${done}/${files.length} source files downloaded and checked.`,
              );
          }
        }),
      );
    }
  }
  if (args.includes("--apply")) await apply(snapshot);
  if (args.includes("--verify"))
    for (const source of snapshot.events.filter((e) =>
      (value("--events") || "nighthack3,nighthack4").split(",").includes(e.config.slug),
    )) {
      const stored = await readEvent(source.config.id);
      if (!stored) throw new Error("An imported event is missing.");
      console.log(
        `${source.config.name}: verified ${JSON.stringify(verifyImportedEvent(source, stored.data))}`,
      );
    }
})().catch((error) => {
  console.error(`Migration stopped: ${error.message}`);
  process.exitCode = 1;
});
