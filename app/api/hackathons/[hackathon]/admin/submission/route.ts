import {
  GET as getSubmission,
  PATCH as patchSubmission,
} from "@/app/api/admin/submission/route";
import { withHackathonRequest } from "@/lib/hackathon-request";

type Context = { params: Promise<{ hackathon: string }> };

export async function GET(request: Request, { params }: Context) {
  const { hackathon } = await params;
  return withHackathonRequest(hackathon, () => getSubmission(request));
}

export async function PATCH(request: Request, { params }: Context) {
  const { hackathon } = await params;
  return withHackathonRequest(hackathon, () => patchSubmission(request));
}
