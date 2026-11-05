import {
  managedEvents,
  insertEvent,
  changeEvent,
  readEvent,
} from "@/infrastructure/database/events";
import { randomUUID } from "node:crypto";
import { eventSettings, type EventSettings } from "@/domain/event-settings";
import {
  readScoringPolicy,
  assertSameScoringPolicy,
  NEW_EVENT_SCORING_POLICY,
  type ScoringPolicy,
} from "@/domain/event-scoring";
import { ensureAirtableReviewsTable } from "./airtable-metadata";
import { airtableCredentials } from "@/server/config/env";
import { ConflictError, NotFoundError, UpstreamError, ValidationError } from "@/server/http/errors";

export type HackathonConfig = {
  storage?: "database";
  settings?: EventSettings;
  id: string;
  name: string;
  slug: string;
  baseId: string;
  tableName: string;
  reviewsTableName: string;
  imageUrl: string;
  squareImageUrl: string;
  active: boolean;
  legacy?: boolean;
  scoringPolicy: ScoringPolicy;
};

type AirtableRecord = {
  id: string;
  fields: Record<string, unknown>;
};

type AirtableListResponse = {
  records: AirtableRecord[];
  offset?: string;
};

const registryTable = process.env.AIRTABLE_HACKATHONS_TABLE || "Hackathons";

const registryField = {
  name: process.env.AIRTABLE_HACKATHON_NAME_FIELD || "Name",
  slug: process.env.AIRTABLE_HACKATHON_SLUG_FIELD || "Slug",
  baseId: process.env.AIRTABLE_HACKATHON_BASE_ID_FIELD || "Airtable Base ID",
  tableName: process.env.AIRTABLE_HACKATHON_TABLE_NAME_FIELD || "Airtable Table Name",
  reviewsTableName:
    process.env.AIRTABLE_HACKATHON_REVIEWS_TABLE_NAME_FIELD || "Airtable Reviews Table Name",
  imageUrl: process.env.AIRTABLE_HACKATHON_IMAGE_URL_FIELD || "Image URL",
  squareImageUrl: process.env.AIRTABLE_HACKATHON_SQUARE_IMAGE_URL_FIELD || "Square Image URL",
  active: process.env.AIRTABLE_HACKATHON_ACTIVE_FIELD || "Active",
  scoringPolicy: process.env.AIRTABLE_HACKATHON_SCORING_POLICY_FIELD || "Scoring Policy",
  publishedResults: process.env.AIRTABLE_HACKATHON_PUBLISHED_RESULTS_FIELD || "Published Results",
};

function configured() {
  const { apiKey, baseId } = airtableCredentials();
  return Boolean(apiKey && baseId);
}

function registryUrl(path = "", table = registryTable) {
  return `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${encodeURIComponent(table)}${path}`;
}

async function registryRequest<T>(
  path = "",
  init?: RequestInit,
  table = registryTable,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(registryUrl(path, table), {
      ...init,
      headers: {
        Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`,
        "Content-Type": "application/json",
        ...init?.headers,
      },
      cache: "no-store",
    });
  } catch (cause) {
    throw new UpstreamError("The hackathon registry could not be reached.", {
      cause,
    });
  }
  if (!response.ok) {
    const details = await response.text();
    throw new UpstreamError(`Hackathon registry request failed (${response.status}).`, {
      cause: new Error(details),
    });
  }
  try {
    return (await response.json()) as T;
  } catch (cause) {
    throw new UpstreamError("The hackathon registry returned invalid JSON.", {
      cause,
    });
  }
}

async function assertTableAvailable(baseId: string, tableName: string) {
  let response: Response;
  try {
    response = await fetch(
      `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}?maxRecords=1&pageSize=1`,
      {
        headers: {
          Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`,
        },
        cache: "no-store",
      },
    );
  } catch (cause) {
    throw new UpstreamError(`The Airtable table "${tableName}" could not be reached.`, { cause });
  }
  if (!response.ok) {
    throw new UpstreamError(
      `The Airtable table "${tableName}" could not be accessed. Check its exact name and token permissions.`,
    );
  }
}

export function normalizeHackathonSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizedImageUrl(value: string) {
  const imageUrl = value.trim();
  if (!imageUrl) return "";
  if (/^\/api\/hackathons\/[a-z0-9-]+\/assets\/[a-f0-9]{40}$/.test(imageUrl)) return imageUrl;
  try {
    const parsed = new URL(imageUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error();
    }
    return parsed.toString();
  } catch {
    throw new ValidationError("Image URL must be a valid http or https link.");
  }
}

function toConfig(record: AirtableRecord): HackathonConfig {
  const name = text(record.fields[registryField.name]);
  const slug = normalizeHackathonSlug(text(record.fields[registryField.slug]) || name);
  const baseId =
    text(record.fields[registryField.baseId]) || process.env.AIRTABLE_BASE_ID?.trim() || "";
  const tableName = text(record.fields[registryField.tableName]);
  if (!name || !slug || !baseId || !tableName) {
    throw new UpstreamError(
      `Hackathon registry record ${record.id} does not match the expected schema.`,
    );
  }
  return {
    id: record.id,
    name,
    slug,
    baseId,
    tableName,
    reviewsTableName: text(record.fields[registryField.reviewsTableName]) || `${name} - Reviews`,
    imageUrl: text(record.fields[registryField.imageUrl]),
    squareImageUrl:
      text(record.fields[registryField.squareImageUrl]) ||
      text(record.fields[registryField.imageUrl]),
    active: record.fields[registryField.active] !== false,
    scoringPolicy: readScoringPolicy(record.fields[registryField.scoringPolicy]),
  };
}

function legacyHackathon(): HackathonConfig | null {
  const tableName = process.env.AIRTABLE_TABLE_NAME?.trim();
  if (!tableName) return null;
  const name = process.env.DEFAULT_HACKATHON_NAME || "Night Hack III";
  return {
    id: "legacy-default",
    name,
    slug: normalizeHackathonSlug(process.env.DEFAULT_HACKATHON_SLUG || "nighthack3"),
    baseId: process.env.AIRTABLE_BASE_ID?.trim() || "",
    tableName,
    reviewsTableName: process.env.AIRTABLE_REVIEWS_TABLE_NAME?.trim() || `${name} - Reviews`,
    imageUrl: process.env.DEFAULT_HACKATHON_IMAGE_URL?.trim() || "",
    squareImageUrl:
      process.env.DEFAULT_HACKATHON_SQUARE_IMAGE_URL?.trim() ||
      process.env.DEFAULT_HACKATHON_IMAGE_URL?.trim() ||
      "",
    active: true,
    legacy: true,
    scoringPolicy: "raw-v1",
  };
}

export async function listAirtableHackathons() {
  if (!configured()) {
    const legacy = legacyHackathon();
    return legacy ? [legacy] : [];
  }

  const configs: HackathonConfig[] = [];
  let offset: string | undefined;
  do {
    const params = new URLSearchParams({ pageSize: "100" });
    if (offset) params.set("offset", offset);
    const page = await registryRequest<AirtableListResponse>(`?${params}`);
    if (!Array.isArray(page.records)) {
      throw new UpstreamError("The hackathon registry returned an invalid response.");
    }
    configs.push(...page.records.map(toConfig));
    offset = page.offset;
  } while (offset);

  const legacy = legacyHackathon();
  if (legacy && !configs.some((config) => config.slug === legacy.slug)) {
    configs.push(legacy);
  }
  return configs.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getHackathon(slug: string) {
  const normalized = normalizeHackathonSlug(slug);
  const saved = (await managedEvents()).find((event) => event.slug === normalized);
  if (saved) return saved.active ? saved : null;
  return (
    (await listAirtableHackathons()).find((event) => event.slug === normalized && event.active) ??
    null
  );
}

export async function createAirtableHackathon(input: {
  name: string;
  slug: string;
  baseId: string;
  tableName: string;
  reviewsTableName?: string;
  imageUrl?: string;
  squareImageUrl?: string;
  scoringPolicy?: ScoringPolicy;
}) {
  const name = input.name.trim();
  const slug = normalizeHackathonSlug(input.slug || name);
  const baseId = input.baseId.trim();
  const tableName = input.tableName.trim();
  const reviewsTableName = input.reviewsTableName?.trim() || `${name} - Reviews`;
  const imageUrl = normalizedImageUrl(input.imageUrl || "");
  const squareImageUrl = normalizedImageUrl(input.squareImageUrl || input.imageUrl || "");
  if (!name || !slug || !baseId || !tableName || !reviewsTableName) {
    throw new ValidationError("Name, URL slug, Airtable base, and Airtable table are required.");
  }
  const existingEvents = await listAirtableHackathons();
  if (existingEvents.some((hackathon) => hackathon.slug === slug && !hackathon.legacy)) {
    throw new ConflictError("That hackathon URL slug is already in use.");
  }
  await assertTableAvailable(baseId, tableName);
  await ensureAirtableReviewsTable(baseId, reviewsTableName);
  const scoringPolicy = readScoringPolicy(input.scoringPolicy ?? NEW_EVENT_SCORING_POLICY);
  if (scoringPolicy === "normalized-v1") {
    if (existingEvents.some((event) => event.baseId === baseId && event.tableName === tableName)) {
      throw new ConflictError(
        "This submissions table is already attached to an event. Existing events must retain their original scoring method.",
      );
    }
    const history = await fetch(
      `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(reviewsTableName)}?maxRecords=1`,
      {
        headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` },
        cache: "no-store",
      },
    );
    if (!history.ok)
      throw new UpstreamError("Could not verify that the new event has no review history.");
    const rows = (await history.json()) as AirtableListResponse;
    if (!Array.isArray(rows.records)) throw new UpstreamError("Invalid review history response.");
    if (rows.records.length)
      throw new ConflictError(
        "This review table already has scores. Use original raw scoring to register an existing event.",
      );
  }
  const result = await registryRequest<{ records: AirtableRecord[] }>("", {
    method: "POST",
    body: JSON.stringify({
      records: [
        {
          fields: {
            [registryField.name]: name,
            [registryField.slug]: slug,
            [registryField.baseId]: baseId,
            [registryField.tableName]: tableName,
            [registryField.reviewsTableName]: reviewsTableName,
            ...(imageUrl ? { [registryField.imageUrl]: imageUrl } : {}),
            ...(squareImageUrl ? { [registryField.squareImageUrl]: squareImageUrl } : {}),
            [registryField.active]: true,
            [registryField.scoringPolicy]: scoringPolicy,
          },
        },
      ],
    }),
  });
  if (!Array.isArray(result.records) || !result.records[0]) {
    throw new UpstreamError("Airtable returned an invalid hackathon.");
  }
  return toConfig(result.records[0]);
}

export async function updateAirtableHackathon(
  id: string,
  input: {
    name: string;
    slug: string;
    baseId: string;
    tableName: string;
    reviewsTableName?: string;
    imageUrl?: string;
    squareImageUrl?: string;
    active?: boolean;
    scoringPolicy?: ScoringPolicy;
  },
) {
  if (id === "legacy-default") {
    throw new ConflictError(
      "The legacy event is controlled by environment variables. Create a registry event to edit it.",
    );
  }
  const name = input.name.trim();
  const slug = normalizeHackathonSlug(input.slug || name);
  const baseId = input.baseId.trim();
  const tableName = input.tableName.trim();
  const existingHackathons = await listAirtableHackathons();
  const existing = existingHackathons.find((hackathon) => hackathon.id === id);
  if (!existing) throw new NotFoundError("Hackathon not found.");
  try {
    assertSameScoringPolicy(existing.scoringPolicy, input.scoringPolicy);
  } catch (error) {
    throw new ConflictError((error as Error).message);
  }
  // Moving an event onto another ledger could bypass its fixed policy or detach
  // it from its published snapshot. Event data sources are immutable as well.
  if (
    baseId !== existing.baseId ||
    tableName !== existing.tableName ||
    (input.reviewsTableName !== undefined &&
      input.reviewsTableName.trim() !== existing.reviewsTableName)
  ) {
    throw new ConflictError(
      "An event's scoring data sources are fixed. Create a new event to use another ledger.",
    );
  }

  const reviewsTableName =
    input.reviewsTableName?.trim() || existing.reviewsTableName || `${name} - Reviews`;
  const imageUrl = normalizedImageUrl(input.imageUrl || "");
  const squareImageUrl = normalizedImageUrl(input.squareImageUrl || input.imageUrl || "");
  if (!name || !slug || !baseId || !tableName || !reviewsTableName) {
    throw new ValidationError("Name, URL slug, Airtable base, and Airtable table are required.");
  }
  const duplicate = existingHackathons.find(
    (hackathon) => hackathon.slug === slug && hackathon.id !== id && !hackathon.legacy,
  );
  if (duplicate) {
    throw new ConflictError("That hackathon URL slug is already in use.");
  }
  await assertTableAvailable(baseId, tableName);
  await ensureAirtableReviewsTable(baseId, reviewsTableName);
  const record = await registryRequest<AirtableRecord>(`/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      fields: {
        [registryField.name]: name,
        [registryField.slug]: slug,
        [registryField.baseId]: baseId,
        [registryField.tableName]: tableName,
        [registryField.reviewsTableName]: reviewsTableName,
        [registryField.imageUrl]: imageUrl || null,
        [registryField.squareImageUrl]: squareImageUrl || null,
        [registryField.active]: input.active ?? existing.active,
      },
    }),
  });
  return toConfig(record);
}

/** Raw registry access is server-only; published snapshot contents are not exposed in event setup responses. */
export async function readEventScoringRecord(id: string) {
  if (id === "legacy-default") return { scoringPolicy: "raw-v1" as const, encodedPublication: "" };
  const record = await registryRequest<AirtableRecord>(`/${id}`);
  return {
    scoringPolicy: readScoringPolicy(record.fields[registryField.scoringPolicy]),
    encodedPublication:
      text(record.fields[registryField.publishedResults]) || (await firstJournalPublication(id)),
  };
}

const publicationTable = process.env.AIRTABLE_PUBLICATIONS_TABLE || "HackBuddy Publications";

async function firstJournalPublication(id: string) {
  const escapedId = id.replace(/'/g, "\\'");
  const params = new URLSearchParams({
    maxRecords: "1",
    filterByFormula: `{Hackathon ID}='${escapedId}'`,
    "sort[0][field]": "Sequence",
    "sort[0][direction]": "asc",
  });
  const page = await registryRequest<AirtableListResponse>(
    `?${params}`,
    undefined,
    publicationTable,
  );
  if (!Array.isArray(page.records))
    throw new UpstreamError("Invalid publication journal response.");
  const first = page.records[0];
  if (!first) return "";
  const encoded = text(first.fields.Snapshot);
  if (!encoded || !Number.isFinite(first.fields.Sequence)) {
    throw new UpstreamError("Published snapshot is invalid. Refusing to recalculate results.");
  }
  return encoded;
}

export async function writeEventPublication(id: string, encoded: string) {
  if (id === "legacy-default")
    throw new ConflictError("Register this legacy event before publishing a permanent snapshot.");
  const existing = await readEventScoringRecord(id);
  if (existing.encodedPublication) return existing.encodedPublication;
  // Never PATCH a published snapshot. Airtable assigns an increasing Sequence
  // on insertion. Concurrent publishers may append, but only the first row is
  // authoritative, so a later request cannot overwrite official results.
  await registryRequest(
    "",
    {
      method: "POST",
      body: JSON.stringify({
        records: [{ fields: { "Hackathon ID": id, Snapshot: encoded } }],
      }),
    },
    publicationTable,
  );
  const authoritative = await firstJournalPublication(id);
  if (!authoritative) throw new UpstreamError("Published snapshot could not be verified.");
  return authoritative;
}

export async function listHackathons() {
  const saved = await managedEvents();
  // Once events are managed here, their catalog must not wait for Airtable.
  // Keep the original registry as a bootstrap for unmigrated installations.
  const events = saved.length ? saved : await listAirtableHackathons();
  return events.sort((a, b) => a.name.localeCompare(b.name));
}

export async function createHackathon(input: {
  name: string;
  slug: string;
  imageUrl?: string;
  squareImageUrl?: string;
  scoringPolicy?: ScoringPolicy;
  settings?: EventSettings;
}) {
  const name = input.name.trim(),
    slug = normalizeHackathonSlug(input.slug || name);
  if (
    !name ||
    !slug ||
    [
      "api",
      "studio",
      "events",
      "showcase",
      "hackathons",
      "judging",
      "dashboard",
      "leaderboard",
      "results",
      "judge",
    ].includes(slug)
  )
    throw new ValidationError("Choose an event name and a unique URL.");
  if (await getHackathon(slug)) throw new ConflictError("That hackathon URL already exists.");
  const config: HackathonConfig = {
    id: randomUUID(),
    name,
    slug,
    baseId: "",
    tableName: "",
    reviewsTableName: "",
    imageUrl: normalizedImageUrl(input.imageUrl || ""),
    squareImageUrl: normalizedImageUrl(input.squareImageUrl || input.imageUrl || ""),
    active: true,
    storage: "database",
    scoringPolicy: input.scoringPolicy || NEW_EVENT_SCORING_POLICY,
    settings: eventSettings(input.settings),
  };
  await insertEvent({ config, submissions: [], drafts: {}, publication: null });
  return config;
}
export async function updateHackathon(
  id: string,
  input: {
    name: string;
    slug: string;
    imageUrl?: string;
    squareImageUrl?: string;
    scoringPolicy?: ScoringPolicy;
    settings?: EventSettings;
    active?: boolean;
    baseId?: string;
    tableName?: string;
  },
) {
  if (!(await readEvent(id)))
    return updateAirtableHackathon(id, {
      ...input,
      baseId: input.baseId || "",
      tableName: input.tableName || "",
    });
  const name = input.name.trim(),
    slug = normalizeHackathonSlug(input.slug || name);
  const duplicate = await getHackathon(slug);
  if (duplicate && duplicate.id !== id) throw new ConflictError("That URL is already in use.");
  return changeEvent(id, (event) => {
    const settings = eventSettings(input.settings || event.config.settings);
    if (
      (event.submissions.some((s) => s.reviews.length || s.claimedBy || s.finalJudging) ||
        event.publication) &&
      (settings.requiredReviews !== event.config.settings?.requiredReviews ||
        settings.finalistCount !== event.config.settings?.finalistCount ||
        settings.scoreMax !== event.config.settings?.scoreMax ||
        (input.scoringPolicy ?? event.config.scoringPolicy) !== event.config.scoringPolicy)
    )
      throw new ConflictError("Judging rules are locked after judging begins.");
    if (!name || !slug) throw new ValidationError("Event name and URL are required.");
    event.config = {
      ...event.config,
      name,
      slug,
      settings,
      imageUrl: normalizedImageUrl(input.imageUrl || ""),
      squareImageUrl: normalizedImageUrl(input.squareImageUrl || input.imageUrl || ""),
      active: input.active ?? event.config.active,
      scoringPolicy: input.scoringPolicy || event.config.scoringPolicy,
    };
    return event.config;
  });
}
