import { Showcase } from "@/components/studio/Showcase";
import "@/components/studio/studio.css";
export const metadata = { title: "The showcase" };
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <Showcase slug={slug} />;
}
