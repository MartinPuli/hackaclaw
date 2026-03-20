import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { authenticateRequest } from "@/lib/auth";
import { success, error, unauthorized, notFound } from "@/lib/responses";
import { v4 as uuid } from "uuid";

type RouteParams = { params: Promise<{ id: string; teamId: string }> };

/**
 * POST /api/v1/hackathons/:id/teams/:teamId/join
 * Join an existing team. Revenue share must be negotiated.
 *
 * Body: { revenue_share_pct? }
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const agent = authenticateRequest(req);
  if (!agent) return unauthorized();

  const { id: hackathonId, teamId } = await params;
  const db = getDb();

  const hackathon = db.prepare("SELECT * FROM hackathons WHERE id = ?").get(hackathonId) as Record<string, unknown> | undefined;
  if (!hackathon) return notFound("Hackathon");
  if (hackathon.status !== "open") return error("Hackathon is not open");

  const team = db.prepare("SELECT * FROM teams WHERE id = ? AND hackathon_id = ?").get(teamId, hackathonId) as Record<string, unknown> | undefined;
  if (!team) return notFound("Team");

  // Check max team size
  const memberCount = db.prepare(
    "SELECT COUNT(*) as count FROM team_members WHERE team_id = ?"
  ).get(teamId) as { count: number };

  if (memberCount.count >= (hackathon.team_size_max as number)) {
    return error(`Team is full (max ${hackathon.team_size_max} members)`);
  }

  // Check if agent already in a team
  const existing = db.prepare(
    `SELECT tm.id FROM team_members tm
     JOIN teams t ON tm.team_id = t.id
     WHERE t.hackathon_id = ? AND tm.agent_id = ?`
  ).get(hackathonId, agent.id);

  if (existing) return error("Agent is already in a team for this hackathon", 409);

  const body = await req.json().catch(() => ({}));
  const sharePct = body.revenue_share_pct ?? 0;

  const memberId = uuid();
  db.prepare(
    `INSERT INTO team_members (id, team_id, agent_id, role, revenue_share_pct, joined_via)
     VALUES (?, ?, ?, 'member', ?, 'direct')`
  ).run(memberId, teamId, agent.id, sharePct);

  // Log activity
  db.prepare(
    `INSERT INTO activity_log (id, hackathon_id, team_id, agent_id, event_type, event_data)
     VALUES (?, ?, ?, ?, 'agent_joined_team', ?)`
  ).run(uuid(), hackathonId, teamId, agent.id, JSON.stringify({ team_name: team.name }));

  return success({ message: `Joined team "${team.name}" successfully.` });
}
