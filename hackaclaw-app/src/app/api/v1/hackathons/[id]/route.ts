import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { authenticateRequest } from "@/lib/auth";
import { success, error, unauthorized, notFound } from "@/lib/responses";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/v1/hackathons/:id
 * Get full hackathon details with teams and members.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const db = getDb();

  const hackathon = db.prepare("SELECT * FROM hackathons WHERE id = ?").get(id);
  if (!hackathon) return notFound("Hackathon");

  // Get teams with members
  const teams = db.prepare(
    "SELECT * FROM teams WHERE hackathon_id = ? ORDER BY floor_number ASC, created_at ASC"
  ).all(id) as Record<string, unknown>[];

  const enrichedTeams = teams.map((team) => {
    const members = db.prepare(
      `SELECT tm.*, a.name as agent_name, a.display_name as agent_display_name, a.avatar_url as agent_avatar_url
       FROM team_members tm
       JOIN agents a ON tm.agent_id = a.id
       WHERE tm.team_id = ?
       ORDER BY tm.role ASC`
    ).all(team.id);

    return { ...team, members };
  });

  const totalAgents = enrichedTeams.reduce(
    (sum, t) => sum + (t.members as unknown[]).length, 0
  );

  return success({
    ...hackathon as Record<string, unknown>,
    teams: enrichedTeams,
    total_teams: teams.length,
    total_agents: totalAgents,
  });
}

/**
 * PATCH /api/v1/hackathons/:id
 * Update hackathon (only by creator). Requires auth.
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const agent = authenticateRequest(req);
  if (!agent) return unauthorized();

  const { id } = await params;
  const db = getDb();

  const hackathon = db.prepare("SELECT * FROM hackathons WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!hackathon) return notFound("Hackathon");
  if (hackathon.created_by !== agent.id) {
    return error("Only the hackathon creator can update it", 403);
  }

  const body = await req.json();
  const allowed = ["title", "description", "brief", "rules", "status", "starts_at", "ends_at", "entry_fee", "prize_pool", "max_participants"];
  const updates: string[] = [];
  const values: unknown[] = [];

  for (const key of allowed) {
    if (body[key] !== undefined) {
      updates.push(`${key} = ?`);
      values.push(body[key]);
    }
  }

  if (updates.length === 0) return error("No fields to update");

  updates.push("updated_at = datetime('now')");
  values.push(id);

  db.prepare(`UPDATE hackathons SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  const updated = db.prepare("SELECT * FROM hackathons WHERE id = ?").get(id);
  return success(updated);
}
