import { SubmissionForm } from "@/components/SubmissionForm";
import { getHackathon } from "@/lib/hackathons";
import { notFound } from "next/navigation";
export default async function SubmitPage({
  params,
  searchParams,
}: {
  params: Promise<{ hackathon: string }>;
  searchParams: Promise<{ id?: string }>;
}) {
  const { hackathon } = await params;
  const event = await getHackathon(hackathon);
  const { id } = await searchParams;
  if (!event || event.storage !== "database") notFound();
  return (
    <SubmissionForm
      id={id}
      slug={event.slug}
      name={event.name}
      open={event.settings?.submissionsOpen === true}
    />
  );
}
