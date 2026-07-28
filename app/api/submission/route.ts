import { getSubmissionById } from "@/lib/airtable";
import { requireHackathonSession } from "@/server/auth/policies";
import {
  errorResponse,
  NotFoundError,
  ValidationError,
} from "@/server/http/errors";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    await requireHackathonSession();
    const id = new URL(request.url).searchParams.get("id");
    if (!id) throw new ValidationError("Submission ID is required.");
    const submission = await getSubmissionById(id);
    if (!submission) throw new NotFoundError("Submission not found.");
    return NextResponse.json({ submission });
  } catch (error) {
    return errorResponse(error, "The submission could not be loaded.");
  }
}
