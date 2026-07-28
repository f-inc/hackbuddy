import { requireAirtableApiKey } from "@/server/config/env";
import {
  UpstreamError,
  ValidationError,
} from "@/server/http/errors";

export type AirtableBaseOption = {
  id: string;
  name: string;
  permissionLevel?: string;
};

export type AirtableTableOption = {
  id: string;
  name: string;
};

type BaseListResponse = {
  bases?: AirtableBaseOption[];
  offset?: string;
};

type TableListResponse = {
  tables?: Array<
    AirtableTableOption & {
      fields?: Array<{ id: string; name: string; type: string }>;
    }
  >;
};

function apiKey() {
  return requireAirtableApiKey();
}

async function metadataRequest<T>(url: string, init?: RequestInit) {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        ...init?.headers,
      },
      cache: "no-store",
    });
  } catch (cause) {
    throw new UpstreamError("Airtable metadata could not be reached.", {
      cause,
    });
  }
  if (!response.ok) {
    const details = await response.text();
    throw new UpstreamError(
      `Airtable metadata request failed (${response.status}).`,
      { cause: new Error(details) },
    );
  }
  try {
    return (await response.json()) as T;
  } catch (cause) {
    throw new UpstreamError("Airtable metadata returned invalid JSON.", {
      cause,
    });
  }
}

export function normalizeAirtableBaseId(value: string) {
  const baseId = value.trim();
  if (!/^app[a-zA-Z0-9]+$/.test(baseId)) {
    throw new ValidationError("Select a valid Airtable base.");
  }
  return baseId;
}

export async function listAirtableBases() {
  const bases: AirtableBaseOption[] = [];
  let offset: string | undefined;

  do {
    const params = new URLSearchParams();
    if (offset) params.set("offset", offset);
    const query = params.size ? `?${params}` : "";
    const page = await metadataRequest<BaseListResponse>(
      `https://api.airtable.com/v0/meta/bases${query}`,
    );
    bases.push(...(page.bases || []));
    offset = page.offset;
  } while (offset);

  return bases.sort((a, b) => a.name.localeCompare(b.name));
}

export async function listAirtableTables(baseId: string) {
  const normalizedBaseId = normalizeAirtableBaseId(baseId);
  const response = await metadataRequest<TableListResponse>(
    `https://api.airtable.com/v0/meta/bases/${normalizedBaseId}/tables`,
  );
  return (response.tables || [])
    .map(({ id, name }) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const reviewFieldDefinitions = [
  {
    name: process.env.AIRTABLE_REVIEW_KEY_FIELD || "Review Key",
    type: "singleLineText",
  },
  {
    name:
      process.env.AIRTABLE_REVIEW_SUBMISSION_ID_FIELD || "Submission ID",
    type: "singleLineText",
  },
  {
    name: process.env.AIRTABLE_REVIEW_PHASE_FIELD || "Phase",
    type: "singleLineText",
  },
  {
    name: process.env.AIRTABLE_REVIEW_JUDGE_FIELD || "Judge Name",
    type: "singleLineText",
  },
  {
    name:
      process.env.AIRTABLE_REVIEW_PROGRESS_FIELD || "Progress Score",
    type: "number",
    options: { precision: 0 },
  },
  {
    name:
      process.env.AIRTABLE_REVIEW_PRACTICALITY_FIELD ||
      "Practicality Score",
    type: "number",
    options: { precision: 0 },
  },
  {
    name:
      process.env.AIRTABLE_REVIEW_COMPLEXITY_FIELD ||
      "Technical Complexity Score",
    type: "number",
    options: { precision: 0 },
  },
  {
    name: process.env.AIRTABLE_REVIEW_TOTAL_FIELD || "Total Score",
    type: "number",
    options: { precision: 0 },
  },
  {
    name: process.env.AIRTABLE_REVIEW_NOTES_FIELD || "Judge Notes",
    type: "multilineText",
  },
  {
    name:
      process.env.AIRTABLE_REVIEW_COMPLETED_AT_FIELD || "Completed At",
    type: "singleLineText",
  },
] as const;

export async function ensureAirtableReviewsTable(
  baseId: string,
  tableName: string,
) {
  const normalizedBaseId = normalizeAirtableBaseId(baseId);
  const normalizedTableName = tableName.trim();
  if (!normalizedTableName) {
    throw new ValidationError("Airtable reviews table name is required.");
  }
  const tablesUrl =
    `https://api.airtable.com/v0/meta/bases/${normalizedBaseId}/tables`;
  const metadata = await metadataRequest<TableListResponse>(tablesUrl);
  let table = metadata.tables?.find(
    (candidate) => candidate.name === normalizedTableName,
  );
  if (!table) {
    table = await metadataRequest<
      AirtableTableOption & {
        fields?: Array<{ id: string; name: string; type: string }>;
      }
    >(tablesUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: normalizedTableName,
        description:
          "One row per HackBuddy judge review. Review Key is the idempotency key.",
        fields: reviewFieldDefinitions,
      }),
    });
    return table;
  }
  for (const definition of reviewFieldDefinitions) {
    if (table.fields?.some((field) => field.name === definition.name)) {
      continue;
    }
    await metadataRequest(
      `${tablesUrl}/${table.id}/fields`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(definition),
      },
    );
  }
  return table;
}
