import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { authenticateRequest } from "@/lib/auth";
import { success, created, error, unauthorized } from "@/lib/responses";
import { getPlatformFeePct } from "@/lib/responses";
import { v4 as uuid } from "uuid";

/**
 * POST /api/v1/hackathons — Create a new hackathon. Requires auth.
 */
export async function POST(req: NextRequest) {
  const agent = await authenticateRequest(req);
  if (!agent) return unauthorized();

  try {
    const body = await req.json();
    const {
      title, description, brief, rules,
      entry_type = "free", entry_fee = 0, prize_pool = 0,
      max_participants = 100,
      team_size_min = 1, team_size_max = 5,
      build_time_seconds = 120,
      challenge_type = "landing_page",
      starts_at, ends_at,
      judging_criteria,
    } = body;

    if (!title || !brief) {
      return error("title and brief are required");
    }

    const id = uuid();
    const platformFee = getPlatformFeePct();

    const { data: hackathon, error: insertErr } = await supabaseAdmin
      .from("hackathons")
      .insert({
        id, title, description: description || null, brief, rules: rules || null,
        entry_type, entry_fee, prize_pool, platform_fee_pct: platformFee,
        max_participants, team_size_min, team_size_max,
        build_time_seconds, challenge_type, status: "open",
        created_by: agent.id,
        starts_at: starts_at || null, ends_at: ends_at || null,
        judging_criteria: judging_criteria || null,
      })
      .select("*")
      .single();

    if (insertErr) return error(insertErr.message, 500);
    return created(hackathon);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return error(msg, 500);
  }
}

/**
 * GET /api/v1/hackathons — List hackathons.
 */
export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status");
  const challengeType = req.nextUrl.searchParams.get("challenge_type");

  let query = supabaseAdmin.from("hackathons").select("*");

  if (status) query = query.eq("status", status);
  if (challengeType) query = query.eq("challenge_type", challengeType);

  const { data: hackathons, error: queryErr } = await query.order("created_at", { ascending: false });

  if (queryErr) return error(queryErr.message, 500);

  // Enrich with team/agent counts
  const enriched = await Promise.all(
    (hackathons || []).map(async (h) => {
      const { count: teamCount } = await supabaseAdmin
        .from("teams")
        .select("*", { count: "exact", head: true })
        .eq("hackathon_id", h.id);

      const { data: members } = await supabaseAdmin
        .from("team_members")
        .select("agent_id, teams!inner(hackathon_id)")
        .eq("teams.hackathon_id", h.id);

      const uniqueAgents = new Set((members || []).map((m: Record<string, unknown>) => m.agent_id));

      return { ...h, total_teams: teamCount || 0, total_agents: uniqueAgents.size };
    })
  );

  return success(enriched);
}
