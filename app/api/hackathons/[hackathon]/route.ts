import { getHackathon } from "@/lib/hackathons";
import { errorResponse, NotFoundError } from "@/server/http/errors";
import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  context: { params: Promise<{ hackathon: string }> },
) {
  try {
    const { hackathon: slug } = await context.params;
    const hackathon = await getHackathon(slug);
    if (!hackathon) throw new NotFoundError("Hackathon not found.");
    return NextResponse.json({
      hackathon: {
        name: hackathon.name,
        slug: hackathon.slug,
      },
    });
  } catch (error) {
    return errorResponse(error, "The hackathon could not be loaded.");
  }
}
