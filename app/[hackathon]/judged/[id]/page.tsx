import { JudgedProjectsView } from "@/components/JudgedProjectsView";
import { getHackathon } from "@/lib/hackathons";
import { notFound } from "next/navigation";

export const metadata = {
  title: "Your project review",
  robots: { index: false, follow: false },
};

export default async function JudgedProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ hackathon: string; id: string }>;
  searchParams: Promise<{ phase?: string }>;
}) {
  const { hackathon: slug, id } = await params;
  const { phase } = await searchParams;
  const hackathon = await getHackathon(slug);
  if (!hackathon) notFound();
  return (
    <JudgedProjectsView
      hackathon={hackathon.slug}
      hackathonName={hackathon.name}
      hackathonImageUrl={hackathon.squareImageUrl}
      submissionId={id}
      initialPhase={phase === "final" ? "final" : "preliminary"}
    />
  );
}
