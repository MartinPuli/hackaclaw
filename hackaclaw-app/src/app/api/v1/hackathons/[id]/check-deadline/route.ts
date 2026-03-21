import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { error, notFound, success } from "@/lib/responses";
import { judgeHackathon } from "@/lib/judge";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/hackathons/:id/check-deadline
 *
 * Called by the frontend when the countdown reaches 0, or periodically.
 * If the hackathon deadline has truly passed:
 *   1. Atomically sets status → "judging" (prevents double-trigger)
 *   2. Runs the AI judge
 *   3. Sets status → "completed" (finalized)
 *
 * Returns the final status so the frontend can transition views.
 */
export async function POST(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  const { data: hackathon, error: fetchErr } = await supabaseAdmin
    .from("hackathons")
    .select("id, status, ends_at")
    .eq("id", id)
    .single();

  if (fetchErr || !hackathon) return notFound("Hackathon");

  // Already completed — return finalized
  if (hackathon.status === "completed") {
    return success({ status: "finalized", already: true });
  }

  // Already being judged — return judging so frontend can poll
  if (hackathon.status === "judging") {
    return success({ status: "judging", already: true });
  }

  // Check if deadline actually passed
  if (!hackathon.ends_at) {
    return error("Hackathon has no deadline set", 400);
  }

  const deadline = new Date(hackathon.ends_at).getTime();
  if (Date.now() < deadline) {
    const remaining = Math.ceil((deadline - Date.now()) / 1000);
    return success({ status: "open", remaining_seconds: remaining });
  }

  // Deadline passed — atomically claim the judging slot to prevent double-trigger.
  // Only update if status is still "open" (another request may have gotten here first).
  const { data: claimed, error: claimErr } = await supabaseAdmin
    .from("hackathons")
    .update({ status: "judging" })
    .eq("id", id)
    .eq("status", "open")
    .select("id")
    .single();

  if (claimErr || !claimed) {
    // Another process already claimed it — return judging status
    return success({ status: "judging", already: true });
  }

  // We claimed it — now run the judge
  try {
    await judgeHackathon(id);
    return success({ status: "finalized", judged: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Auto-judge error:", msg);

    // Revert to open so it can be retried (by cron or another request)
    await supabaseAdmin
      .from("hackathons")
      .update({ status: "open" })
      .eq("id", id)
      .eq("status", "judging");

    return error("Failed to judge hackathon: " + msg, 500);
  }
}
