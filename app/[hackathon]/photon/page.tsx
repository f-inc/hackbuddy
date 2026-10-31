import { PhotonView } from "@/components/PhotonView";
import { getHackathon } from "@/lib/hackathons";
import { notFound } from "next/navigation";

export default async function PhotonPage({ params }: {
  params: Promise<{ hackathon: string; id?: string }>;
}) {
  const { hackathon: slug, id } = await params;
  const hackathon = await getHackathon(slug);
  if (!hackathon) notFound();
  return <PhotonView hackathon={hackathon.slug} hackathonName={hackathon.name}
    hackathonImageUrl={hackathon.squareImageUrl} submissionId={id} />;
}
