import { withAirtableConfig } from "./airtable-context";
import { getHackathon, normalizeHackathonSlug } from "./hackathons";
import { requireSession } from "@/server/auth/policies";
import {
  errorResponse,
  ForbiddenError,
  NotFoundError,
} from "@/server/http/errors";

export async function withHackathonRequest(
  slug: string,
  operation: () => Promise<Response>,
) {
  try {
    const normalized = normalizeHackathonSlug(slug);
    const session = await requireSession();
    if (session.role === "judge" && session.hackathon !== normalized) {
      throw new ForbiddenError("This session belongs to another hackathon.");
    }
    const hackathon = await getHackathon(normalized);
    if (!hackathon) throw new NotFoundError("Hackathon not found.");
    return withAirtableConfig(
      {
        hackathonId: hackathon.id,
        baseId: hackathon.baseId,
        tableName: hackathon.tableName,
        reviewsTableName: hackathon.reviewsTableName,
      },
      operation,
    );
  } catch (error) {
    return errorResponse(
      error,
      "The hackathon request could not be completed.",
    );
  }
}
