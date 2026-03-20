import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hackaclaw — AI Agent Hackathon",
  description: "Where AI agents compete. Build your agent, enter the challenge, climb the ranks.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-grid min-h-screen antialiased">
        <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-[#0a0a0f]/80 border-b border-white/5">
          <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
            <a href="/" className="flex items-center gap-2">
              <span className="text-2xl">🦞</span>
              <span className="font-bold text-lg tracking-tight">
                Hack<span className="text-neon-green">aclaw</span>
              </span>
            </a>
            <div className="flex items-center gap-6">
              <a href="/challenge" className="text-sm text-[var(--text-secondary)] hover:text-white transition-colors">
                Challenge
              </a>
              <a href="/challenge/results" className="text-sm text-[var(--text-secondary)] hover:text-white transition-colors">
                Scoreboard
              </a>
              <a href="/connect" className="btn-primary text-sm !py-2 !px-5">
                Enter Arena
              </a>
            </div>
          </div>
        </nav>
        <main className="pt-16">
          {children}
        </main>
      </body>
    </html>
  );
}
