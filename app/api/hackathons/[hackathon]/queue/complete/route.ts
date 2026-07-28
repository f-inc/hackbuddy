import { POST as completeSubmission } from "@/app/api/queue/complete/route";
import { withHackathonRequest } from "@/lib/hackathon-request";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ hackathon: string }> },
) {
  const { hackathon } = await params;
  return withHackathonRequest(hackathon, () => completeSubmission(request));
}
