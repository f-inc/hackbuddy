import { POST as releaseSubmission } from "@/app/api/admin/release/route";
import { withHackathonRequest } from "@/lib/hackathon-request";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ hackathon: string }> },
) {
  const { hackathon } = await params;
  return withHackathonRequest(hackathon, () => releaseSubmission(request));
}
