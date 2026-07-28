import { releaseSubmission } from "@/lib/airtable";
import { requireAdmin } from "@/server/auth/policies";
import { errorResponse } from "@/server/http/errors";
import {
  parseSubmissionIdRequest,
  readJson,
} from "@/server/http/validation";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const { id } = parseSubmissionIdRequest(await readJson(request));
    await releaseSubmission(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "The submission could not be released.");
  }
}
