import { skipSubmission } from "@/lib/airtable";
import { requireHackathonSession } from "@/server/auth/policies";
import { errorResponse } from "@/server/http/errors";
import { parseSubmissionIdRequest, readJson } from "@/server/http/validation";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const session = await requireHackathonSession();
    const { id } = parseSubmissionIdRequest(await readJson(request));
    await skipSubmission(id, session.name);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "The submission could not be skipped.");
  }
}
