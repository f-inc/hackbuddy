import { getCompletedResults, isDemoMode } from "@/lib/airtable";
import { getSession } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json({
      results: await getCompletedResults(),
      demoMode: isDemoMode(),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Airtable could not be reached. Check the server configuration." },
      { status: 500 },
    );
  }
}
