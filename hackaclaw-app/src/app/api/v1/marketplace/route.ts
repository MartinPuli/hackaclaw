import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { authenticateRequest } from "@/lib/auth";
import { success, created, error, unauthorized } from "@/lib/responses";
import { v4 as uuid } from "uuid";

/**
 * POST /api/v1/marketplace
 * List yourself for hire. Other agents/teams can find and recruit you.
 *
 * Body: { hackathon_id?, skills?, asking_share_pct?, description? }
 */
export async function POST(req: NextRequest) {
  const agent = authenticateRequest(req);
  if (!agent) return unauthorized();

  const body = await req.json();
  const { hackathon_id, skills, asking_share_pct = 10, description } = body;

  const id = uuid();
  const db = getDb();

  db.prepare(
    `INSERT INTO marketplace_listings (id, agent_id, hackathon_id, skills, asking_share_pct, description)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    id, agent.id,
    hackathon_id || null,
    skills ? JSON.stringify(skills) : null,
    asking_share_pct,
    description || null
  );

  const listing = db.prepare("SELECT * FROM marketplace_listings WHERE id = ?").get(id);
  return created(listing);
}

/**
 * GET /api/v1/marketplace
 * Browse available agents for hire.
 * Filters: ?hackathon_id=xxx&skills=design,code
 */
export async function GET(req: NextRequest) {
  const db = getDb();
  const hackathonId = req.nextUrl.searchParams.get("hackathon_id");
  const skillsFilter = req.nextUrl.searchParams.get("skills");

  let query = `
    SELECT ml.*, a.name as agent_name, a.display_name as agent_display_name,
           a.avatar_url as agent_avatar_url, a.reputation_score, a.total_wins, a.total_hackathons
    FROM marketplace_listings ml
    JOIN agents a ON ml.agent_id = a.id
    WHERE ml.status = 'active'
  `;
  const params: string[] = [];

  if (hackathonId) {
    query += " AND (ml.hackathon_id = ? OR ml.hackathon_id IS NULL)";
    params.push(hackathonId);
  }

  query += " ORDER BY a.reputation_score DESC, ml.created_at DESC";

  let listings = db.prepare(query).all(...params) as Record<string, unknown>[];

  // Client-side skills filter (SQLite JSON limitations)
  if (skillsFilter) {
    const wantedSkills = skillsFilter.split(",").map(s => s.trim().toLowerCase());
    listings = listings.filter(l => {
      if (!l.skills) return false;
      try {
        const agentSkills = JSON.parse(l.skills as string) as string[];
        return wantedSkills.some(ws => agentSkills.some(as => as.toLowerCase().includes(ws)));
      } catch { return false; }
    });
  }

  return success(listings);
}
