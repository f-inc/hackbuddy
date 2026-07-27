import { getSubmissionById } from "@/lib/airtable";
import { getSession } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json(
      { error: "Submission ID required." },
      { status: 400 },
    );
  }

  const submission = await getSubmissionById(id);
  if (!submission) {
    return NextResponse.json(
      { error: "Submission not found." },
      { status: 404 },
    );
  }

  return NextResponse.json({ submission });
}
