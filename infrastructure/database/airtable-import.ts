import { requireDatabasePool, type EventRecord } from "./events";
import type { SourceEvent } from "@/application/airtable-migration";
import { sourceDigest, verifyImportedEvent } from "@/application/airtable-migration";
import type { ImportedAsset } from "./assets";
export async function persistAirtableImport(
  source: SourceEvent,
  event: EventRecord,
  assets: ImportedAsset[],
) {
  verifyImportedEvent(source, event);
  const pool = requireDatabasePool(),
    client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [source.config.id]);
    const existing = (
      await client.query("SELECT data FROM public.hackbuddy_events WHERE id=$1 FOR UPDATE", [
        event.config.id,
      ])
    ).rows[0];
    if (existing) {
      if (existing.data.migration?.sourceDigest === sourceDigest(source)) {
        verifyImportedEvent(source, existing.data);
        await client.query("ROLLBACK");
        return "already-imported";
      }
      throw new Error("The destination event already exists. Refusing to overwrite it.");
    }
    await client.query(
      "INSERT INTO public.hackbuddy_airtable_archives(id,event_id,source_digest,captured_at,data) VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT(id) DO NOTHING",
      [
        event.migration!.archiveId,
        event.config.id,
        event.migration!.sourceDigest,
        source.capturedAt,
        JSON.stringify(source),
      ],
    );
    const archived = (
      await client.query("SELECT data FROM public.hackbuddy_airtable_archives WHERE id=$1", [
        event.migration!.archiveId,
      ])
    ).rows[0];
    if (!archived || sourceDigest(archived.data) !== sourceDigest(source))
      throw new Error("Source archive verification failed.");
    for (const asset of assets)
      await client.query(
        "INSERT INTO public.hackbuddy_assets(id,event_id,bucket,object_path,filename,content_type,size_bytes,sha256,source_attachment_id,storage_provider,submission_id,source_field) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
        [
          asset.id,
          event.config.id,
          asset.bucket,
          asset.path,
          asset.filename,
          asset.contentType,
          asset.size,
          asset.sha256,
          asset.sourceAttachmentId,
          "r2",
          asset.submissionId,
          asset.sourceField,
        ],
      );
    await client.query(
      "INSERT INTO public.hackbuddy_events(id,revision,data) VALUES($1,0,$2::jsonb)",
      [event.config.id, JSON.stringify(event)],
    );
    const stored = (
      await client.query("SELECT data FROM public.hackbuddy_events WHERE id=$1", [event.config.id])
    ).rows[0].data;
    verifyImportedEvent(source, stored);
    await client.query("COMMIT");
    return "imported";
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
