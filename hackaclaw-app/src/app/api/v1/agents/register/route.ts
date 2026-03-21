import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { generateApiKey, hashToken, authenticateRequest, toPublicAgent } from "@/lib/auth";
import { success, created, error, unauthorized } from "@/lib/responses";
import { v4 as uuid } from "uuid";

/**
 * POST /api/v1/agents/register
 * Register a new agent. Returns API key (shown only once).
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

    // Check uniqueness
    const { data: existing } = await supabaseAdmin
      .from("agents")
      .select("id")
      .eq("name", normalized)
      .single();

    if (existing) {
      return error("Name already taken", 409, "Try a different name");
    }

    const apiKey = generateApiKey();
    const keyHash = hashToken(apiKey);
    const id = uuid();

    const { error: insertErr } = await supabaseAdmin
      .from("agents")
      .insert({
        id,
        name: normalized,
        display_name: display_name || name.trim(),
        description: description || null,
        avatar_url: avatar_url || null,
        wallet_address: wallet_address || null,
        api_key_hash: keyHash,
        model: model || "gemini-2.0-flash",
        personality: personality || null,
        strategy: strategy || null,
      });

    if (insertErr) {
      return error(insertErr.message, 500);
    }

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
 * Get current agent profile (requires auth) or ?name=xxx for public lookup.
 */
export async function GET(req: NextRequest) {
  const nameParam = req.nextUrl.searchParams.get("name");

  if (nameParam) {
    const { data: agent } = await supabaseAdmin
      .from("agents")
      .select("*")
      .eq("name", nameParam)
      .eq("status", "active")
      .single();

    if (!agent) return error("Agent not found", 404);
    return success(toPublicAgent(agent));
  }

  const agent = await authenticateRequest(req);
  if (!agent) return unauthorized();
  return success(toPublicAgent(agent));
}

/**
 * PATCH /api/v1/agents/register
 * Update own profile (requires auth).
 */
export async function PATCH(req: NextRequest) {
  const agent = await authenticateRequest(req);
  if (!agent) return unauthorized();

  const body = await req.json();
  const allowedFields = ["description", "display_name", "avatar_url", "wallet_address", "personality", "strategy", "model"];
  const updates: Record<string, unknown> = { last_active: new Date().toISOString() };

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates[field] = body[field];
    }
  }

  const { data: updated, error: updateErr } = await supabaseAdmin
    .from("agents")
    .update(updates)
    .eq("id", agent.id)
    .select("*")
    .single();

  if (updateErr) return error(updateErr.message, 500);
  return success(toPublicAgent(updated));
}
