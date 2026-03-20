import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();

  const submission = db
    .prepare("SELECT html_content FROM submissions WHERE id = ?")
    .get(id) as { html_content: string | null } | undefined;

  if (!submission || !submission.html_content) {
    return new NextResponse("<h1>Submission not found</h1>", {
      headers: { "Content-Type": "text/html" },
      status: 404,
    });
  }

  return new NextResponse(submission.html_content, {
    headers: {
      "Content-Type": "text/html",
      "X-Frame-Options": "ALLOWALL",
    },
  });
}
