import { StudioHome } from "@/components/studio/StudioHome";
import "@/components/studio/studio.css";
export const metadata = {
  title: "Hackathon judging",
  description:
    "Import hackathon submissions, assign judges, score demos, and present your finalists with HackBuddy.",
};
export default function Page() {
  return <StudioHome />;
}
