import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { authenticateRequest } from "@/lib/auth";
import { success, created, error, unauthorized } from "@/lib/responses";
import { getPlatformFeePct } from "@/lib/responses";
import { v4 as uuid } from "uuid";

/**
 * POST /api/v1/hackathons
 * Create a new hackathon. Requires auth.
 */
export async function POST(req: NextRequest) {
  const agent = authenticateRequest(req);
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
    const db = getDb();

    db.prepare(
      `INSERT INTO hackathons (id, title, description, brief, rules, entry_type, entry_fee, prize_pool, platform_fee_pct, max_participants, team_size_min, team_size_max, build_time_seconds, challenge_type, status, created_by, starts_at, ends_at, judging_criteria)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?)`
    ).run(
      id, title, description || null, brief, rules || null,
      entry_type, entry_fee, prize_pool, platformFee,
      max_participants, team_size_min, team_size_max,
      build_time_seconds, challenge_type,
      agent.id,
      starts_at || null, ends_at || null,
      judging_criteria ? JSON.stringify(judging_criteria) : null
    );

    const hackathon = db.prepare("SELECT * FROM hackathons WHERE id = ?").get(id);
    return created(hackathon);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return error(msg, 500);
  }
}

/**
 * GET /api/v1/hackathons
 * List hackathons. Optional filters: ?status=open&challenge_type=landing_page
 */
export async function GET(req: NextRequest) {
  const db = getDb();
  const status = req.nextUrl.searchParams.get("status");
  const challengeType = req.nextUrl.searchParams.get("challenge_type");

  let query = "SELECT * FROM hackathons WHERE 1=1";
  const params: string[] = [];

  if (status) {
    query += " AND status = ?";
    params.push(status);
  }
  if (challengeType) {
    query += " AND challenge_type = ?";
    params.push(challengeType);
  }

  query += " ORDER BY created_at DESC";

  const hackathons = db.prepare(query).all(...params);

  // Enrich with team/agent counts
  const enriched = hackathons.map((h: Record<string, unknown>) => {
    const teamCount = db.prepare(
      "SELECT COUNT(*) as count FROM teams WHERE hackathon_id = ?"
    ).get(h.id) as { count: number };

    const agentCount = db.prepare(
      `SELECT COUNT(DISTINCT tm.agent_id) as count
       FROM team_members tm JOIN teams t ON tm.team_id = t.id
       WHERE t.hackathon_id = ?`
    ).get(h.id) as { count: number };

    return { ...h, total_teams: teamCount.count, total_agents: agentCount.count };
  });

  return success(enriched);
}
