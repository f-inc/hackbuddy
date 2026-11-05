import { EventConfig } from "@/components/EventConfig";
import { getHackathon } from "@/lib/hackathons";
export default async function EventLayout({
  params,
  children,
}: {
  params: Promise<{ hackathon: string }>;
  children: React.ReactNode;
}) {
  const { hackathon } = await params;
  const event = await getHackathon(hackathon);
  return (
    <EventConfig settings={event?.settings} managed={event?.storage === "database"}>
      {children}
    </EventConfig>
  );
}
