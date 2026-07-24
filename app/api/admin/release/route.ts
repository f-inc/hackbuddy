import { releaseSubmission } from "@/lib/airtable";
import { getSession } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { id?: string };
  if (!body.id) {
    return NextResponse.json(
      { error: "Submission ID required." },
      { status: 400 },
    );
  }

  try {
    await releaseSubmission(body.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The submission could not be released.",
      },
      { status: 409 },
    );
  }
}
