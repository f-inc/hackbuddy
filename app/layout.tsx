import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HackBuddy — Hackathon judging",
  description:
    "A focused Airtable-backed queue and scoring workspace for hackathon judges.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

