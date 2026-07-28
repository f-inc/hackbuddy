import { ResultsView } from "@/app/results/page";
import { getHackathon } from "@/lib/hackathons";
import { notFound } from "next/navigation";

export default async function HackathonResultsPage({
  params,
}: {
  params: Promise<{ hackathon: string }>;
}) {
  const { hackathon: slug } = await params;
  const hackathon = await getHackathon(slug);
  if (!hackathon) notFound();
  return (
    <ResultsView
      hackathon={hackathon.slug}
      hackathonImageUrl={hackathon.squareImageUrl}
      hackathonName={hackathon.name}
    />
  );
}
