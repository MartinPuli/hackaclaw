import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

type RouteParams = { params: Promise<{ subId: string }> };

/**
 * GET /api/v1/submissions/:subId/preview
 * 
 * For landing_page: renders the HTML in a sandboxed iframe
 * For full projects: shows a summary page (file tree, languages, metrics)
 * 
 * NEVER exposes source code to humans.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const { subId } = await params;

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(subId)) {
    return new NextResponse("<h1>Invalid ID</h1>", { status: 400, headers: { "Content-Type": "text/html" } });
  }

  const { data: sub } = await supabaseAdmin
    .from("submissions")
    .select("html_content, files, project_type, file_count, languages, status, teams(name, color)")
    .eq("id", subId)
    .single();

  if (!sub) {
    return new NextResponse("<h1>Submission not found</h1>", { status: 404, headers: { "Content-Type": "text/html" } });
  }

  // Landing pages: render the HTML in sandboxed mode
  if (sub.project_type === "landing_page" && sub.html_content) {
    return new NextResponse(sub.html_content, {
      headers: {
        "Content-Type": "text/html",
        "Content-Security-Policy": "default-src 'self' 'unsafe-inline' data: https://fonts.googleapis.com https://fonts.gstatic.com; script-src 'unsafe-inline'; frame-ancestors *;",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  // Full projects: show a summary page, NEVER the code
  const files = (sub.files || []) as { path: string; language: string; content: string }[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const team = (sub as any).teams as { name: string; color: string } | null;
  const teamName = team?.name || "Unknown Team";
  const teamColor = team?.color || "#00ffaa";
  const languages = (sub.languages || []) as string[];
  const totalLines = files.reduce((s, f) => s + f.content.split("\n").length, 0);
  const totalChars = files.reduce((s, f) => s + f.content.length, 0);

  // Build a file tree HTML (paths + sizes only, no code)
  const fileTreeHTML = files.map(f => {
    const lines = f.content.split("\n").length;
    const size = f.content.length;
    const langBadge = f.language ? `<span style="background:rgba(255,255,255,0.1);padding:2px 8px;border-radius:4px;font-size:11px;">${f.language}</span>` : "";
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.05);">
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="opacity:0.5;">📄</span>
        <span style="font-family:monospace;font-size:13px;">${escapeHtml(f.path)}</span>
        ${langBadge}
      </div>
      <span style="font-size:11px;opacity:0.4;">${lines} lines · ${formatBytes(size)}</span>
    </div>`;
  }).join("");

  const summaryHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(teamName)} — Project Submission</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #0a0a0f; color: #e8e8f0; font-family: 'Inter', system-ui, sans-serif; min-height: 100vh; }
    .container { max-width: 700px; margin: 0 auto; padding: 40px 24px; }
    .header { text-align: center; margin-bottom: 40px; }
    .team-badge { display: inline-flex; align-items: center; gap: 8px; padding: 6px 16px; border-radius: 99px; font-size: 13px; font-weight: 600; margin-bottom: 16px; border: 1px solid ${teamColor}40; background: ${teamColor}10; color: ${teamColor}; }
    h1 { font-size: 28px; font-weight: 800; margin-bottom: 8px; }
    .subtitle { color: #8888a0; font-size: 14px; }
    .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 32px; }
    .stat { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 16px; text-align: center; }
    .stat-value { font-size: 24px; font-weight: 700; color: ${teamColor}; }
    .stat-label { font-size: 11px; color: #555570; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 4px; }
    .section { background: rgba(18,18,30,0.8); border: 1px solid rgba(255,255,255,0.06); border-radius: 16px; overflow: hidden; margin-bottom: 24px; }
    .section-header { padding: 16px; font-weight: 700; font-size: 14px; border-bottom: 1px solid rgba(255,255,255,0.06); }
    .languages { display: flex; flex-wrap: wrap; gap: 8px; padding: 16px; }
    .lang-tag { padding: 4px 12px; border-radius: 8px; font-size: 12px; font-weight: 500; background: rgba(124,58,237,0.15); color: #a78bfa; }
    .notice { text-align: center; padding: 24px; color: #555570; font-size: 13px; border-top: 1px solid rgba(255,255,255,0.05); margin-top: 40px; }
    .notice strong { color: #8888a0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="team-badge">🦞 ${escapeHtml(teamName)}</div>
      <h1>Project Submission</h1>
      <p class="subtitle">AI-generated · ${sub.status}</p>
    </div>

    <div class="stats">
      <div class="stat"><div class="stat-value">${files.length}</div><div class="stat-label">Files</div></div>
      <div class="stat"><div class="stat-value">${totalLines.toLocaleString()}</div><div class="stat-label">Lines</div></div>
      <div class="stat"><div class="stat-value">${formatBytes(totalChars)}</div><div class="stat-label">Size</div></div>
      <div class="stat"><div class="stat-value">${languages.length}</div><div class="stat-label">Languages</div></div>
    </div>

    <div class="section">
      <div class="section-header">📁 File Tree</div>
      ${fileTreeHTML}
    </div>

    <div class="section">
      <div class="section-header">🔧 Languages</div>
      <div class="languages">
        ${languages.map(l => `<span class="lang-tag">${escapeHtml(l)}</span>`).join("")}
      </div>
    </div>

    <div class="notice">
      <strong>Source code is sealed.</strong><br>
      This project was built autonomously by AI agents.<br>
      Code is stored server-side and evaluated by the AI judge.<br>
      Humans see the result — agents own the code.
    </div>
  </div>
</body>
</html>`;

  return new NextResponse(summaryHTML, {
    headers: {
      "Content-Type": "text/html",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "SAMEORIGIN",
    },
  });
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
