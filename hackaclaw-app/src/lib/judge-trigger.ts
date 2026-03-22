import { supabaseAdmin } from "./supabase";
import { judgeHackathon } from "./judge";

/**
 * 1. Open or cancel scheduled hackathons whose registration deadline (ends_at) has arrived.
 *    On open: sets ends_at = now + build_time_seconds (the work period).
 * 2. Judge expired hackathons (open/in_progress) whose work deadline (ends_at) has passed.
 *
 * Called daily by Vercel cron + on-demand via check-deadline + list page visits.
 */
export async function processExpiredHackathons() {
  const now = new Date().toISOString();
  const processed: Array<{ id: string; title: string; action: string; success?: boolean; skipped?: boolean; reason?: string; error?: string }> = [];

  // ── Phase 1: Open or cancel scheduled hackathons whose ends_at (registration deadline) has arrived ──
  const { data: scheduled } = await supabaseAdmin
    .from("hackathons")
    .select("id, title, starts_at, ends_at, build_time_seconds, judging_criteria")
    .eq("status", "scheduled")
    .lte("ends_at", now);

  const justOpenedIds = new Set<string>();

  if (scheduled && scheduled.length > 0) {
    for (const h of scheduled) {
      let minPart = 0;
      try {
        const meta = typeof h.judging_criteria === "string"
          ? JSON.parse(h.judging_criteria) : h.judging_criteria;
        if (typeof meta?.min_participants === "number") minPart = meta.min_participants;
      } catch { /* ignore */ }

      const { count: teamCount } = await supabaseAdmin
        .from("teams")
        .select("*", { count: "exact", head: true })
        .eq("hackathon_id", h.id);

      const registered = teamCount || 0;

      if (minPart > 0 && registered < minPart) {
        const { error: cancelErr } = await supabaseAdmin
          .from("hackathons")
          .update({ status: "cancelled" })
          .eq("id", h.id)
          .eq("status", "scheduled");
        if (!cancelErr) {
          console.log(`Cancelled hackathon (${registered}/${minPart} participants): ${h.title} (${h.id})`);
          processed.push({ id: h.id, title: h.title, action: "cancelled", success: true, reason: `${registered}/${minPart} participants` });
        }
      } else {
        // Open: set starts_at=now, ends_at=now+build_time_seconds (the WORK deadline)
        const buildSecs = h.build_time_seconds || 600;
        const workDeadline = new Date(Date.now() + buildSecs * 1000).toISOString();
        const { error: updErr } = await supabaseAdmin
          .from("hackathons")
          .update({ status: "open", starts_at: now, ends_at: workDeadline })
          .eq("id", h.id)
          .eq("status", "scheduled");
        if (!updErr) {
          justOpenedIds.add(h.id);
          console.log(`Opened hackathon (${registered} participants, work until ${workDeadline}): ${h.title} (${h.id})`);
          processed.push({ id: h.id, title: h.title, action: "opened", success: true });
        }
      }
    }
  }

  // ── Phase 2: Judge expired hackathons (open or in_progress) — skip just-opened ones ──
  const { data: expiredHackathons, error: fetchErr } = await supabaseAdmin
    .from("hackathons")
    .select("id, title, ends_at, judging_criteria, status")
    .lt("ends_at", now)
    .in("status", ["open", "in_progress"]);

  if (fetchErr) {
    console.error("Error fetching expired hackathons:", fetchErr);
    return { count: processed.length, processed };
  }

  if (!expiredHackathons || expiredHackathons.length === 0) {
    if (processed.length === 0) console.log("No hackathons to process.");
    return { count: processed.length, processed };
  }

  for (const hackathon of expiredHackathons) {
    // Skip hackathons that were just opened in Phase 1 (they need time to run)
    if (justOpenedIds.has(hackathon.id)) continue;

    let isCustomJudge = false;
    try {
      const meta = typeof hackathon.judging_criteria === "string"
        ? JSON.parse(hackathon.judging_criteria)
        : hackathon.judging_criteria;
      isCustomJudge = meta?.judge_type === "custom";
    } catch { /* ignore */ }

    if (isCustomJudge) {
      console.log(`Skipping custom-judge hackathon: ${hackathon.title} (${hackathon.id})`);
      processed.push({ id: hackathon.id, title: hackathon.title, action: "judge", skipped: true, reason: "custom_judge" });
      continue;
    }

    try {
      console.log(`Auto-judging: ${hackathon.title} (${hackathon.id})`);
      await judgeHackathon(hackathon.id);
      processed.push({ id: hackathon.id, title: hackathon.title, action: "judged", success: true });
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      console.error(`Failed to judge hackathon ${hackathon.id}:`, errMsg);
      processed.push({ id: hackathon.id, title: hackathon.title, action: "judge", success: false, error: errMsg });
    }
  }

  return { count: processed.length, processed };
}
