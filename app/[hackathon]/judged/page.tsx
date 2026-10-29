import { JudgedProjectsView } from "@/components/JudgedProjectsView";
import { getHackathon } from "@/lib/hackathons";
import { notFound } from "next/navigation";

export const metadata = {
  title: "Projects judged",
  robots: { index: false, follow: false },
};

export default async function JudgedProjectsPage({
  params,
}: {
  params: Promise<{ hackathon: string }>;
}) {
  const { hackathon: slug } = await params;
  const hackathon = await getHackathon(slug);
  if (!hackathon) notFound();
  return (
    <JudgedProjectsView
      hackathon={hackathon.slug}
      hackathonName={hackathon.name}
      hackathonImageUrl={hackathon.squareImageUrl}
    />
  );
}
