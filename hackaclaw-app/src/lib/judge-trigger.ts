import { supabaseAdmin } from "./supabase";
import { judgeHackathon } from "./judge";

/**
 * Find hackathons that have passed their ends_at deadline and trigger judging.
 * Only triggers for platform-judged hackathons. Custom-judge hackathons wait
 * for the enterprise's own judge agent to submit scores.
 * 
 * Called by the cron endpoint (/api/v1/cron/judge).
 * 
 * Also recovers "stuck" hackathons that are in "judging" status for > 10 min
 * (likely a previous judge run that crashed).
 */
export async function processExpiredHackathons() {
  const now = new Date().toISOString();
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

  // Find hackathons where ends_at has passed and they are still "open"
  const { data: expiredOpen, error: err1 } = await supabaseAdmin
    .from("hackathons")
    .select("id, title, ends_at, judging_criteria, status")
    .lt("ends_at", now)
    .eq("status", "open");

  // Find hackathons stuck in "judging" for > 10 minutes (crashed judge)
  const { data: stuckJudging, error: err2 } = await supabaseAdmin
    .from("hackathons")
    .select("id, title, ends_at, judging_criteria, status")
    .eq("status", "judging")
    .lt("ends_at", tenMinAgo);

  if (err1) console.error("Error fetching expired hackathons:", err1);
  if (err2) console.error("Error fetching stuck hackathons:", err2);

  const expiredHackathons = [
    ...(expiredOpen || []),
    ...(stuckJudging || []),
  ];

  if (expiredHackathons.length === 0) {
    console.log("No expired hackathons to judge.");
    return { count: 0, processed: [] };
  }

  const processed = [];

  for (const hackathon of expiredHackathons) {
    // Skip custom-judge hackathons — they wait for the enterprise's judge agent
    let isCustomJudge = false;
    try {
      const meta = typeof hackathon.judging_criteria === "string"
        ? JSON.parse(hackathon.judging_criteria)
        : hackathon.judging_criteria;
      isCustomJudge = meta?.judge_type === "custom";
    } catch { /* ignore */ }

    if (isCustomJudge) {
      console.log(`Skipping custom-judge hackathon: ${hackathon.title} (${hackathon.id})`);
      processed.push({ id: hackathon.id, title: hackathon.title, skipped: true, reason: "custom_judge" });
      continue;
    }

    // Atomically claim judging slot (only if still "open" or stuck in "judging")
    const { data: claimed, error: claimErr } = await supabaseAdmin
      .from("hackathons")
      .update({ status: "judging" })
      .eq("id", hackathon.id)
      .in("status", ["open", "judging"])
      .select("id")
      .single();

    if (claimErr || !claimed) {
      // Already being handled by another process
      processed.push({ id: hackathon.id, title: hackathon.title, skipped: true, reason: "already_claimed" });
      continue;
    }

    try {
      console.log(`Starting automated judging for: ${hackathon.title} (${hackathon.id})`);
      await judgeHackathon(hackathon.id);
      processed.push({ id: hackathon.id, title: hackathon.title, success: true });
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      console.error(`Failed to judge hackathon ${hackathon.id}:`, e);

      // Revert to open so next cron run can retry
      await supabaseAdmin
        .from("hackathons")
        .update({ status: "open" })
        .eq("id", hackathon.id)
        .eq("status", "judging");

      processed.push({ id: hackathon.id, title: hackathon.title, success: false, error: errMsg });
    }
  }

  return { count: processed.length, processed };
}
