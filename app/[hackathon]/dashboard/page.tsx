import { DashboardView } from "@/app/dashboard/page";
import { getHackathon } from "@/lib/hackathons";
import { notFound } from "next/navigation";

export default async function HackathonDashboardPage({
  params,
}: {
  params: Promise<{ hackathon: string }>;
}) {
  const { hackathon: slug } = await params;
  const hackathon = await getHackathon(slug);
  if (!hackathon) notFound();
  return (
    <DashboardView
      hackathon={hackathon.slug}
      hackathonImageUrl={hackathon.squareImageUrl}
      hackathonName={hackathon.name}
    />
  );
}
