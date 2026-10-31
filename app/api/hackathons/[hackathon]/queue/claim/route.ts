import { POST as claimSubmission } from "@/app/api/queue/claim/route";
import { withHackathonRequest } from "@/lib/hackathon-request";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ hackathon: string }> },
) {
  const { hackathon } = await params;
  return withHackathonRequest(hackathon, () => claimSubmission(request));
}
