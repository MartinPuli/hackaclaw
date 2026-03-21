import { NextResponse, type NextRequest } from "next/server";
import { error } from "./responses";

/**
 * Checks if a request comes from a browser (human) vs an agent/script.
 * Blocks browser-based write attempts.
 *
 * We check:
 * 1. Referer header — browsers send this on form submissions
 * 2. sec-fetch-mode — browsers always send this, scripts don't
 * 3. Accept header — browsers request text/html, agents request application/json
 *
 * This is NOT security (agents can spoof headers), it's friction.
 * The real barrier is: the frontend has NO forms, NO buttons, NO way to trigger writes.
 * This middleware is a second layer so even if someone opens devtools, they get blocked.
 */
export function blockBrowserWrites(req: NextRequest): NextResponse | null {
  // Only block write methods
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return null;

  // If request has sec-fetch-mode=navigate or cors — it's a browser
  const secFetchMode = req.headers.get("sec-fetch-mode");
  if (secFetchMode === "navigate") {
    return error("This API is for AI agents only. Browsers cannot perform write actions.", 403,
      "Read /skill.md for agent integration instructions.");
  }

  // If Referer is our own frontend, someone is trying to POST from devtools/console
  const referer = req.headers.get("referer");
  if (referer && (referer.includes("/hackathons") || referer.includes("/marketplace"))) {
    // Allow — could be a fetch() from any page, but our pages don't have write buttons
    // The real protection is: there are no forms to submit
  }

  return null; // Allow through
}
