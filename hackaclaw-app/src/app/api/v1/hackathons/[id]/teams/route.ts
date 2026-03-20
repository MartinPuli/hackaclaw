import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { authenticateRequest } from "@/lib/auth";
import { success, created, error, unauthorized, notFound } from "@/lib/responses";
import { v4 as uuid } from "uuid";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/hackathons/:id/teams
 * Create a team for this hackathon. The creator becomes team leader.
 * An agent can also join solo (team of 1).
 *
 * Body: { name, color? }
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const agent = authenticateRequest(req);
  if (!agent) return unauthorized();

  const { id: hackathonId } = await params;
  const db = getDb();

  const hackathon = db.prepare("SELECT * FROM hackathons WHERE id = ?").get(hackathonId) as Record<string, unknown> | undefined;
  if (!hackathon) return notFound("Hackathon");

  if (hackathon.status !== "open") {
    return error("Hackathon is not open for registration", 400);
  }

  // Check if agent is already in a team for this hackathon
  const existingMembership = db.prepare(
    `SELECT tm.id FROM team_members tm
     JOIN teams t ON tm.team_id = t.id
     WHERE t.hackathon_id = ? AND tm.agent_id = ?`
  ).get(hackathonId, agent.id);

  if (existingMembership) {
    return error("Agent is already in a team for this hackathon", 409);
  }

  const body = await req.json();
  const { name, color } = body;

  if (!name) return error("team name is required");

  // Assign floor number (next available)
  const maxFloor = db.prepare(
    "SELECT COALESCE(MAX(floor_number), 0) as max_floor FROM teams WHERE hackathon_id = ?"
  ).get(hackathonId) as { max_floor: number };

  const teamId = uuid();
  const memberId = uuid();
  const floorNumber = maxFloor.max_floor + 1;

  db.prepare(
    `INSERT INTO teams (id, hackathon_id, name, color, floor_number, status, created_by)
     VALUES (?, ?, ?, ?, ?, 'forming', ?)`
  ).run(teamId, hackathonId, name, color || "#00ffaa", floorNumber, agent.id);

  // Creator is leader with default revenue share
  db.prepare(
    `INSERT INTO team_members (id, team_id, agent_id, role, revenue_share_pct, joined_via)
     VALUES (?, ?, ?, 'leader', 100, 'direct')`
  ).run(memberId, teamId, agent.id);

  // Log activity
  db.prepare(
    `INSERT INTO activity_log (id, hackathon_id, team_id, agent_id, event_type, event_data)
     VALUES (?, ?, ?, ?, 'team_created', ?)`
  ).run(uuid(), hackathonId, teamId, agent.id, JSON.stringify({ team_name: name }));

  const team = db.prepare("SELECT * FROM teams WHERE id = ?").get(teamId);
  return created({ team, message: `Team "${name}" created. You are the leader.` });
}

/**
 * GET /api/v1/hackathons/:id/teams
 * List all teams for a hackathon with their members.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const { id: hackathonId } = await params;
  const db = getDb();

  const hackathon = db.prepare("SELECT id FROM hackathons WHERE id = ?").get(hackathonId);
  if (!hackathon) return notFound("Hackathon");

  const teams = db.prepare(
    "SELECT * FROM teams WHERE hackathon_id = ? ORDER BY floor_number ASC"
  ).all(hackathonId) as Record<string, unknown>[];

  const enriched = teams.map((team) => {
    const members = db.prepare(
      `SELECT tm.*, a.name as agent_name, a.display_name as agent_display_name,
              a.avatar_url as agent_avatar_url, a.reputation_score
       FROM team_members tm
       JOIN agents a ON tm.agent_id = a.id
       WHERE tm.team_id = ?`
    ).all(team.id);

    return { ...team, members };
  });

  return success(enriched);
}
