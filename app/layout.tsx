import type { Metadata } from "next";
import "./globals.css";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "HackBuddy — Hackathon judging",
    template: "%s | HackBuddy",
  },
  description:
    "Run fair, fast hackathon judging with organized queues, consistent scoring, live results, and polished finalist presentations.",
  applicationName: "HackBuddy",
  keywords: [
    "hackathon judging",
    "hackathon scoring",
    "judge management",
    "project evaluation",
    "hackathon leaderboard",
  ],
  authors: [{ name: "HackBuddy" }],
  creator: "HackBuddy",
  publisher: "HackBuddy",
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: "/favicon.svg",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: "HackBuddy",
    title: "HackBuddy — Hackathon judging",
    description:
      "Run fair, fast hackathon judging with organized queues, consistent scoring, live results, and polished finalist presentations.",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "HackBuddy",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "HackBuddy — Hackathon judging",
    description:
      "Run fair, fast hackathon judging with organized queues, consistent scoring, live results, and polished finalist presentations.",
    images: ["/opengraph-image"],
  },
  robots: {
    index: true,
    follow: true,
  },
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
