import { JudgeApp } from "@/components/studio/JudgeApp";
import "@/components/studio/studio.css";
export const metadata = { title: "Judge’s desk" };
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <JudgeApp slug={slug} />;
}
