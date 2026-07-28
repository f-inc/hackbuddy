import {
  createHackathon,
  listHackathons,
  updateHackathon,
} from "@/lib/hackathons";
import { requireAdmin } from "@/server/auth/policies";
import { errorResponse } from "@/server/http/errors";
import {
  parseCreateHackathonRequest,
  parseUpdateHackathonRequest,
  readJson,
} from "@/server/http/validation";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json({ hackathons: await listHackathons() });
  } catch (error) {
    return errorResponse(error, "Hackathons could not be loaded.");
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const input = parseCreateHackathonRequest(await readJson(request));
    return NextResponse.json(
      { hackathon: await createHackathon(input) },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error, "Hackathon could not be created.");
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdmin();
    const { id, ...input } = parseUpdateHackathonRequest(
      await readJson(request),
    );
    return NextResponse.json({
      hackathon: await updateHackathon(id, input),
    });
  } catch (error) {
    return errorResponse(error, "Hackathon could not be updated.");
  }
}
