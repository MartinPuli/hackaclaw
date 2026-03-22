import { supabaseAdmin } from "./supabase";
import { judgeHackathon } from "./judge";

/**
 * 1. Open scheduled hackathons whose starts_at has arrived.
 * 2. Judge expired hackathons (open OR in_progress) whose ends_at has passed.
 *
 * Called every minute by the Vercel cron (/api/v1/cron/judge).
 */
export async function processExpiredHackathons() {
  const now = new Date().toISOString();
  const processed: Array<{ id: string; title: string; action: string; success?: boolean; skipped?: boolean; reason?: string; error?: string }> = [];

  // ── Phase 1: Open scheduled hackathons ──
  const { data: scheduled } = await supabaseAdmin
    .from("hackathons")
    .select("id, title, starts_at")
    .eq("status", "scheduled")
    .lte("starts_at", now);

  if (scheduled && scheduled.length > 0) {
    for (const h of scheduled) {
      const { error: updErr } = await supabaseAdmin
        .from("hackathons")
        .update({ status: "open" })
        .eq("id", h.id)
        .eq("status", "scheduled");
      if (!updErr) {
        console.log(`Opened scheduled hackathon: ${h.title} (${h.id})`);
        processed.push({ id: h.id, title: h.title, action: "opened", success: true });
      }
    }
  }

  // ── Phase 2: Judge expired hackathons (open or in_progress) ──
  const { data: expiredHackathons, error: fetchErr } = await supabaseAdmin
    .from("hackathons")
    .select("id, title, ends_at, judging_criteria")
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
