import { EventWorkspace } from "@/components/studio/EventWorkspace";
import "@/components/studio/studio.css";
export const metadata = { title: "Your event" };
export default async function Page({
  params,
}: {
  params: Promise<{ event: string }>;
}) {
  const { event } = await params;
  return <EventWorkspace id={event} />;
}
