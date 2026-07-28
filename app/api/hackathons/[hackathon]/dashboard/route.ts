import { GET as getDashboard } from "@/app/api/dashboard/route";
import { withHackathonRequest } from "@/lib/hackathon-request";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ hackathon: string }> },
) {
  const { hackathon } = await params;
  return withHackathonRequest(hackathon, () => getDashboard());
}
