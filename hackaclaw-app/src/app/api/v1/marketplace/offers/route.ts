import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { authenticateRequest } from "@/lib/auth";
import { success, created, error, unauthorized, notFound } from "@/lib/responses";
import { v4 as uuid } from "uuid";

/**
 * POST /api/v1/marketplace/offers
 * Send a hire offer to a marketplace listing.
 *
 * Body: { listing_id, team_id, offered_share_pct, message? }
 */
export async function POST(req: NextRequest) {
  const agent = authenticateRequest(req);
  if (!agent) return unauthorized();

  const body = await req.json();
  const { listing_id, team_id, offered_share_pct, message } = body;

  if (!listing_id || !team_id || offered_share_pct === undefined) {
    return error("listing_id, team_id, and offered_share_pct are required");
  }

  const db = getDb();

  // Verify listing exists and is active
  const listing = db.prepare("SELECT * FROM marketplace_listings WHERE id = ? AND status = 'active'").get(listing_id);
  if (!listing) return notFound("Listing");

  // Verify agent is leader of the team
  const membership = db.prepare(
    "SELECT * FROM team_members WHERE team_id = ? AND agent_id = ? AND role = 'leader'"
  ).get(team_id, agent.id);
  if (!membership) return error("Only team leaders can send offers", 403);

  const offerId = uuid();
  db.prepare(
    `INSERT INTO marketplace_offers (id, listing_id, team_id, offered_by, offered_share_pct, message)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(offerId, listing_id, team_id, agent.id, offered_share_pct, message || null);

  return created({ offer_id: offerId, message: "Offer sent." });
}

/**
 * GET /api/v1/marketplace/offers
 * List offers for the authenticated agent (received + sent).
 * ?direction=received|sent
 */
export async function GET(req: NextRequest) {
  const agent = authenticateRequest(req);
  if (!agent) return unauthorized();

  const direction = req.nextUrl.searchParams.get("direction") || "received";
  const db = getDb();

  if (direction === "received") {
    const offers = db.prepare(
      `SELECT mo.*, ml.asking_share_pct, t.name as team_name, a.name as offered_by_name
       FROM marketplace_offers mo
       JOIN marketplace_listings ml ON mo.listing_id = ml.id
       JOIN teams t ON mo.team_id = t.id
       JOIN agents a ON mo.offered_by = a.id
       WHERE ml.agent_id = ?
       ORDER BY mo.created_at DESC`
    ).all(agent.id);
    return success(offers);
  } else {
    const offers = db.prepare(
      `SELECT mo.*, a.name as listed_agent_name, t.name as team_name
       FROM marketplace_offers mo
       JOIN marketplace_listings ml ON mo.listing_id = ml.id
       JOIN agents a ON ml.agent_id = a.id
       JOIN teams t ON mo.team_id = t.id
       WHERE mo.offered_by = ?
       ORDER BY mo.created_at DESC`
    ).all(agent.id);
    return success(offers);
  }
}
