import { ProjectsView } from "@/components/ProjectsView";
import { getHackathon } from "@/lib/hackathons";
import { notFound } from "next/navigation";
export default async function ProjectsPage({
  params,
}: {
  params: Promise<{ hackathon: string; id?: string }>;
}) {
  const { hackathon, id } = await params;
  const event = await getHackathon(hackathon);
  if (!event) notFound();
  return (
    <ProjectsView
      hackathon={event.slug}
      hackathonName={event.name}
      hackathonImageUrl={event.squareImageUrl}
      submissionId={id}
    />
  );
}
