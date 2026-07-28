import { LoginScreen } from "@/components/LoginScreen";
import { getHackathon } from "@/lib/hackathons";
import { notFound } from "next/navigation";

export default async function HackathonLoginPage({
  params,
}: {
  params: Promise<{ hackathon: string }>;
}) {
  const { hackathon: slug } = await params;
  const hackathon = await getHackathon(slug);
  if (!hackathon) notFound();
  return (
    <LoginScreen
      hackathon={hackathon.slug}
      hackathonName={hackathon.name}
    />
  );
}
