import { ensureAirtableReviewsTable } from "./airtable-metadata";
import { airtableCredentials } from "@/server/config/env";
import {
  ConflictError,
  NotFoundError,
  UpstreamError,
  ValidationError,
} from "@/server/http/errors";

export type HackathonConfig = {
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
};

type AirtableRecord = {
  id: string;
  fields: Record<string, unknown>;
};

type AirtableListResponse = {
  records: AirtableRecord[];
  offset?: string;
};

const registryTable =
  process.env.AIRTABLE_HACKATHONS_TABLE || "Hackathons";

const registryField = {
  name: process.env.AIRTABLE_HACKATHON_NAME_FIELD || "Name",
  slug: process.env.AIRTABLE_HACKATHON_SLUG_FIELD || "Slug",
  baseId:
    process.env.AIRTABLE_HACKATHON_BASE_ID_FIELD || "Airtable Base ID",
  tableName:
    process.env.AIRTABLE_HACKATHON_TABLE_NAME_FIELD || "Airtable Table Name",
  reviewsTableName:
    process.env.AIRTABLE_HACKATHON_REVIEWS_TABLE_NAME_FIELD ||
    "Airtable Reviews Table Name",
  imageUrl:
    process.env.AIRTABLE_HACKATHON_IMAGE_URL_FIELD || "Image URL",
  squareImageUrl:
    process.env.AIRTABLE_HACKATHON_SQUARE_IMAGE_URL_FIELD ||
    "Square Image URL",
  active: process.env.AIRTABLE_HACKATHON_ACTIVE_FIELD || "Active",
};

function configured() {
  const { apiKey, baseId } = airtableCredentials();
  return Boolean(apiKey && baseId);
}

function registryUrl(path = "") {
  return `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${encodeURIComponent(registryTable)}${path}`;
}

async function registryRequest<T>(path = "", init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(registryUrl(path), {
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
    throw new UpstreamError(
      `Hackathon registry request failed (${response.status}).`,
      { cause: new Error(details) },
    );
  }
  try {
    return (await response.json()) as T;
  } catch (cause) {
    throw new UpstreamError(
      "The hackathon registry returned invalid JSON.",
      { cause },
    );
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
    throw new UpstreamError(
      `The Airtable table "${tableName}" could not be reached.`,
      { cause },
    );
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
  try {
    const parsed = new URL(imageUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error();
    }
    return parsed.toString();
  } catch {
    throw new ValidationError(
      "Image URL must be a valid http or https link.",
    );
  }
}

function toConfig(record: AirtableRecord): HackathonConfig {
  const name = text(record.fields[registryField.name]);
  const slug = normalizeHackathonSlug(
    text(record.fields[registryField.slug]) || name,
  );
  const baseId =
    text(record.fields[registryField.baseId]) ||
    process.env.AIRTABLE_BASE_ID?.trim() ||
    "";
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
    reviewsTableName:
      text(record.fields[registryField.reviewsTableName]) ||
      `${name} - Reviews`,
    imageUrl: text(record.fields[registryField.imageUrl]),
    squareImageUrl:
      text(record.fields[registryField.squareImageUrl]) ||
      text(record.fields[registryField.imageUrl]),
    active: record.fields[registryField.active] !== false,
  };
}

function legacyHackathon(): HackathonConfig | null {
  const tableName = process.env.AIRTABLE_TABLE_NAME?.trim();
  if (!tableName) return null;
  const name = process.env.DEFAULT_HACKATHON_NAME || "Night Hack III";
  return {
    id: "legacy-default",
    name,
    slug: normalizeHackathonSlug(
      process.env.DEFAULT_HACKATHON_SLUG || "nighthack3",
    ),
    baseId: process.env.AIRTABLE_BASE_ID?.trim() || "",
    tableName,
    reviewsTableName:
      process.env.AIRTABLE_REVIEWS_TABLE_NAME?.trim() ||
      `${name} - Reviews`,
    imageUrl: process.env.DEFAULT_HACKATHON_IMAGE_URL?.trim() || "",
    squareImageUrl:
      process.env.DEFAULT_HACKATHON_SQUARE_IMAGE_URL?.trim() ||
      process.env.DEFAULT_HACKATHON_IMAGE_URL?.trim() ||
      "",
    active: true,
    legacy: true,
  };
}

export async function listHackathons() {
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
      throw new UpstreamError(
        "The hackathon registry returned an invalid response.",
      );
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
  return (
    (await listHackathons()).find(
      (hackathon) => hackathon.slug === normalized && hackathon.active,
    ) ?? null
  );
}

export async function createHackathon(input: {
  name: string;
  slug: string;
  baseId: string;
  tableName: string;
  reviewsTableName?: string;
  imageUrl?: string;
  squareImageUrl?: string;
}) {
  const name = input.name.trim();
  const slug = normalizeHackathonSlug(input.slug || name);
  const baseId = input.baseId.trim();
  const tableName = input.tableName.trim();
  const reviewsTableName =
    input.reviewsTableName?.trim() || `${name} - Reviews`;
  const imageUrl = normalizedImageUrl(input.imageUrl || "");
  const squareImageUrl = normalizedImageUrl(
    input.squareImageUrl || input.imageUrl || "",
  );
  if (!name || !slug || !baseId || !tableName || !reviewsTableName) {
    throw new ValidationError(
      "Name, URL slug, Airtable base, and Airtable table are required.",
    );
  }
  if (
    (await listHackathons()).some(
      (hackathon) => hackathon.slug === slug && !hackathon.legacy,
    )
  ) {
    throw new ConflictError("That hackathon URL slug is already in use.");
  }
  await assertTableAvailable(baseId, tableName);
  await ensureAirtableReviewsTable(baseId, reviewsTableName);
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
            ...(squareImageUrl
              ? { [registryField.squareImageUrl]: squareImageUrl }
              : {}),
            [registryField.active]: true,
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

export async function updateHackathon(
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
  const existingHackathons = await listHackathons();
  const existing = existingHackathons.find((hackathon) => hackathon.id === id);
  if (!existing) throw new NotFoundError("Hackathon not found.");
  const reviewsTableName =
    input.reviewsTableName?.trim() ||
    existing.reviewsTableName ||
    `${name} - Reviews`;
  const imageUrl = normalizedImageUrl(input.imageUrl || "");
  const squareImageUrl = normalizedImageUrl(
    input.squareImageUrl || input.imageUrl || "",
  );
  if (!name || !slug || !baseId || !tableName || !reviewsTableName) {
    throw new ValidationError(
      "Name, URL slug, Airtable base, and Airtable table are required.",
    );
  }
  const duplicate = existingHackathons.find(
    (hackathon) =>
      hackathon.slug === slug &&
      hackathon.id !== id &&
      !hackathon.legacy,
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
