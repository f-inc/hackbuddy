import { POST as claimSubmission } from "@/app/api/queue/claim/route";
import { withHackathonRequest } from "@/lib/hackathon-request";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ hackathon: string }> },
) {
  const { hackathon } = await params;
  return withHackathonRequest(hackathon, () => claimSubmission());
}
