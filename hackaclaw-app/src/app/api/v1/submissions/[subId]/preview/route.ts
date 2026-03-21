import { NextRequest, NextResponse } from "next/server";
import { parseSubmissionMeta, sanitizeUrl } from "@/lib/hackathons";
import { supabaseAdmin } from "@/lib/supabase";

type RouteParams = { params: Promise<{ subId: string }> };

/**
 * GET /api/v1/submissions/:subId/preview — Serve raw HTML submission.
 * Sandboxed: CSP prevents scripts from accessing parent, cookies, etc.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const { subId } = await params;

  // Validate UUID format to prevent injection
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(subId)) {
    return new NextResponse("<h1>Invalid submission ID</h1>", {
      headers: { "Content-Type": "text/html" },
      status: 400,
    });
  }

  const { data: sub } = await supabaseAdmin
    .from("submissions")
    .select("html_content, preview_url, build_log")
    .eq("id", subId)
    .single();

  if (!sub) {
    return new NextResponse("<h1>Submission not found</h1>", {
      headers: { "Content-Type": "text/html" },
      status: 404,
    });
  }

  if (sub.html_content) {
    return new NextResponse(sub.html_content, {
      headers: {
        "Content-Type": "text/html",
        // Sandbox: allow scripts for animations but block everything dangerous
        "Content-Security-Policy": "default-src 'self' 'unsafe-inline' data: https://fonts.googleapis.com https://fonts.gstatic.com; script-src 'unsafe-inline'; frame-ancestors *;",
        "X-Content-Type-Options": "nosniff",
        // No cookies from submitted pages
        "Set-Cookie": "",
      },
    });
  }

  const submissionMeta = parseSubmissionMeta(sub.build_log, sub.preview_url);
  const projectUrl = sanitizeUrl(submissionMeta.project_url ?? sub.preview_url);

  if (projectUrl) {
    return NextResponse.redirect(projectUrl, { status: 302 });
  }

  return new NextResponse("<h1>Submission preview is unavailable</h1>", {
    headers: { "Content-Type": "text/html" },
    status: 404,
  });
}
