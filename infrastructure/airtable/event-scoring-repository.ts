import { gzipSync, gunzipSync } from "node:zlib";
import type {
  EventScoringRepository,
  EventScoringState,
} from "@/application/ports/event-scoring-repository";
import { readScoringPolicy } from "@/domain/event-scoring";
import {
  validatePublication,
  type PublishedResults,
} from "@/domain/publication";
import { currentHackathonId } from "@/lib/airtable-context";
import {
  getHackathon,
  readEventScoringRecord,
  writeEventPublication,
} from "@/lib/hackathons";
import { airtableIsConfigured } from "./submission-repository";
import {
  ConflictError,
  UpstreamError,
  ValidationError,
} from "@/server/http/errors";

const demoGlobal = globalThis as typeof globalThis & {
  hackbuddyDemoPublication?: PublishedResults;
};

export function encodePublication(snapshot: PublishedResults) {
  const serialized = JSON.stringify(validatePublication(snapshot));
  if (Buffer.byteLength(serialized, "utf8") > 20_000_000) {
    throw new ValidationError(
      "This snapshot exceeds the publication storage limit. Results were not published.",
    );
  }
  const encoded = "gzip-v1:" + gzipSync(serialized).toString("base64");
  if (encoded.length > 95_000)
    throw new ValidationError(
      "This snapshot exceeds the publication storage limit. Results were not published.",
    );
  return encoded;
}
function decodePublication(encoded: string): PublishedResults | null {
  if (!encoded) return null;
  try {
    if (!encoded.startsWith("gzip-v1:"))
      throw new Error("Unknown snapshot encoding.");
    return validatePublication(
      JSON.parse(
        gunzipSync(Buffer.from(encoded.slice(8), "base64"), {
          maxOutputLength: 20_000_000,
        }).toString("utf8"),
      ),
    );
  } catch (cause) {
    throw new UpstreamError(
      "Published results could not be read. Refusing to recalculate them.",
      { cause },
    );
  }
}
async function eventId() {
  const current = currentHackathonId();
  if (current) return current;
  const config = await getHackathon(
    process.env.DEFAULT_HACKATHON_SLUG || "nighthack3",
  );
  if (!config)
    throw new ConflictError("Select a hackathon before publishing results.");
  return config.id;
}

export const eventScoringRepository: EventScoringRepository = {
  async read(): Promise<EventScoringState> {
    if (!airtableIsConfigured())
      return {
        scoringPolicy:
          demoGlobal.hackbuddyDemoPublication?.scoringPolicy ??
          readScoringPolicy(process.env.DEMO_SCORING_POLICY),
        publication: demoGlobal.hackbuddyDemoPublication
          ? structuredClone(demoGlobal.hackbuddyDemoPublication)
          : null,
      };
    const record = await readEventScoringRecord(await eventId());
    const publication = decodePublication(record.encodedPublication);
    // A publication pins its own version even if external registry metadata changes.
    return {
      scoringPolicy: publication?.scoringPolicy ?? record.scoringPolicy,
      publication,
    };
  },
  async publish(snapshot) {
    const current = await this.read();
    if (current.publication) return current.publication;
    if (current.scoringPolicy !== snapshot.scoringPolicy)
      throw new ConflictError(
        "Scoring policy changed while publishing. Reload and try again.",
      );
    const validated = validatePublication(snapshot);
    if (!airtableIsConfigured())
      demoGlobal.hackbuddyDemoPublication = structuredClone(validated);
    else {
      const authoritative = await writeEventPublication(
        await eventId(),
        encodePublication(validated),
      );
      return decodePublication(authoritative)!;
    }
    return structuredClone(validated);
  },
};
