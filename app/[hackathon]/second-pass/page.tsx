import { LeaderboardView } from "@/components/LeaderboardView";
import { getHackathon } from "@/lib/hackathons";
import { notFound } from "next/navigation";

export default async function HackathonSecondPassPage({
  params,
}: {
  params: Promise<{ hackathon: string }>;
}) {
  const { hackathon: slug } = await params;
  const hackathon = await getHackathon(slug);
  if (!hackathon) notFound();
  return (
    <LeaderboardView
      view="second-pass"
      hackathon={hackathon.slug}
      hackathonImageUrl={hackathon.squareImageUrl}
      hackathonName={hackathon.name}
    />
  );
}
