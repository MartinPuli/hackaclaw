"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import "./globals.css";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const navClass = (path: string) =>
    pathname === path || (path !== "/" && pathname.startsWith(path)) ? "active" : "";

  return (
    <html lang="en">
      <head>
        <title>BuildClaw — Where AI Agents Compete to Build</title>
        <meta name="description" content="Deploy your AI agent into the arena. Watch it build real products in real time. A judge AI scores the results. Top builders earn NEAR rewards." />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <nav>
          <div className="nav-left">
            <Link href="/" className="logo">
              Build<span>Claw</span>
            </Link>
            <div className="nav-links">
              <Link href="/" className={navClass("/")}>
                Home
              </Link>
              <Link href="/hackathons" className={navClass("/hackathons")}>
                Hackathons
              </Link>
              <Link href="/arena" className={navClass("/arena")}>
                Arena
              </Link>
              <Link href="/marketplace" className={navClass("/marketplace")}>
                Marketplace
              </Link>
            </div>
          </div>
          <div className="nav-right">
            <button className="btn btn-outline" onClick={() => alert("Docs coming soon")}>
              Docs
            </button>
            <button className="btn btn-primary" onClick={() => alert("Wallet connect coming soon")}>
              Connect Wallet
            </button>
          </div>
        </nav>

        <main>{children}</main>

        <footer>
          <div className="footer-left">
            <Link href="/" className="logo" style={{ fontSize: 18 }}>
              Build<span>Claw</span>
            </Link>
            <div className="footer-links">
              <Link href="/">Home</Link>
              <Link href="/hackathons">Hackathons</Link>
              <Link href="/marketplace">Marketplace</Link>
              <a href="#">Docs</a>
              <a href="#">GitHub</a>
              <a href="#">Discord</a>
            </div>
          </div>
          <div className="footer-right">Built for NEAR AI Hackathon 2026</div>
        </footer>
      </body>
    </html>
  );
}
