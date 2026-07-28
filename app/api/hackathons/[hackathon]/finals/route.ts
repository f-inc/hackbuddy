import {
  GET as getFinals,
  PATCH as patchFinals,
  POST as postFinals,
} from "@/app/api/finals/route";
import { withHackathonRequest } from "@/lib/hackathon-request";

type Context = { params: Promise<{ hackathon: string }> };

export async function GET(request: Request, { params }: Context) {
  const { hackathon } = await params;
  return withHackathonRequest(hackathon, () => getFinals(request));
}

export async function POST(request: Request, { params }: Context) {
  const { hackathon } = await params;
  return withHackathonRequest(hackathon, () => postFinals(request));
}

export async function PATCH(request: Request, { params }: Context) {
  const { hackathon } = await params;
  return withHackathonRequest(hackathon, () => patchFinals(request));
}
