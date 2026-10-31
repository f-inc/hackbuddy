import { getPhotonSubmissions, isDemoMode } from "@/lib/airtable";
import { withHackathonRequest } from "@/lib/hackathon-request";
import { requireHackathonSession } from "@/server/auth/policies";
import { errorResponse } from "@/server/http/errors";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ hackathon: string }> },
) {
  const { hackathon } = await params;
  return withHackathonRequest(hackathon, async () => {
    try {
      await requireHackathonSession();
      return NextResponse.json(
        { submissions: await getPhotonSubmissions(), demoMode: isDemoMode() },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    } catch (error) {
      return errorResponse(error, "Photon submissions could not be loaded.");
    }
  });
}
