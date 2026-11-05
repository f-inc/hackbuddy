import { createHash } from "node:crypto";
import type { HackathonConfig } from "@/lib/hackathons";
import type { AirtableRecord } from "@/infrastructure/airtable/client";
import { mapAirtableSubmission } from "@/infrastructure/airtable/submission-repository";
import { parseStoredReview } from "@/infrastructure/airtable/review-repository";
import { submissionField } from "@/infrastructure/airtable/field-config";
import type { EventRecord } from "@/infrastructure/database/events";
import type { PublishedResults } from "@/domain/publication";
import { validatePublication } from "@/domain/publication";
import type { Submission } from "@/domain/submission";
import { eventSettings } from "@/domain/event-settings";
import type { ImportedAsset } from "@/infrastructure/database/assets";
export type SourceEvent = {
  config: HackathonConfig;
  records: AirtableRecord[];
  reviews: AirtableRecord[];
  publication: PublishedResults | null;
  registry: AirtableRecord | null;
  journal: AirtableRecord[];
  relatedTables: { name: string; records: AirtableRecord[] }[];
  schema: unknown;
  capturedAt: string;
};
export type SourceAttachment = {
  id: string;
  recordId: string;
  field: string;
  filename: string;
  contentType: string;
  size: number;
  sourceUrl: string;
  assetId: string;
  path: string;
  url: string;
};
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    const attachment = typeof object.id === "string" && object.id.startsWith("att");
    return Object.fromEntries(
      Object.keys(object)
        .sort()
        .filter((key) => key !== "thumbnails" && !(attachment && key === "url"))
        .map((key) => [key, stable(object[key])]),
    );
  }
  return value;
}
export function sourceDigest(source: SourceEvent) {
  const { capturedAt: _capturedAt, ...data } = source;
  void _capturedAt;
  return createHash("sha256")
    .update(JSON.stringify(stable(data)))
    .digest("hex");
}
export function sourceAttachments(source: SourceEvent): SourceAttachment[] {
  const output: SourceAttachment[] = [];
  for (const record of [...source.records, ...source.relatedTables.flatMap((t) => t.records)])
    for (const [field, value] of Object.entries(record.fields))
      if (Array.isArray(value))
        for (const item of value) {
          if (
            !item ||
            typeof item !== "object" ||
            typeof item.id !== "string" ||
            !item.id.startsWith("att") ||
            typeof item.url !== "string" ||
            typeof item.filename !== "string"
          )
            continue;
          const assetId = createHash("sha256")
            .update(`${source.config.id}:${record.id}:${field}:${item.id}`)
            .digest("hex")
            .slice(0, 40);
          const filename = item.filename.replace(/[\/\\\u0000-\u001f]/g, "_");
          output.push({
            id: item.id,
            recordId: record.id,
            field,
            filename,
            contentType: typeof item.type === "string" ? item.type : "application/octet-stream",
            size: Number(item.size) || 0,
            sourceUrl: item.url,
            assetId,
            path: `${source.config.id}/${assetId}/${filename}`,
            url: `/api/hackathons/${source.config.slug}/assets/${assetId}`,
          });
        }
  return output;
}
// Earlier forms used different labels. Keep their raw fields as well as mapping
// equivalent project/contact/media fields; never manufacture modern scorecards.
function canonicalRecord(record: AirtableRecord): AirtableRecord {
  const fields = { ...record.fields };
  const find = (...names: string[]) => {
    for (const name of names) {
      const key = Object.keys(fields).find((k) => k.toLowerCase() === name.toLowerCase());
      if (key !== undefined) return fields[key];
    }
    return undefined;
  };
  for (const [target, names] of [
    [submissionField.teamName, ["Team Name"]],
    [submissionField.submitters, ["Name(s)"]],
    [submissionField.email, ["Email"]],
    [submissionField.attendance, ["Attending In Person", "Will u be here irl to demo"]],
    [submissionField.submittedAt, ["Submitted At", "submitted at"]],
    [submissionField.preview, ["Progress Preview", "Pic that shows your progress"]],
    [submissionField.teamPhoto, ["Team Photo"]],
    [submissionField.demoUrl, ["Demo", "demo"]],
    [submissionField.repositoryUrl, ["Repository URL", "Github"]],
  ] as [string, string[]][]) {
    if (fields[target] === undefined) {
      const value = find(...names);
      if (value !== undefined) fields[target] = value;
    }
  }
  return { ...record, fields };
}
export function sourceSubmissions(source: SourceEvent): Submission[] {
  const ids = new Set(source.records.map((r) => r.id));
  if (ids.size !== source.records.length) throw new Error("Duplicate source submission IDs.");
  const reviews = source.reviews.map(parseStoredReview);
  for (const review of reviews)
    if (!ids.has(review.submissionId))
      throw new Error("A review points to a missing submission. Import stopped.");
  return source.records.map((record) =>
    mapAirtableSubmission(
      canonicalRecord(record),
      reviews.filter((review) => review.submissionId === record.id),
    ),
  );
}
function rewrite(value: unknown, urls: Map<string, string>): unknown {
  if (typeof value === "string") return urls.get(value) || value;
  if (Array.isArray(value)) return value.map((item) => rewrite(item, urls));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, rewrite(item, urls)]),
    );
  return value;
}
export function buildImportedEvent(source: SourceEvent, assets: ImportedAsset[]): EventRecord {
  const attachments = sourceAttachments(source);
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  for (const attachment of attachments) {
    const asset = byId.get(attachment.assetId);
    if (
      !asset ||
      asset.eventId !== source.config.id ||
      asset.path !== attachment.path ||
      (asset.submissionId !== undefined && asset.submissionId !== attachment.recordId) ||
      (asset.sourceField !== undefined && asset.sourceField !== attachment.field) ||
      asset.size !== attachment.size ||
      !asset.sha256 ||
      asset.sourceAttachmentId !== attachment.id
    )
      throw new Error(
        "Every source attachment must be copied and verified before event activation.",
      );
  }
  const urls = new Map(attachments.map((a) => [a.sourceUrl, a.url]));
  const raw = new Map(source.records.map((record) => [record.id, record]));
  const submissions = sourceSubmissions(source).map((submission) => {
    const original = raw.get(submission.id)!;
    return {
      ...(rewrite(submission, urls) as Submission),
      reviews: submission.reviews,
      finalJudging: submission.finalJudging,
      liveDemoUrl:
        typeof original.fields["Demo Link Url"] === "string"
          ? original.fields["Demo Link Url"]
          : "",
      importedFields: rewrite(original.fields, urls) as Record<string, unknown>,
      files: attachments
        .filter((a) => a.recordId === submission.id)
        .map((a) => ({
          id: a.assetId,
          field: a.field,
          filename: a.filename,
          contentType: a.contentType,
          size: a.size,
          url: a.url,
        })),
    };
  });
  const publication = source.publication ? structuredClone(source.publication) : null;
  if (publication) {
    const byId = new Map(submissions.map((s) => [s.id, s]));
    for (const entry of [
      ...publication.results,
      ...publication.finals.finalists,
      ...publication.finals.topThree,
      ...(publication.finals.standings || []),
    ]) {
      const project = byId.get(entry.id);
      if (project?.teamPhotoUrl) entry.teamPhotoUrl = project.teamPhotoUrl;
    }
    validatePublication(publication);
  }
  const digest = sourceDigest(source);
  return {
    config: {
      ...source.config,
      storage: "database",
      legacy: false,
      settings: eventSettings({
        requiredReviews: 2,
        scoreMax: 10,
        finalistCount: publication?.finals.finalists.length || 7,
        submissionsOpen: false,
      }),
    },
    submissions,
    publication,
    drafts: {},
    migration: {
      archiveId: `${source.config.id}:${digest}`,
      sourceDigest: digest,
      importedAt: new Date().toISOString(),
    },
  };
}
function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, ordered(v)]),
    );
  return value;
}
export function verifyImportedEvent(source: SourceEvent, target: EventRecord) {
  const original = sourceSubmissions(source);
  const saved = new Map(target.submissions.map((s) => [s.id, s]));
  if (original.length !== target.submissions.length)
    throw new Error("Submission count changed during import.");
  for (const submission of original) {
    const copy = saved.get(submission.id);
    if (!copy) throw new Error("A submission was lost during import.");
    for (const key of [
      "reviews",
      "finalJudging",
      "progressScore",
      "practicalityScore",
      "complexityScore",
      "totalScore",
      "status",
      "completedAt",
      "createdAt",
      "contactEmail",
      "submitterNames",
      "projectName",
      "teamName",
      "toolsUsed",
      "description",
      "oneLiner",
      "progressOutline",
    ] as const) {
      if (JSON.stringify(ordered(submission[key])) !== JSON.stringify(ordered(copy[key])))
        throw new Error(`Imported submission mismatch: ${key}.`);
    }
  }
  const withoutPhotos = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(withoutPhotos);
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value)
          .filter(([key]) => key !== "teamPhotoUrl")
          .map(([key, v]) => [key, withoutPhotos(v)]),
      );
    return value;
  };
  if (
    JSON.stringify(ordered(withoutPhotos(source.publication))) !==
    JSON.stringify(ordered(withoutPhotos(target.publication)))
  )
    throw new Error("Published rankings, scores, or ballots changed during import.");
  if (
    target.config.scoringPolicy !== source.config.scoringPolicy ||
    target.migration?.sourceDigest !== sourceDigest(source)
  )
    throw new Error("Import provenance or scoring policy mismatch.");
  return {
    submissions: target.submissions.length,
    preliminaryReviews: target.submissions.reduce((n, s) => n + s.reviews.length, 0),
    finalReviews: target.submissions.reduce((n, s) => n + (s.finalJudging?.reviews.length || 0), 0),
    files: sourceAttachments(source).length,
    published: !!target.publication,
  };
}
