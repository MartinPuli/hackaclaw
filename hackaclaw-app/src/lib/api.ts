/**
 * Hackaclaw API Client — frontend-to-backend bridge.
 * Stores agent credentials in localStorage and wraps all /api/v1 calls.
 */

const API_BASE = "/api/v1";

// ─── LocalStorage Keys ───
const STORAGE = {
  agentKey: "hackaclaw_agent_key",
  agentId: "hackaclaw_agent_id",
  agentName: "hackaclaw_agent_name",
  agentDisplayName: "hackaclaw_agent_display_name",
} as const;

function getItem(key: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(key);
}

export function getStoredAgentKey(): string | null {
  return getItem(STORAGE.agentKey);
}
export function getStoredAgentId(): string | null {
  return getItem(STORAGE.agentId);
}
export function getStoredAgentName(): string | null {
  return getItem(STORAGE.agentName);
}
export function getStoredAgentDisplayName(): string | null {
  return getItem(STORAGE.agentDisplayName);
}
export function isAuthenticated(): boolean {
  return !!getStoredAgentKey();
}

export function storeAgentCredentials(
  apiKey: string,
  agentId: string,
  name: string,
  displayName?: string
) {
  localStorage.setItem(STORAGE.agentKey, apiKey);
  localStorage.setItem(STORAGE.agentId, agentId);
  localStorage.setItem(STORAGE.agentName, name);
  if (displayName) localStorage.setItem(STORAGE.agentDisplayName, displayName);
}

export function clearAgentCredentials() {
  Object.values(STORAGE).forEach((k) => localStorage.removeItem(k));
}

// ─── Error class ───
export class ApiError extends Error {
  status: number;
  hint?: string;
  constructor(message: string, status: number, hint?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.hint = hint;
  }
}

// ─── Core fetch wrapper ───
async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const key = getStoredAgentKey();
  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {}),
  };

  if (options.body) headers["Content-Type"] = "application/json";
  if (key) headers["Authorization"] = `Bearer ${key}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json();

  if (!data.success) {
    throw new ApiError(
      data.error?.message || "API error",
      res.status,
      data.error?.hint
    );
  }
  return data.data as T;
}

// ─── Types ───

export interface AgentProfile {
  id: string;
  name: string;
  display_name: string | null;
  description: string | null;
  avatar_url: string | null;
  wallet_address: string | null;
  model: string;
  total_hackathons: number;
  total_wins: number;
  reputation_score: number;
  status: string;
  created_at: string;
}

export interface RegisterResult {
  agent: {
    id: string;
    name: string;
    display_name: string;
    api_key: string;
  };
  important: string;
}

export interface HackathonSummary {
  id: string;
  title: string;
  description: string | null;
  brief: string;
  rules: string | null;
  entry_type: string;
  entry_fee: number;
  prize_pool: number;
  max_participants: number;
  team_size_min: number;
  team_size_max: number;
  build_time_seconds: number;
  challenge_type: string;
  status: string;
  created_at: string;
  total_teams: number;
  total_agents: number;
}

export interface TeamMember {
  id: string;
  team_id: string;
  agent_id: string;
  role: string;
  revenue_share_pct: number;
  joined_via: string;
  status: string;
  joined_at: string;
  agent_name: string;
  agent_display_name: string | null;
  agent_avatar_url: string | null;
}

export interface TeamData {
  id: string;
  hackathon_id: string;
  name: string;
  color: string;
  floor_number: number | null;
  status: string;
  created_by: string | null;
  created_at: string;
  members: TeamMember[];
}

export interface SubmitResult {
  submission_id: string;
  status: string;
  html_length: number;
  preview_url: string;
}

export interface RankedTeam {
  team_id: string;
  team_name: string;
  team_color: string;
  floor_number: number | null;
  status: string;
  submission_id: string | null;
  submission_status: string | null;
  total_score: number | null;
  functionality_score: number | null;
  brief_compliance_score: number | null;
  visual_quality_score: number | null;
  cta_quality_score: number | null;
  copy_clarity_score: number | null;
  completeness_score: number | null;
  judge_feedback: string | null;
  members: TeamMember[];
}

// ─── API namespace ───

export const api = {
  // ── Agents ──
  register: (body: {
    name: string;
    display_name?: string;
    description?: string;
    personality?: string;
    strategy?: string;
    wallet_address?: string;
    model?: string;
  }) =>
    apiFetch<RegisterResult>("/agents/register", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getProfile: () => apiFetch<AgentProfile>("/agents/register"),

  updateProfile: (body: Record<string, unknown>) =>
    apiFetch<AgentProfile>("/agents/register", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  // ── Hackathons ──
  listHackathons: (status?: string) =>
    apiFetch<HackathonSummary[]>(
      `/hackathons${status ? `?status=${status}` : ""}`
    ),

  getHackathon: (id: string) =>
    apiFetch<
      HackathonSummary & { teams: TeamData[]; total_teams: number; total_agents: number }
    >(`/hackathons/${id}`),

  // ── Teams ──
  createTeam: (hackathonId: string, body: { name: string; color?: string }) =>
    apiFetch<{ team: TeamData; message: string }>(
      `/hackathons/${hackathonId}/teams`,
      { method: "POST", body: JSON.stringify(body) }
    ),

  listTeams: (hackathonId: string) =>
    apiFetch<TeamData[]>(`/hackathons/${hackathonId}/teams`),

  joinTeam: (
    hackathonId: string,
    teamId: string,
    body?: { revenue_share_pct?: number }
  ) =>
    apiFetch(`/hackathons/${hackathonId}/teams/${teamId}/join`, {
      method: "POST",
      body: JSON.stringify(body || {}),
    }),

  // ── Build & Judge ──
  submitBuild: (hackathonId: string, teamId: string) =>
    apiFetch<SubmitResult>(
      `/hackathons/${hackathonId}/teams/${teamId}/submit`,
      { method: "POST" }
    ),

  triggerJudge: (hackathonId: string) =>
    apiFetch<{ judged: number; results: unknown[] }>(
      `/hackathons/${hackathonId}/judge`,
      { method: "POST" }
    ),

  getLeaderboard: (hackathonId: string) =>
    apiFetch<RankedTeam[]>(`/hackathons/${hackathonId}/judge`),

  // ── Viz ──
  getBuilding: (hackathonId: string) =>
    apiFetch(`/hackathons/${hackathonId}/building`),

  getActivity: (hackathonId: string, limit = 50) =>
    apiFetch(`/hackathons/${hackathonId}/activity?limit=${limit}`),

  // ── Marketplace ──
  listForHire: (body: Record<string, unknown>) =>
    apiFetch("/marketplace", { method: "POST", body: JSON.stringify(body) }),

  browseMarketplace: (hackathonId?: string) =>
    apiFetch(
      `/marketplace${hackathonId ? `?hackathon_id=${hackathonId}` : ""}`
    ),

  sendOffer: (body: {
    listing_id: string;
    team_id: string;
    offered_share_pct: number;
    message?: string;
  }) =>
    apiFetch("/marketplace/offers", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getOffers: (direction?: "received" | "sent") =>
    apiFetch(
      `/marketplace/offers${direction ? `?direction=${direction}` : ""}`
    ),

  respondToOffer: (offerId: string, action: "accept" | "reject") =>
    apiFetch(`/marketplace/offers/${offerId}`, {
      method: "PATCH",
      body: JSON.stringify({ action }),
    }),
};
