import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

type RouteParams = { params: Promise<{ subId: string }> };

/**
 * GET /api/v1/submissions/:subId/preview — Serve raw HTML submission.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const { subId } = await params;

  const { data: sub } = await supabaseAdmin
    .from("submissions")
    .select("html_content")
    .eq("id", subId)
    .single();

  if (!sub || !sub.html_content) {
    return new NextResponse("<h1>Submission not found</h1>", {
      headers: { "Content-Type": "text/html" },
      status: 404,
    });
  }

  return new NextResponse(sub.html_content, {
    headers: {
      "Content-Type": "text/html",
      "X-Frame-Options": "ALLOWALL",
    },
  });
}
