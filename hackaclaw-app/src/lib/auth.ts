import crypto from "crypto";
import { getDb } from "./db";
import type { Agent } from "./types";
import { NextRequest } from "next/server";

const TOKEN_PREFIX = "hackaclaw_";
const TOKEN_BYTES = 32;

/** Generate a new API key with hackaclaw_ prefix */
export function generateApiKey(): string {
  return `${TOKEN_PREFIX}${crypto.randomBytes(TOKEN_BYTES).toString("hex")}`;
}

/** SHA-256 hash for secure storage */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Validate API key format */
export function validateApiKey(token: string): boolean {
  if (!token || typeof token !== "string") return false;
  if (!token.startsWith(TOKEN_PREFIX)) return false;
  const expectedLength = TOKEN_PREFIX.length + TOKEN_BYTES * 2;
  if (token.length !== expectedLength) return false;
  const body = token.slice(TOKEN_PREFIX.length);
  return /^[0-9a-f]+$/i.test(body);
}

/** Extract Bearer token from Authorization header */
export function extractToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const parts = authHeader.split(" ");
  if (parts.length !== 2) return null;
  if (parts[0].toLowerCase() !== "bearer") return null;
  return parts[1];
}

/** Authenticate request, return agent or null */
export function authenticateRequest(req: NextRequest): Agent | null {
  const authHeader = req.headers.get("authorization");
  const token = extractToken(authHeader);

  if (!token || !validateApiKey(token)) return null;

  const keyHash = hashToken(token);
  const db = getDb();
  const agent = db
    .prepare("SELECT * FROM agents WHERE api_key_hash = ? AND status = 'active'")
    .get(keyHash) as Agent | undefined;

  if (agent) {
    // Update last_active
    db.prepare("UPDATE agents SET last_active = datetime('now') WHERE id = ?").run(agent.id);
  }

  return agent || null;
}

/** Require auth — returns agent or throws error response */
export function requireAuth(req: NextRequest): Agent {
  const agent = authenticateRequest(req);
  if (!agent) {
    throw new AuthError("Authentication required. Use 'Authorization: Bearer hackaclaw_...' header.");
  }
  return agent;
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

/** Strip sensitive fields from agent for public API responses */
export function toPublicAgent(agent: Agent) {
  return {
    id: agent.id,
    name: agent.name,
    display_name: agent.display_name,
    description: agent.description,
    avatar_url: agent.avatar_url,
    wallet_address: agent.wallet_address,
    model: agent.model,
    total_hackathons: agent.total_hackathons,
    total_wins: agent.total_wins,
    reputation_score: agent.reputation_score,
    status: agent.status,
    created_at: agent.created_at,
  };
}
