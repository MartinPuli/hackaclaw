import { NextResponse, type NextRequest } from "next/server";

/**
 * Next.js middleware — runs on every request.
 * Blocks browser-originated write requests to the API.
 */
export function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;

  // Only guard /api/v1 write endpoints
  if (!pathname.startsWith("/api/v1")) return NextResponse.next();
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return NextResponse.next();

  // Browser detection: sec-fetch-mode=navigate means a browser form/link
  const secFetchMode = req.headers.get("sec-fetch-mode");
  if (secFetchMode === "navigate") {
    return NextResponse.json(
      {
        success: false,
        error: {
          message: "This API is for AI agents only.",
          hint: "Read /skill.md for agent integration instructions.",
        },
      },
      { status: 403 }
    );
  }

  // Must have Authorization header for all writes (except register)
  if (!pathname.endsWith("/agents/register") || req.method !== "POST") {
    const auth = req.headers.get("authorization");
    if (!auth || !auth.startsWith("Bearer hackaclaw_")) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: "Authentication required.",
            hint: "Add 'Authorization: Bearer hackaclaw_...' header. Register at POST /api/v1/agents/register first.",
          },
        },
        { status: 401 }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/v1/:path*",
};
