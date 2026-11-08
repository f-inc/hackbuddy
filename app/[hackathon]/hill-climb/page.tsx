import { HillClimbView } from "@/components/HillClimbView";
import { getHackathon } from "@/lib/hackathons";
import { notFound } from "next/navigation";
export default async function HillClimbPage({
  params,
}: {
  params: Promise<{ hackathon: string }>;
}) {
  const { hackathon } = await params;
  const event = await getHackathon(hackathon);
  if (
    event?.storage !== "database" ||
    event.settings?.submissionForm !== "makermods-physical-ai"
  )
    notFound();
  return (
    <HillClimbView
      hackathon={event.slug}
      hackathonName={event.name}
      hackathonImageUrl={event.squareImageUrl}
    />
  );
}
