import {
  NotFoundError,
  UpstreamError,
} from "@/server/http/errors";
import { requireAirtableApiKey } from "@/server/config/env";

export type AirtableRecord = {
  id: string;
  createdTime: string;
  fields: Record<string, unknown>;
};

export type AirtableListResponse = {
  records: AirtableRecord[];
  offset?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseRecord(value: unknown): AirtableRecord {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !isRecord(value.fields)
  ) {
    throw new UpstreamError("Airtable returned an invalid record.");
  }
  return {
    id: value.id,
    createdTime:
      typeof value.createdTime === "string" ? value.createdTime : "",
    fields: value.fields,
  };
}

export function parseListResponse(value: unknown): AirtableListResponse {
  if (
    !isRecord(value) ||
    !Array.isArray(value.records) ||
    (value.offset !== undefined && typeof value.offset !== "string")
  ) {
    throw new UpstreamError("Airtable returned an invalid list response.");
  }
  return {
    records: value.records.map(parseRecord),
    offset: typeof value.offset === "string" ? value.offset : undefined,
  };
}

export class AirtableClient {
  constructor(
    private readonly baseId: string,
    private readonly tableName: string,
  ) {}

  private url(path: string) {
    return `https://api.airtable.com/v0/${this.baseId}/${encodeURIComponent(this.tableName)}${path}`;
  }

  async request(path = "", init?: RequestInit): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(this.url(path), {
        ...init,
        headers: {
          Authorization: `Bearer ${requireAirtableApiKey()}`,
          "Content-Type": "application/json",
          ...init?.headers,
        },
        cache: "no-store",
      });
    } catch (cause) {
      throw new UpstreamError("Airtable could not be reached.", { cause });
    }

    if (!response.ok) {
      const details = await response.text();
      if (response.status === 404) {
        throw new NotFoundError("The Airtable record was not found.", {
          cause: new Error(details),
        });
      }
      throw new UpstreamError(
        `Airtable request failed (${response.status}).`,
        { cause: new Error(details) },
      );
    }

    try {
      return await response.json();
    } catch (cause) {
      throw new UpstreamError("Airtable returned invalid JSON.", { cause });
    }
  }

  async get(id: string) {
    return parseRecord(await this.request(`/${encodeURIComponent(id)}`));
  }

  async list(filterByFormula?: string) {
    const records: AirtableRecord[] = [];
    let offset: string | undefined;
    do {
      const params = new URLSearchParams({ pageSize: "100" });
      if (filterByFormula) params.set("filterByFormula", filterByFormula);
      if (offset) params.set("offset", offset);
      const page = parseListResponse(await this.request(`?${params}`));
      records.push(...page.records);
      offset = page.offset;
    } while (offset);
    return records;
  }

  async update(
    id: string,
    fields: Record<string, string | number | null>,
  ) {
    return parseRecord(
      await this.request(`/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ fields }),
      }),
    );
  }
}

export function airtableFormula(fieldName: string, value: string) {
  const escaped = value.replace(/'/g, "\\'");
  return `{${fieldName}}='${escaped}'`;
}
