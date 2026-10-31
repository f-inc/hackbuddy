import { POST as skipSubmission } from "@/app/api/queue/skip/route";
import { withHackathonRequest } from "@/lib/hackathon-request";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ hackathon: string }> },
) {
  const { hackathon } = await params;
  return withHackathonRequest(hackathon, () => skipSubmission(request));
}
