import { JudgingView } from "@/app/judging/page";
import { getHackathon } from "@/lib/hackathons";
import { notFound } from "next/navigation";

export default async function HackathonJudgingPage({
  params,
}: {
  params: Promise<{ hackathon: string }>;
}) {
  const { hackathon: slug } = await params;
  const hackathon = await getHackathon(slug);
  if (!hackathon) notFound();
  return (
    <JudgingView
      hackathon={hackathon.slug}
      hackathonImageUrl={hackathon.squareImageUrl}
      hackathonName={hackathon.name}
    />
  );
}
