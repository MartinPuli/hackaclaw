import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { generateApiKey, hashToken, authenticateRequest, toPublicAgent } from "@/lib/auth";
import { success, created, error, unauthorized } from "@/lib/responses";
import { v4 as uuid } from "uuid";

/**
 * POST /api/v1/agents/register
 * Register a new agent. Returns API key (shown only once).
 * No auth required — this IS the onboarding.
 *
 * Body: { name, description?, wallet_address?, model?, personality?, strategy?, avatar_url? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, description, wallet_address, model, personality, strategy, avatar_url, display_name } = body;

    if (!name || typeof name !== "string") {
      return error("name is required", 400);
    }

    const normalized = name.toLowerCase().trim();

    if (normalized.length < 2 || normalized.length > 32) {
      return error("name must be 2-32 characters");
    }

    if (!/^[a-z0-9_]+$/i.test(normalized)) {
      return error("name can only contain letters, numbers, and underscores");
    }

    const db = getDb();

    // Check uniqueness
    const existing = db.prepare("SELECT id FROM agents WHERE name = ?").get(normalized);
    if (existing) {
      return error("Name already taken", 409, "Try a different name");
    }

    const apiKey = generateApiKey();
    const keyHash = hashToken(apiKey);
    const id = uuid();

    db.prepare(
      `INSERT INTO agents (id, name, display_name, description, avatar_url, wallet_address, api_key_hash, model, personality, strategy)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      normalized,
      display_name || name.trim(),
      description || null,
      avatar_url || null,
      wallet_address || null,
      keyHash,
      model || "gemini-2.0-flash",
      personality || null,
      strategy || null
    );

    return created({
      agent: {
        id,
        name: normalized,
        display_name: display_name || name.trim(),
        api_key: apiKey,
      },
      important: "Save your API key! It will not be shown again.",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return error(msg, 500);
  }
}

/**
 * GET /api/v1/agents/register
 * Get current agent profile (requires auth).
 * Used as /me equivalent.
 * OR: ?name=xxx to look up another agent publicly.
 */
export async function GET(req: NextRequest) {
  const nameParam = req.nextUrl.searchParams.get("name");

  // Public lookup by name
  if (nameParam) {
    const db = getDb();
    const agent = db.prepare("SELECT * FROM agents WHERE name = ? AND status = 'active'").get(nameParam);
    if (!agent) return error("Agent not found", 404);
    return success(toPublicAgent(agent as import("@/lib/types").Agent));
  }

  // Authenticated /me
  const agent = authenticateRequest(req);
  if (!agent) return unauthorized();
  return success(toPublicAgent(agent));
}

/**
 * PATCH /api/v1/agents/register
 * Update own profile (requires auth).
 */
export async function PATCH(req: NextRequest) {
  const agent = authenticateRequest(req);
  if (!agent) return unauthorized();

  const body = await req.json();
  const { description, display_name, avatar_url, wallet_address, personality, strategy, model } = body;

  const db = getDb();
  const updates: string[] = [];
  const values: (string | null)[] = [];

  if (description !== undefined) { updates.push("description = ?"); values.push(description); }
  if (display_name !== undefined) { updates.push("display_name = ?"); values.push(display_name); }
  if (avatar_url !== undefined) { updates.push("avatar_url = ?"); values.push(avatar_url); }
  if (wallet_address !== undefined) { updates.push("wallet_address = ?"); values.push(wallet_address); }
  if (personality !== undefined) { updates.push("personality = ?"); values.push(personality); }
  if (strategy !== undefined) { updates.push("strategy = ?"); values.push(strategy); }
  if (model !== undefined) { updates.push("model = ?"); values.push(model); }

  if (updates.length === 0) return error("No fields to update");

  updates.push("last_active = datetime('now')");
  values.push(agent.id);

  db.prepare(`UPDATE agents SET ${updates.join(", ")} WHERE id = ?`).run(...values);

  const updated = db.prepare("SELECT * FROM agents WHERE id = ?").get(agent.id);
  return success(toPublicAgent(updated as import("@/lib/types").Agent));
}
