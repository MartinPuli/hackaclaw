import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { error, notFound, success } from "@/lib/responses";
import { judgeHackathon } from "@/lib/judge";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/hackathons/:id/check-deadline
 *
 * Called by the frontend countdown or the cron.
 * If deadline passed → triggers judging (with concurrency guard in judgeHackathon).
 * If already judging/completed → returns current state so frontend can transition.
 */
export async function POST(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  const { data: hackathon, error: fetchErr } = await supabaseAdmin
    .from("hackathons")
    .select("id, status, ends_at")
    .eq("id", id)
    .single();

  if (fetchErr || !hackathon) return notFound("Hackathon");

  if (hackathon.status === "completed") {
    return success({ status: "finalized", already: true });
  }
  if (hackathon.status === "judging") {
    return success({ status: "judging", already: true });
  }
  if (hackathon.status === "cancelled") {
    return success({ status: "cancelled", already: true });
  }

  // Scheduled hackathon whose registration deadline (ends_at) has arrived -- open or cancel
  if (hackathon.status === "scheduled") {
    if (hackathon.ends_at && new Date(hackathon.ends_at).getTime() <= Date.now()) {
      // Fetch full hackathon for build_time_seconds and judging_criteria
      const { data: full } = await supabaseAdmin.from("hackathons").select("judging_criteria, build_time_seconds").eq("id", id).single();

      let minPart = 0;
      try {
        const meta = typeof full?.judging_criteria === "string" ? JSON.parse(full.judging_criteria) : full?.judging_criteria;
        if (typeof meta?.min_participants === "number") minPart = meta.min_participants;
      } catch { /* ignore */ }

      const { count: teamCount } = await supabaseAdmin.from("teams").select("*", { count: "exact", head: true }).eq("hackathon_id", id);
      const registered = teamCount || 0;

      if (minPart > 0 && registered < minPart) {
        await supabaseAdmin.from("hackathons").update({ status: "cancelled" }).eq("id", id).eq("status", "scheduled");
        return success({ status: "cancelled", reason: `${registered}/${minPart} participants` });
      }

      // Open: set new ends_at = now + build_time_seconds (the WORK deadline)
      const buildSecs = full?.build_time_seconds || 600;
      const workDeadline = new Date(Date.now() + buildSecs * 1000).toISOString();
      await supabaseAdmin.from("hackathons")
        .update({ status: "open", starts_at: new Date().toISOString(), ends_at: workDeadline })
        .eq("id", id).eq("status", "scheduled");

      const remaining = Math.ceil(buildSecs);
      return success({ status: "open", remaining_seconds: remaining });
    }
    return success({ status: "scheduled" });
  }

  if (!hackathon.ends_at) {
    return error("Hackathon has no deadline set", 400);
  }

  const deadline = new Date(hackathon.ends_at).getTime();
  if (Date.now() < deadline) {
    const remaining = Math.ceil((deadline - Date.now()) / 1000);
    return success({ status: "open", remaining_seconds: remaining });
  }

  // Deadline passed — judge (concurrency-safe)
  try {
    await judgeHackathon(id);
    return success({ status: "finalized", judged: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Auto-judge error:", msg);

    return error("Failed to judge hackathon: " + msg, 500);
  }
}
