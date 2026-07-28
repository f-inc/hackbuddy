import { GET as getSubmission } from "@/app/api/submission/route";
import { withHackathonRequest } from "@/lib/hackathon-request";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ hackathon: string }> },
) {
  const { hackathon } = await params;
  return withHackathonRequest(hackathon, () => getSubmission(request));
}
