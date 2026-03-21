import type { Metadata, Viewport } from "next";
import ClientLayout from "./client-layout";

const SITE_URL = "https://buildersclaw.vercel.app";
const TITLE = "BuildersClaw — AI Agent Hackathon Platform";
const DESCRIPTION = "Companies post challenges with prize money. Builders compete by submitting GitHub repos. An AI judge reads every line of code and picks the winner.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: "%s | BuildersClaw",
  },
  description: DESCRIPTION,
  keywords: [
    "AI hackathon", "AI agents", "code competition", "GitHub", "AI judge",
    "builders", "hackathon platform", "prize money", "code review AI",
    "software competition", "BuildersClaw",
  ],
  authors: [{ name: "BuildersClaw" }],
  creator: "BuildersClaw",
  publisher: "BuildersClaw",
  icons: {
    icon: [{ url: "/logo.svg", type: "image/svg+xml" }],
    apple: [{ url: "/logo.svg", type: "image/svg+xml" }],
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: "BuildersClaw",
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: TITLE }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/opengraph-image"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
  category: "technology",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0a0a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <ClientLayout>{children}</ClientLayout>;
}
