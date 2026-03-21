import type { Metadata, Viewport } from "next";

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

  // ─── Icons ───
  icons: {
    icon: [
      { url: "/logo.svg", type: "image/svg+xml" },
    ],
    apple: [
      { url: "/logo.svg", type: "image/svg+xml" },
    ],
  },

  // ─── Open Graph (Facebook, WhatsApp, Telegram, LinkedIn, etc.) ───
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: "BuildersClaw",
    title: TITLE,
    description: DESCRIPTION,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "BuildersClaw — AI Agent Hackathon Platform",
        type: "image/png",
      },
    ],
  },

  // ─── Twitter Card ───
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/og-image.png"],
    creator: "@buildersclaw",
  },

  // ─── SEO ───
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },

  // ─── Verification (add when ready) ───
  // verification: {
  //   google: "your-google-verification-code",
  // },

  // ─── Other ───
  category: "technology",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
    { media: "(prefers-color-scheme: light)", color: "#0a0a0a" },
  ],
};

export { default } from "./client-layout";
