# Directory Structure
```
hackaclaw-app/
  src/
    app/
      admin/
        login/
          page.tsx
        proposals/
          page.tsx
      api/
        v1/
          admin/
            hackathons/
              [id]/
                finalize/
                  route.ts
                judge/
                  route.ts
          agents/
            me/
              route.ts
            register/
              route.ts
          balance/
            test-credit/
              route.ts
            transactions/
              route.ts
            route.ts
          cron/
            judge/
              route.ts
          hackathons/
            [id]/
              activity/
                route.ts
              building/
                route.ts
              check-deadline/
                route.ts
              contract/
                route.ts
              join/
                route.ts
              judge/
                submit/
                  route.ts
                route.ts
              leaderboard/
                route.ts
              teams/
                [teamId]/
                  join/
                    route.ts
                  prompt/
                    route.ts
                  submit/
                    route.ts
                route.ts
              route.ts
            route.ts
          marketplace/
            offers/
              [offerId]/
                route.ts
              route.ts
            route.ts
          models/
            route.ts
          proposals/
            route.ts
          submissions/
            [subId]/
              preview/
                route.ts
          route.ts
      arena/
        page.tsx
      docs/
        page.tsx
      enterprise/
        page.tsx
      hackathons/
        [id]/
          page.tsx
        page.tsx
      marketplace/
        page.tsx
      client-layout.tsx
      favicon.ico
      globals.css
      json-ld.tsx
      layout.tsx
      nav-and-footer.tsx
      opengraph-image.tsx
      page.tsx
      robots.ts
      sitemap.ts
    middleware.ts
  .env.example
  AGENTS.md
  CLAUDE.md
  lint.json
  next-env.d.ts
  package.json
  README.md
  vercel.json
hackaclaw-contracts/
  script/
    Deploy.s.sol
  src/
    HackathonEscrow.sol
    HackathonFactory.sol
  .env.example
  .gitmodules
  foundry.lock
  README.md
.gitmodules
.repomixignore
agent-compete.js
AGENTS.md
AUDIT_FEATURES.md
README.md
test-bot.js
test-bots.sh
```

# Files

## File: hackaclaw-app/src/app/api/v1/admin/hackathons/[id]/finalize/route.ts
````typescript
import { NextRequest } from "next/server";
import { v4 as uuid } from "uuid";
import { authenticateAdminRequest } from "@/lib/auth";
import { finalizeHackathonOnChain, normalizeAddress } from "@/lib/chain";
import { formatHackathon, loadHackathonLeaderboard, parseHackathonMeta, sanitizeString, serializeHackathonMeta } from "@/lib/hackathons";
import { error, notFound, success } from "@/lib/responses";
import { supabaseAdmin } from "@/lib/supabase";

type RouteParams = { params: Promise<{ id: string }> };

function getConfiguredChainId(): number | null {
  const parsed = Number.parseInt(process.env.CHAIN_ID || "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * POST /api/v1/admin/hackathons/:id/finalize — Manually select a winner and optional scores.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  if (!authenticateAdminRequest(req)) {
    return error("Admin authentication required", 401, "Add 'Authorization: Bearer <ADMIN_API_KEY>' header.");
  }

  const { id: hackathonId } = await params;
  const { data: hackathon } = await supabaseAdmin.from("hackathons").select("*").eq("id", hackathonId).single();

  if (!hackathon) return notFound("Hackathon");

  const body = await req.json().catch(() => ({}));
  const winnerAgentId = sanitizeString(body.winner_agent_id, 64);
  if (!winnerAgentId) return error("winner_agent_id is required", 400);

  const meta = parseHackathonMeta(hackathon.judging_criteria);
  if (!meta.contract_address) {
    return error("Hackathon does not have a configured contract address", 400);
  }

  const { data: winningMembership } = await supabaseAdmin
    .from("team_members")
    .select("team_id, teams!inner(hackathon_id), agents!inner(wallet_address)")
    .eq("agent_id", winnerAgentId)
    .eq("teams.hackathon_id", hackathonId)
    .single();

  if (!winningMembership) return error("winner_agent_id is not registered in this hackathon", 400);

  const { data: winningTeam } = await supabaseAdmin
    .from("teams")
    .select("id, hackathon_id")
    .eq("id", winningMembership.team_id)
    .eq("hackathon_id", hackathonId)
    .single();

  if (!winningTeam) return error("winner_agent_id is not registered in this hackathon", 400);

  const winningAgent = winningMembership.agents as { wallet_address?: string | null } | null;
  if (!winningAgent?.wallet_address) {
    return error("Winning agent does not have a registered wallet address", 400);
  }

  let winnerWallet: string;
  try {
    winnerWallet = normalizeAddress(winningAgent.wallet_address);
  } catch {
    return error("Winning agent wallet address is invalid", 400);
  }

  let finalizeResult;
  try {
    finalizeResult = await finalizeHackathonOnChain({
      contractAddress: meta.contract_address,
      winnerWallet,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to finalize hackathon on-chain";
    return error(message, 400);
  }

  const finalizedAt = new Date().toISOString();
  const notes = sanitizeString(body.notes, 4000);

  const { data: updatedHackathon, error: updateErr } = await supabaseAdmin
    .from("hackathons")
    .update({
      status: "completed",
      updated_at: finalizedAt,
      judging_criteria: serializeHackathonMeta({
        ...meta,
        chain_id: meta.chain_id ?? getConfiguredChainId(),
        winner_agent_id: winnerAgentId,
        winner_team_id: winningTeam.id,
        finalization_notes: notes,
        finalized_at: finalizedAt,
        finalize_tx_hash: finalizeResult.txHash,
        scores: body.scores ?? meta.scores,
      }),
    })
    .eq("id", hackathonId)
    .select("*")
    .single();

  if (updateErr) return error("Failed to finalize hackathon", 500);

  await supabaseAdmin.from("teams").update({ status: "judged" }).eq("id", winningTeam.id);

  await supabaseAdmin.from("activity_log").insert({
    id: uuid(),
    hackathon_id: hackathonId,
    team_id: winningTeam.id,
    agent_id: winnerAgentId,
    event_type: "hackathon_finalized",
    event_data: {
      winner_agent_id: winnerAgentId,
      winner_team_id: winningTeam.id,
      winner_wallet: winnerWallet,
      finalize_tx_hash: finalizeResult.txHash,
      contract_address: meta.contract_address,
      notes,
    },
  });

  const leaderboard = await loadHackathonLeaderboard(hackathonId);

  return success({
    hackathon: formatHackathon(updatedHackathon as Record<string, unknown>),
    winner_agent_id: winnerAgentId,
    winner_team_id: winningTeam.id,
    notes,
    leaderboard,
  });
}
````

## File: hackaclaw-app/src/app/api/v1/agents/register/route.ts
````typescript
import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { generateApiKey, hashToken, authenticateRequest, toPublicAgent } from "@/lib/auth";
import { success, created, error, unauthorized } from "@/lib/responses";
import { sanitizeString } from "@/lib/hackathons";
import { v4 as uuid } from "uuid";

// Max field lengths to prevent abuse
const LIMITS = {
  name: 32,
  display_name: 64,
  description: 500,
  stack: 500,
  wallet_address: 128,
  model: 64,
  avatar_url: 512,
} as const;

/**
 * POST /api/v1/agents/register
 * Register a new agent. Returns API key (shown only once).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const metadata: Record<string, unknown> = body.metadata && typeof body.metadata === "object" ? body.metadata : {};
    const name = sanitizeString(body.name, LIMITS.name);

    if (!name) {
      return error("name is required", 400);
    }

    const normalized = name.toLowerCase();

    if (normalized.length < 2) {
      return error("name must be at least 2 characters");
    }

    if (!/^[a-z0-9_]+$/.test(normalized)) {
      return error("name can only contain lowercase letters, numbers, and underscores");
    }

    // Reserved names
    const reserved = ["admin", "hackaclaw", "buildersclaw", "system", "api", "root", "null", "undefined", "test"];
    if (reserved.includes(normalized)) {
      return error("This name is reserved", 409);
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
        display_name: sanitizeString(body.display_name, LIMITS.display_name) || name,
        description: sanitizeString(metadata.description ?? body.description, LIMITS.description),
        avatar_url: sanitizeString(body.avatar_url, LIMITS.avatar_url),
        wallet_address: sanitizeString(body.wallet ?? body.wallet_address, LIMITS.wallet_address),
        api_key_hash: keyHash,
        model: sanitizeString(metadata.model ?? body.model, LIMITS.model) || "unknown",
        personality: null,
        strategy: sanitizeString(metadata.stack ?? body.stack ?? body.strategy, LIMITS.stack),
      });

    if (insertErr) {
      return error("Registration failed", 500);
    }

    return created({
      agent: {
        id,
        name: normalized,
        display_name: sanitizeString(body.display_name, LIMITS.display_name) || name,
        api_key: apiKey,
      },
      important: "Save your API key! It will not be shown again.",
    });
  } catch {
    return error("Invalid request body", 400);
  }
}

/**
 * GET /api/v1/agents/register
 * Get current agent profile (requires auth) or ?name=xxx for public lookup.
 */
export async function GET(req: NextRequest) {
  const nameParam = req.nextUrl.searchParams.get("name");

  if (nameParam) {
    // Sanitize lookup name
    const clean = nameParam.toLowerCase().trim().slice(0, 32);
    if (!/^[a-z0-9_]+$/.test(clean)) return error("Invalid agent name", 400);

    const { data: agent } = await supabaseAdmin
      .from("agents")
      .select("*")
      .eq("name", clean)
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

  try {
    const body = await req.json();
    const metadata: Record<string, unknown> = body.metadata && typeof body.metadata === "object" ? body.metadata : {};
    const updates: Record<string, unknown> = { last_active: new Date().toISOString() };

    const fieldLimits: Record<string, number> = {
      description: LIMITS.description,
      display_name: LIMITS.display_name,
      avatar_url: LIMITS.avatar_url,
      wallet_address: LIMITS.wallet_address,
      model: LIMITS.model,
    };

    for (const [field, maxLen] of Object.entries(fieldLimits)) {
      if (body[field] !== undefined) {
        updates[field] = sanitizeString(body[field], maxLen);
      }
    }

    const mappedDescription = sanitizeString(metadata.description, LIMITS.description);
    if (mappedDescription !== null) updates.description = mappedDescription;

    const mappedStack = sanitizeString(metadata.stack ?? body.stack, LIMITS.stack);
    if (mappedStack !== null) updates.strategy = mappedStack;

    const mappedModel = sanitizeString(metadata.model, LIMITS.model);
    if (mappedModel !== null) updates.model = mappedModel;

    const mappedWallet = sanitizeString(body.wallet, LIMITS.wallet_address);
    if (mappedWallet !== null) updates.wallet_address = mappedWallet;

    if (Object.keys(updates).length <= 1) return error("No valid fields to update");

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from("agents")
      .update(updates)
      .eq("id", agent.id)
      .select("*")
      .single();

    if (updateErr) return error("Update failed", 500);
    return success(toPublicAgent(updated));
  } catch {
    return error("Invalid request body", 400);
  }
}
````

## File: hackaclaw-app/src/app/api/v1/hackathons/[id]/activity/route.ts
````typescript
import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { success, notFound } from "@/lib/responses";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/v1/hackathons/:id/activity — Activity log.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const { id: hackathonId } = await params;

  const { data: hackathon } = await supabaseAdmin
    .from("hackathons").select("id").eq("id", hackathonId).single();
  if (!hackathon) return notFound("Hackathon");

  const since = req.nextUrl.searchParams.get("since");
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "50"), 200);

  let query = supabaseAdmin
    .from("activity_log")
    .select("*, agents(name, display_name), teams(name, color)")
    .eq("hackathon_id", hackathonId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (since) {
    query = query.gt("created_at", since);
  }

  const { data: events } = await query;

  // Flatten joined data
  const flat = (events || []).map((e: Record<string, unknown>) => {
    const agent = e.agents as Record<string, unknown> | null;
    const team = e.teams as Record<string, unknown> | null;
    return {
      ...e,
      agents: undefined, teams: undefined,
      agent_name: agent?.name, agent_display_name: agent?.display_name,
      team_name: team?.name, team_color: team?.color,
    };
  });

  return success(flat);
}
````

## File: hackaclaw-app/src/app/api/v1/hackathons/[id]/building/route.ts
````typescript
import { NextRequest } from "next/server";
import { loadHackathonLeaderboard } from "@/lib/hackathons";
import { supabaseAdmin } from "@/lib/supabase";
import { success, notFound } from "@/lib/responses";
import type { BuildingFloor, LobsterViz } from "@/lib/types";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/v1/hackathons/:id/building — Building visualization data.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const { id: hackathonId } = await params;

  const { data: hackathon } = await supabaseAdmin
    .from("hackathons").select("*").eq("id", hackathonId).single();
  if (!hackathon) return notFound("Hackathon");

  const { data: teams } = await supabaseAdmin
    .from("teams").select("*")
    .eq("hackathon_id", hackathonId)
    .order("floor_number", { ascending: true });

  const leaderboard = await loadHackathonLeaderboard(hackathonId);
  const scoreByTeamId = new Map((leaderboard || []).map((entry) => [entry.team_id, entry.total_score]));

  const floors: BuildingFloor[] = await Promise.all(
    (teams || []).map(async (team) => {
      const { data: members } = await supabaseAdmin
        .from("team_members")
        .select("*, agents(name, display_name)")
        .eq("team_id", team.id)
        .order("revenue_share_pct", { ascending: false });

      const score = scoreByTeamId.get(team.id) ?? null;

      const lobsters: LobsterViz[] = (members || []).map((m: Record<string, unknown>) => {
        const a = m.agents as Record<string, unknown> | null;
        const sharePct = m.revenue_share_pct as number;
        let size: "small" | "medium" | "large" = "small";
        if (sharePct >= 50) size = "large";
        else if (sharePct >= 20) size = "medium";

        return {
          agent_id: m.agent_id as string,
          agent_name: (a?.name as string) || "",
          display_name: (a?.display_name as string) || null,
          role: m.role as string,
          share_pct: sharePct,
          size,
        };
      });

      return {
        floor_number: team.floor_number,
        team_id: team.id,
        team_name: team.name,
        color: team.color,
        lobsters,
        // Each lobster that joins gets a desk. Prepared empty seats for future members (v2).
        // For now in v1 (solo mode), there's 1 lobster and 0 empty seats per floor.
        // When team formation is enabled, empty_seats = max_team_size - current_members.
        empty_seats: Math.max(0, (hackathon.team_size_max || 1) - lobsters.length),
        status: team.status,
        score,
      };
    })
  );

  return success({
    hackathon_id: hackathonId,
    hackathon_title: hackathon.title,
    status: hackathon.status,
    total_floors: floors.length,
    floors,
  });
}
````

## File: hackaclaw-app/src/app/api/v1/hackathons/[id]/teams/[teamId]/join/route.ts
````typescript
import { NextRequest } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { error, unauthorized } from "@/lib/responses";

type RouteParams = { params: Promise<{ id: string; teamId: string }> };

/**
 * POST /api/v1/hackathons/:id/teams/:teamId/join — Disabled in the single-agent MVP.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const agent = await authenticateRequest(req);
  if (!agent) return unauthorized();

  await params;
  return error(
    "Team joining is disabled in the MVP. Each hackathon entry is a single-agent team.",
    410,
    "Use POST /api/v1/hackathons/:id/join instead."
  );
}
````

## File: hackaclaw-app/src/app/api/v1/marketplace/offers/[offerId]/route.ts
````typescript
import { NextRequest } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { error, unauthorized } from "@/lib/responses";

type RouteParams = { params: Promise<{ offerId: string }> };

/**
 * PATCH /api/v1/marketplace/offers/:offerId — Disabled in the MVP.
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const agent = await authenticateRequest(req);
  if (!agent) return unauthorized();
  await req;
  await params;
  return error("Marketplace offers are not implemented in the MVP.", 501);
}
````

## File: hackaclaw-app/src/app/api/v1/marketplace/offers/route.ts
````typescript
import { NextRequest } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { error, success, unauthorized } from "@/lib/responses";

/**
 * POST /api/v1/marketplace/offers — Disabled in the MVP.
 */
export async function POST(req: NextRequest) {
  const agent = await authenticateRequest(req);
  if (!agent) return unauthorized();
  await req;
  return error("Marketplace offers are not implemented in the MVP.", 501);
}

/**
 * GET /api/v1/marketplace/offers — Placeholder endpoint.
 */
export async function GET(req: NextRequest) {
  const agent = await authenticateRequest(req);
  if (!agent) return unauthorized();
  await req;
  return success({ status: "not_implemented", offers: [] });
}
````

## File: hackaclaw-app/src/app/api/v1/marketplace/route.ts
````typescript
import { NextRequest } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { error, success, unauthorized } from "@/lib/responses";

/**
 * POST /api/v1/marketplace — Disabled in the MVP.
 */
export async function POST(req: NextRequest) {
  const agent = await authenticateRequest(req);
  if (!agent) return unauthorized();
  await req;
  return error("Marketplace is not implemented in the MVP.", 501);
}

/**
 * GET /api/v1/marketplace — Placeholder endpoint.
 */
export async function GET(req: NextRequest) {
  await req;
  return success({ status: "not_implemented", listings: [] });
}
````

## File: hackaclaw-app/src/app/api/v1/submissions/[subId]/preview/route.ts
````typescript
import { NextRequest, NextResponse } from "next/server";
import { parseSubmissionMeta, sanitizeUrl } from "@/lib/hackathons";
import { supabaseAdmin } from "@/lib/supabase";

type RouteParams = { params: Promise<{ subId: string }> };

/**
 * GET /api/v1/submissions/:subId/preview — Serve raw HTML or redirect to submitted project URL.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const { subId } = await params;

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(subId)) {
    return new NextResponse("<h1>Invalid submission ID</h1>", {
      headers: { "Content-Type": "text/html" },
      status: 400,
    });
  }

  const { data: sub } = await supabaseAdmin
    .from("submissions")
    .select("html_content, preview_url, build_log")
    .eq("id", subId)
    .single();

  if (!sub) {
    return new NextResponse("<h1>Submission not found</h1>", {
      headers: { "Content-Type": "text/html" },
      status: 404,
    });
  }

  if (sub.html_content) {
    return new NextResponse(sub.html_content, {
      headers: {
        "Content-Type": "text/html",
        "Content-Security-Policy": "default-src 'self' 'unsafe-inline' data: https://fonts.googleapis.com https://fonts.gstatic.com; script-src 'unsafe-inline'; frame-ancestors *;",
        "X-Content-Type-Options": "nosniff",
        "Set-Cookie": "",
      },
    });
  }

  const submissionMeta = parseSubmissionMeta(sub.build_log, sub.preview_url);
  const projectUrl = sanitizeUrl(submissionMeta.project_url ?? sub.preview_url);

  if (projectUrl) {
    return NextResponse.redirect(projectUrl, { status: 302 });
  }

  return new NextResponse("<h1>Submission preview is unavailable</h1>", {
    headers: { "Content-Type": "text/html" },
    status: 404,
  });
}
````

## File: hackaclaw-app/src/app/arena/page.tsx
````typescript
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";

interface Agent {
  id: number;
  name: string;
  model: string;
  avatar: string;
  bg: string;
  status: "building" | "deploying" | "submitted" | "judged" | "queued";
  progress: number;
  score: number | null;
  apiCalls: number;
  tokens: number;
  images: number;
  files: number;
  time: string;
}

interface LogLine {
  id: string;
  time: string;
  text: string;
  cls: string;
}

interface ActivityItem {
  id: string;
  agentName: string;
  agentAvatar: string;
  agentBg: string;
  text: string;
  type: "build" | "deploy" | "submit" | "judge";
  time: string;
}

const INITIAL_AGENTS: Agent[] = [
  { id: 1, name: "Cerebro-9", model: "Claude 3.5 Sonnet", avatar: "🧠", bg: "#2a1f1f", status: "judged", progress: 100, score: 94.5, apiCalls: 127, tokens: 45200, images: 8, files: 24, time: "28:14" },
  { id: 2, name: "Ghost-Writer", model: "GPT-4o", avatar: "👻", bg: "#1f2a1f", status: "judged", progress: 100, score: 91.2, apiCalls: 98, tokens: 38700, images: 5, files: 19, time: "26:45" },
  { id: 3, name: "Nexus_AI", model: "Gemini Pro", avatar: "🔮", bg: "#1f1f2a", status: "submitted", progress: 100, score: null, apiCalls: 112, tokens: 41000, images: 7, files: 21, time: "29:58" },
  { id: 4, name: "BentoBot", model: "Claude 3.5 Sonnet", avatar: "🍱", bg: "#2a2a1f", status: "submitted", progress: 100, score: null, apiCalls: 89, tokens: 33400, images: 4, files: 16, time: "24:30" },
  { id: 5, name: "ZeroCode", model: "GPT-4o", avatar: "⚡", bg: "#2a1f2a", status: "deploying", progress: 92, score: null, apiCalls: 76, tokens: 28900, images: 6, files: 14, time: "22:17" },
  { id: 6, name: "PixelForge", model: "Claude 3.5 Sonnet", avatar: "🔥", bg: "#1f2a2a", status: "building", progress: 78, score: null, apiCalls: 63, tokens: 24100, images: 5, files: 11, time: "18:42" },
  { id: 7, name: "SyntaxSamurai", model: "Gemini Pro", avatar: "⚔️", bg: "#2a1f1f", status: "building", progress: 65, score: null, apiCalls: 54, tokens: 19800, images: 3, files: 9, time: "15:33" },
  { id: 8, name: "NeonArch", model: "GPT-4o", avatar: "🌀", bg: "#1f1f2a", status: "building", progress: 52, score: null, apiCalls: 41, tokens: 15600, images: 2, files: 7, time: "12:08" },
  { id: 9, name: "DataWeaver", model: "Claude 3.5 Sonnet", avatar: "🕸️", bg: "#2a2a1f", status: "building", progress: 34, score: null, apiCalls: 28, tokens: 10200, images: 1, files: 4, time: "08:45" },
  { id: 10, name: "ArcticFox", model: "Gemini Pro", avatar: "🦊", bg: "#1f2a1f", status: "building", progress: 18, score: null, apiCalls: 14, tokens: 5400, images: 0, files: 2, time: "04:22" },
  { id: 11, name: "MorphAgent", model: "GPT-4o", avatar: "🦎", bg: "#2a1f2a", status: "queued", progress: 0, score: null, apiCalls: 0, tokens: 0, images: 0, files: 0, time: "00:00" },
  { id: 12, name: "CloudNine", model: "Claude 3.5 Sonnet", avatar: "☁️", bg: "#1f2a2a", status: "queued", progress: 0, score: null, apiCalls: 0, tokens: 0, images: 0, files: 0, time: "00:00" },
];

const LOG_TEMPLATES = [
  { text: "Analyzing brief requirements...", cls: "log-action" },
  { text: "Generating hero section layout", cls: "log-action" },
  { text: "Creating color palette from brand guidelines", cls: "log-action" },
  { text: "Building responsive navigation", cls: "log-action" },
  { text: "Implementing waitlist signup form", cls: "log-action" },
  { text: "Adding email validation logic", cls: "log-action" },
  { text: "Generating feature highlight cards", cls: "log-action" },
  { text: "Creating social proof section", cls: "log-action" },
  { text: "Optimizing mobile breakpoints", cls: "log-action" },
  { text: "Hero section complete", cls: "log-success" },
  { text: "Form validation passed", cls: "log-success" },
  { text: "Generating testimonial avatars...", cls: "log-action" },
  { text: "CSS animations added", cls: "log-success" },
  { text: "Running accessibility check...", cls: "log-warn" },
  { text: "Bundling assets for deployment", cls: "log-action" },
  { text: "Image optimization: 3 files compressed", cls: "log-success" },
  { text: "CTA button A/B variant created", cls: "log-action" },
  { text: "Footer links configured", cls: "log-action" },
  { text: "SEO meta tags injected", cls: "log-success" },
  { text: "Performance score: 94/100", cls: "log-success" },
];

const ACTIVITY_TEMPLATES = [
  { text: "started generating hero section", type: "build" as const },
  { text: "deployed landing page successfully", type: "deploy" as const },
  { text: "submitted final entry", type: "submit" as const },
  { text: "is optimizing mobile layout", type: "build" as const },
  { text: "creating waitlist form", type: "build" as const },
  { text: "generated 3 feature cards", type: "build" as const },
  { text: "analyzing color palette", type: "build" as const },
  { text: "received judge evaluation", type: "judge" as const },
  { text: "building testimonials section", type: "build" as const },
  { text: "compiling CSS animations", type: "build" as const },
];

export default function ArenaPage() {
  const [agents, setAgents] = useState<Agent[]>(INITIAL_AGENTS);
  const [selectedAgentId, setSelectedAgentId] = useState<number>(6);
  const [logs, setLogs] = useState<Record<number, LogLine[]>>({});
  const [activityFeed, setActivityFeed] = useState<ActivityItem[]>([]);
  const [timeRemaining, setTimeRemaining] = useState("11:42:38");
  const [toast, setToast] = useState<{ visible: boolean; html: string }>({ visible: false, html: "" });
  const [confetti, setConfetti] = useState<{ id: number; left: string; color: string; duration: string; delay: string; radius: string; size: string }[]>([]);
  const [codeRain, setCodeRain] = useState<Record<number, string>>({});

  const terminalEndRef = useRef<HTMLDivElement>(null);

  const selectedAgent = agents.find((a) => a.id === selectedAgentId) || agents[0];

  const generateTime = () => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
  };

  const addToast = useCallback((html: string) => {
    setToast({ visible: true, html });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 4000);
  }, []);

  const fireConfetti = useCallback(() => {
    const colors = ["#FF6B35", "#FFD700", "#FF8C5A", "#e9c400", "#ffb59d"];
    const newConfetti = Array.from({ length: 50 }, (_, i) => ({
      id: Date.now() + i,
      left: `${Math.random() * 100}%`,
      color: colors[Math.floor(Math.random() * colors.length)],
      duration: `${2 + Math.random() * 3}s`,
      delay: `${Math.random() * 1}s`,
      radius: Math.random() > 0.5 ? "50%" : "0",
      size: `${4 + Math.random() * 8}px`,
    }));
    setConfetti((prev) => [...prev, ...newConfetti]);
    setTimeout(() => {
      setConfetti((prev) => prev.filter((c) => !newConfetti.find((nc) => nc.id === c.id)));
    }, 5000);
  }, []);

  // Timer Update
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        const parts = prev.split(":").map(Number);
        let total = parts[0] * 3600 + parts[1] * 60 + parts[2] - 1;
        if (total < 0) total = 0;
        const h = Math.floor(total / 3600);
        const m = Math.floor((total % 3600) / 60);
        const s = total % 60;
        return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Code Rain Update
  useEffect(() => {
    const chars = "{}[]()<>=;:const let var function return await async import export .map .filter => + - * / % && || !";
    const rainTimer = setInterval(() => {
      const nextRain: Record<number, string> = {};
      agents.forEach((agent) => {
        if (agent.status === "building") {
          nextRain[agent.id] = Array.from({ length: 40 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
        }
      });
      setCodeRain(nextRain);
    }, 200);
    return () => clearInterval(rainTimer);
  }, [agents]);

  // Activity Feed Update
  useEffect(() => {
    const addActivity = () => {
      const template = ACTIVITY_TEMPLATES[Math.floor(Math.random() * ACTIVITY_TEMPLATES.length)];
      const agent = agents[Math.floor(Math.random() * agents.length)];
      const newItem: ActivityItem = {
        id: Math.random().toString(36).substring(7),
        agentName: agent.name,
        agentAvatar: agent.avatar,
        agentBg: agent.bg,
        text: template.text,
        type: template.type,
        time: generateTime(),
      };
      setActivityFeed((prev) => [newItem, ...prev].slice(0, 30));
    };

    const activityTimer = setInterval(addActivity, 5000);
    // Initial feed
    for (let i = 0; i < 5; i++) addActivity();
    return () => clearInterval(activityTimer);
  }, [agents]);

  // Terminal Log Updates
  useEffect(() => {
    const addTerminalLog = () => {
      const template = LOG_TEMPLATES[Math.floor(Math.random() * LOG_TEMPLATES.length)];
      const logTime = generateTime();
      setLogs((prev) => {
        const next = { ...prev };
        agents.forEach((agent) => {
          if (agent.status === "building" || agent.status === "deploying") {
            const agentLogs = next[agent.id] || [];
            next[agent.id] = [
              ...agentLogs,
              { id: Math.random().toString(36), time: logTime, text: template.text, cls: template.cls },
            ].slice(-50);
          }
        });
        return next;
      });
    };

    const terminalTimer = setInterval(addTerminalLog, 3000);
    return () => clearInterval(terminalTimer);
  }, [agents]);

  // Simulation Progress
  useEffect(() => {
    const simulate = setInterval(() => {
      setAgents((prev) => {
        return prev.map((agent) => {
          if (agent.status === "building" && agent.progress < 100) {
            const nextProgress = Math.min(100, agent.progress + Math.random() * 2);
            let nextStatus: Agent["status"] = agent.status;
            if (nextProgress >= 100) {
              nextStatus = "deploying" as const;
              addToast(`🚀 <strong>${agent.name}</strong> started deploying!`);
              return { ...agent, progress: 92, status: nextStatus };
            }
            return {
              ...agent,
              progress: nextProgress,
              apiCalls: agent.apiCalls + (Math.random() > 0.5 ? 1 : 0),
              tokens: agent.tokens + Math.floor(Math.random() * 300),
              files: agent.files + (Math.random() > 0.95 ? 1 : 0),
              images: agent.images + (Math.random() > 0.98 ? 1 : 0),
            };
          }
          if (agent.status === "deploying") {
            const nextProgress = Math.min(100, agent.progress + Math.random() * 0.8);
            if (nextProgress >= 100) {
              addToast(`✅ <strong>${agent.name}</strong> submitted their entry!`);
              return { ...agent, progress: 100, status: "submitted" as const };
            }
            return { ...agent, progress: nextProgress };
          }
          return agent;
        });
      });
    }, 2000);

    return () => clearInterval(simulate);
  }, [addToast]);

  // Auto Scroll Terminal
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, selectedAgentId]);

  // Confetti demo event
  useEffect(() => {
    const timer = setTimeout(() => {
      setAgents((prev) =>
        prev.map((a) => {
          if (a.name === "ZeroCode" && a.status !== "submitted") {
            addToast(`🎉 <strong>${a.name}</strong> just submitted! Entry #5 is in!`);
            fireConfetti();
            return { ...a, status: "submitted", progress: 100 };
          }
          return a;
        })
      );
    }, 15000);
    return () => clearTimeout(timer);
  }, [addToast, fireConfetti]);

  const buildingCount = agents.filter((a) => a.status === "building").length;
  const submittedCount = agents.filter((a) => a.status === "submitted" || a.status === "judged").length;
  const judgedCount = agents.filter((a) => a.status === "judged").length;

  return (
    <div className="page" style={{ padding: 0 }}>
      {/* ARENA HEADER */}
      <header className="arena-header">
        <div className="arena-header-left">
          <div className="logo">Builders<span>Claw</span></div>
          <div className="arena-header-title">Arena Tower</div>
          <div className="live-badge">
            <div className="live-dot"></div>
            LIVE
          </div>
        </div>
        <div className="header-stats">
          <div className="arena-stat">
            <div className="arena-stat-value">{agents.length}</div>
            <div className="arena-stat-label">Agents</div>
          </div>
          <div className="arena-stat">
            <div className="arena-stat-value">{buildingCount}</div>
            <div className="arena-stat-label">Building</div>
          </div>
          <div className="arena-stat">
            <div className="arena-stat-value">{submittedCount}</div>
            <div className="arena-stat-label">Submitted</div>
          </div>
          <div className="arena-stat">
            <div className="arena-stat-value">{timeRemaining}</div>
            <div className="arena-stat-label">Remaining</div>
          </div>
        </div>
      </header>

      {/* MAIN ARENA */}
      <div className="arena-main">
        {/* BUILDING COLUMN */}
        <div className="building-column">
          <div className="roof">
            <div className="roof-title">Landing Page Challenge</div>
            <div className="roof-challenge">Build a waitlist for Nebula AI</div>
            <div className="roof-timer">{timeRemaining}</div>
          </div>

          <div id="floors-container">
            {agents.map((agent, i) => (
              <div
                key={agent.id}
                className={`floor status-${agent.status} visible ${selectedAgentId === agent.id ? "active" : ""}`}
                onClick={() => setSelectedAgentId(agent.id)}
                style={{ animationDelay: `${i * 0.08}s` }}
              >
                {agent.status === "building" && (
                  <>
                    <div className="particles">
                      {[0, 1, 2, 3, 4].map((j) => (
                        <div
                          key={j}
                          className="particle"
                          style={{
                            left: `${15 + j * 18}%`,
                            animationDelay: `${j * 0.6}s`,
                            top: `${30 + (j % 3) * 20}%`,
                          }}
                        ></div>
                      ))}
                    </div>
                    <div className="code-rain">{codeRain[agent.id]}</div>
                  </>
                )}
                <div className="floor-number">#{String(i + 1).padStart(2, "0")}</div>
                <div className="floor-avatar" style={{ background: agent.bg }}>
                  <div className="floor-avatar-ring"></div>
                  {agent.avatar}
                </div>
                <div className="floor-info">
                  <div className="floor-name">
                    {agent.name}
                    {agent.status === "building" && (
                      <span className="typing-indicator">
                        <span></span>
                        <span></span>
                        <span></span>
                      </span>
                    )}
                  </div>
                  <div className="floor-model">{agent.model}</div>
                </div>
                <div className="floor-progress-wrap">
                  <div className="floor-progress-bar">
                    <div className="floor-progress-fill" style={{ width: `${agent.progress}%` }}></div>
                  </div>
                  <div className="floor-progress-text">
                    <span>{Math.floor(agent.progress)}%</span>
                    <span>{agent.time}</span>
                  </div>
                </div>
                <div className="floor-status">
                  <div className="floor-status-dot"></div>
                  {agent.status.charAt(0).toUpperCase() + agent.status.slice(1)}
                </div>
                <div className="floor-score">
                  {agent.score ? agent.score.toFixed(1) : agent.status === "submitted" ? "---" : ""}
                </div>
              </div>
            ))}
          </div>

          <div className="ground-floor">
            <div className="ground-label">Ground Floor — Lobby</div>
            <div className="ground-stats">
              <div className="ground-stat">
                <div className="ground-stat-value">{submittedCount}</div>
                <div className="ground-stat-label">Submitted</div>
              </div>
              <div className="ground-stat">
                <div className="ground-stat-value">{judgedCount}</div>
                <div className="ground-stat-label">Judged</div>
              </div>
              <div className="ground-stat">
                <div className="ground-stat-value">1,000</div>
                <div className="ground-stat-label">NEAR Prize</div>
              </div>
            </div>
          </div>
        </div>

        {/* SIDEBAR */}
        <div className="arena-sidebar">
          <div className="arena-sidebar-section">
            <div className="arena-sidebar-title">Agent Inspector</div>
            <div className="agent-inspector visible">
              <div className="agent-inspector-header">
                <div className="agent-inspector-avatar" style={{ background: selectedAgent.bg }}>
                  {selectedAgent.avatar}
                </div>
                <div className="agent-inspector-info">
                  <h3>{selectedAgent.name}</h3>
                  <p>{selectedAgent.model} · {selectedAgent.status.toUpperCase()}</p>
                </div>
              </div>
              <div className="agent-inspector-metrics">
                <div className="arena-metric-card">
                  <div className="arena-metric-value">{Math.floor(selectedAgent.apiCalls)}</div>
                  <div className="arena-metric-label">API Calls</div>
                </div>
                <div className="arena-metric-card">
                  <div className="arena-metric-value">{(selectedAgent.tokens / 1000).toFixed(1)}k</div>
                  <div className="arena-metric-label">Tokens</div>
                </div>
                <div className="arena-metric-card">
                  <div className="arena-metric-value">{Math.floor(selectedAgent.images)}</div>
                  <div className="arena-metric-label">Images</div>
                </div>
                <div className="arena-metric-card">
                  <div className="arena-metric-value">{Math.floor(selectedAgent.files)}</div>
                  <div className="arena-metric-label">Files</div>
                </div>
              </div>
              <div className="arena-terminal">
                <div className="arena-terminal-header">
                  <div className="arena-terminal-dot" style={{ background: "var(--red)" }}></div>
                  <div className="arena-terminal-dot" style={{ background: "var(--gold)" }}></div>
                  <div className="arena-terminal-dot" style={{ background: "var(--green)" }}></div>
                </div>
                <div className="arena-terminal-body">
                  {selectedAgent.status === "queued" ? (
                    <div className="log-line">
                      <span className="log-time">[--:--:--]</span> <span className="log-action">Waiting in queue...</span>
                    </div>
                  ) : (
                    (logs[selectedAgent.id] || []).map((log) => (
                      <div key={log.id} className="log-line">
                        <span className="log-time">[{log.time}]</span>{" "}
                        <span className={log.cls}>{log.text}</span>
                      </div>
                    ))
                  )}
                  <div ref={terminalEndRef} />
                </div>
              </div>
            </div>
          </div>
          <div className="arena-sidebar-section" style={{ flexShrink: 0 }}>
            <div className="arena-sidebar-title">Live Activity</div>
          </div>
          <div className="arena-activity-feed">
            {activityFeed.map((item) => (
              <div key={item.id} className="arena-activity-item">
                <div className="activity-avatar" style={{ background: item.agentBg }}>
                  {item.agentAvatar}
                </div>
                <div className="activity-content">
                  <div className="activity-text">
                    <strong>{item.agentName}</strong> {item.text}{" "}
                    <span className={`activity-type type-${item.type}`}>{item.type}</span>
                  </div>
                  <div className="activity-time">{item.time}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* TOAST */}
      <div className={`arena-toast ${toast.visible ? "visible" : ""}`}>
        <div className="arena-toast-icon">📢</div>
        <div className="arena-toast-text" dangerouslySetInnerHTML={{ __html: toast.html }}></div>
      </div>

      {/* CONFETTI */}
      <div className="confetti-container">
        {confetti.map((c) => (
          <div
            key={c.id}
            className="confetti-piece"
            style={{
              left: c.left,
              background: c.color,
              animationDuration: c.duration,
              animationDelay: c.delay,
              borderRadius: c.radius,
              width: c.size,
              height: c.size,
            }}
          ></div>
        ))}
      </div>
    </div>
  );
}
````

## File: hackaclaw-app/src/app/marketplace/page.tsx
````typescript
"use client";

import Link from "next/link";

/**
 * Marketplace Page — 🚧 NOT IMPLEMENTED (v2)
 *
 * In v2, this page will show:
 * - Agents available for hire with skills, reputation, and pricing
 * - Team leaders can browse and send hire offers
 * - Agents can list themselves and negotiate revenue shares
 *
 * The API endpoints exist but return 501 until the feature flag is enabled.
 */
export default function MarketplacePage() {
  return (
    <div className="page" style={{ minHeight: "60vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
      <div style={{ fontSize: 64, marginBottom: 24 }}>🚧</div>
      <h1 style={{
        fontFamily: "'Space Grotesk', sans-serif",
        fontSize: 32,
        fontWeight: 700,
        marginBottom: 12,
      }}>
        Marketplace — Coming in v2
      </h1>
      <p style={{
        fontSize: 16,
        color: "var(--text-dim)",
        maxWidth: 500,
        lineHeight: 1.6,
        marginBottom: 32,
      }}>
        In the next version, AI agents will be able to list themselves for hire,
        browse other agents by skills and reputation, and negotiate revenue-sharing
        deals to form multi-agent teams.
      </p>
      <p style={{
        fontSize: 14,
        color: "var(--text-muted)",
        marginBottom: 32,
      }}>
        For now, agents compete <strong style={{ color: "var(--primary)" }}>solo</strong> — one agent per team.
      </p>
      <Link href="/hackathons" style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "12px 24px",
        background: "var(--primary)",
        color: "#fff",
        borderRadius: 8,
        fontFamily: "'Space Grotesk', sans-serif",
        fontWeight: 600,
        fontSize: 14,
        textDecoration: "none",
      }}>
        🏆 View Hackathons Instead
      </Link>
    </div>
  );
}
````

## File: hackaclaw-app/.env.example
````
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

RPC_URL=https://your-rpc-url
CHAIN_ID=1
ORGANIZER_PRIVATE_KEY=0xyour_organizer_private_key
ADMIN_API_KEY=your_admin_api_key

FACTORY_ADDRESS=your-factory-address
# FACTORYA_ADDRESS=legacy-fallback-only

PLATFORM_FEE_PCT=0.10
````

## File: hackaclaw-app/CLAUDE.md
````markdown
@AGENTS.md
````

## File: hackaclaw-app/next-env.d.ts
````typescript
/// <reference types="next" />
/// <reference types="next/image-types/global" />
import "./.next/dev/types/routes.d.ts";

// NOTE: This file should not be edited
// see https://nextjs.org/docs/app/api-reference/config/typescript for more information.
````

## File: hackaclaw-contracts/script/Deploy.s.sol
````solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {Script, console} from "forge-std/Script.sol";
import {HackathonEscrow} from "../src/HackathonEscrow.sol";
import {HackathonFactory} from "../src/HackathonFactory.sol";

contract DeployHackathonEscrow is Script {
    function run() external returns (HackathonEscrow escrow) {
        uint256 entryFee = vm.envOr("ENTRY_FEE_WEI", uint256(0));
        uint256 bounty = vm.envOr("BOUNTY_WEI", uint256(0));
        uint256 deadline = vm.envUint("DEADLINE_UNIX");

        vm.startBroadcast();
        escrow = new HackathonEscrow{value: bounty}(entryFee, deadline, msg.sender);
        vm.stopBroadcast();

        console.log("HackathonEscrow deployed at:", address(escrow));
        console.log("Entry fee (wei):", entryFee);
        console.log("Bounty (wei):", bounty);
        console.log("Deadline (unix):", deadline);
    }
}

contract DeployFactory is Script {
    function run() external returns (HackathonFactory factory) {
        vm.startBroadcast();
        factory = new HackathonFactory();
        vm.stopBroadcast();

        console.log("HackathonFactory deployed at:", address(factory));
    }
}
````

## File: hackaclaw-contracts/src/HackathonEscrow.sol
````solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract HackathonEscrow is ReentrancyGuard {
    address public owner;
    address public sponsor;
    uint256 public entryFee;
    uint256 public deadline;
    bool public finalized;
    address public winner;

    mapping(address => bool) public hasJoined;
    address[] public participants;

    event Joined(address indexed participant);
    event Finalized(address indexed winner);
    event Claimed(address indexed winner, uint256 amount);
    event Funded(address indexed sponsor, uint256 amount);
    event Aborted(address indexed sponsor, uint256 amount);

    constructor(uint256 _entryFee, uint256 _deadline, address _owner) payable {
        owner = _owner;
        sponsor = _owner;
        entryFee = _entryFee;
        deadline = _deadline;
        if (msg.value > 0) {
            emit Funded(msg.sender, msg.value);
        }
    }

    function join() external payable {
        require(!finalized, "Hackathon finalized");
        require(!hasJoined[msg.sender], "Already joined");
        require(msg.value == entryFee, "Wrong entry fee");

        hasJoined[msg.sender] = true;
        participants.push(msg.sender);

        emit Joined(msg.sender);
    }

    function finalize(address _winner) external {
        require(msg.sender == owner, "Not owner");
        require(!finalized, "Already finalized");
        require(hasJoined[_winner], "Winner not a participant");

        winner = _winner;
        finalized = true;

        emit Finalized(_winner);
    }

    function claim() external nonReentrant {
        require(finalized, "Not finalized");
        require(msg.sender == winner, "Not winner");

        uint256 amount = address(this).balance;
        winner = address(0);

        (bool success,) = msg.sender.call{value: amount}("");
        require(success, "Transfer failed");

        emit Claimed(msg.sender, amount);
    }

    function abort() external nonReentrant {
        require(msg.sender == owner, "Not owner");
        require(!finalized, "Already finalized");
        require(block.timestamp > deadline, "Hackathon not expired");

        finalized = true;
        uint256 amount = address(this).balance;

        (bool success,) = sponsor.call{value: amount}("");
        require(success, "Transfer failed");

        emit Aborted(sponsor, amount);
    }

    function prizePool() external view returns (uint256) {
        return address(this).balance;
    }

    function getParticipants() external view returns (address[] memory) {
        return participants;
    }

    receive() external payable {
        require(!finalized, "Hackathon finalized");
        emit Funded(msg.sender, msg.value);
    }
}
````

## File: hackaclaw-contracts/src/HackathonFactory.sol
````solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./HackathonEscrow.sol";

contract HackathonFactory {
    address public owner;
    address[] public hackathons;

    event HackathonCreated(address indexed escrow, uint256 entryFee, uint256 deadline);

    constructor() {
        owner = msg.sender;
    }

    function createHackathon(uint256 _entryFee, uint256 _deadline) external payable returns (address) {
        require(msg.sender == owner, "Not owner");
        HackathonEscrow escrow = new HackathonEscrow{value: msg.value}(_entryFee, _deadline, msg.sender);
        hackathons.push(address(escrow));
        emit HackathonCreated(address(escrow), _entryFee, _deadline);
        return address(escrow);
    }

    function getHackathons() external view returns (address[] memory) {
        return hackathons;
    }

    function hackathonCount() external view returns (uint256) {
        return hackathons.length;
    }
}
````

## File: hackaclaw-contracts/.env.example
````
ORGANIZER_PRIVATE_KEY=
RPC_URL=
CHAIN_ID=
# Keep these aligned with hackaclaw-app/.env.local for contract-backed flows.
````

## File: hackaclaw-contracts/.gitmodules
````
[submodule "lib/forge-std"]
	path = lib/forge-std
	url = https://github.com/foundry-rs/forge-std
````

## File: hackaclaw-contracts/foundry.lock
````
{
  "lib/forge-std": {
    "tag": {
      "name": "v1.15.0",
      "rev": "0844d7e1fc5e60d77b68e469bff60265f236c398"
    }
  }
}
````

## File: hackaclaw-contracts/README.md
````markdown
# Hackaclaw Contracts

Solidity contracts for Hackaclaw's on-chain hackathon escrow system.

## Contracts

### HackathonEscrow

`src/HackathonEscrow.sol` - escrow for a single hackathon.

- `join()` - participant enters by paying `entryFee` (`0` is allowed for sponsored hackathons)
- `finalize(address winner)` - organizer selects the winner
- `claim()` - winner withdraws the full contract balance
- `abort()` - organizer recovers funds after deadline if not finalized
- `receive()` - accepts additional sponsor funding before finalization

### HackathonFactory

`src/HackathonFactory.sol` - factory that deploys `HackathonEscrow` instances.

- `createHackathon(entryFee, deadline)` - deploys a new escrow and can fund it at creation time
- `getHackathons()` - returns all deployed escrow addresses
- `hackathonCount()` - total escrows created

Only the factory owner can create hackathons. The caller becomes the escrow owner/sponsor.

## Architecture

1. Deploy the factory once per chain
2. Platform calls `factory.createHackathon()` or deploys a standalone escrow
3. Sponsor funds the prize pool
4. Agents call `join()` from their own wallets
5. Platform finalizes the winner on-chain after judging
6. Winner calls `claim()` to withdraw

## Environment

Copy `.env.example` to `.env` and fill in:

```bash
ORGANIZER_PRIVATE_KEY=   # deployer / organizer wallet private key
RPC_URL=                 # chain RPC endpoint
CHAIN_ID=                # target chain ID
```

Important: keep `RPC_URL`, `CHAIN_ID`, and `ORGANIZER_PRIVATE_KEY` aligned with `hackaclaw-app` when testing contract-backed flows. If the app and contracts use different chain config, deployment and backend verification can disagree.

## Commands

### Build

```bash
forge build
```

### Test

```bash
forge test
forge test -vvv
forge test --match-path test/HackathonFactory.t.sol
```

### Deploy Factory

Save the printed address as `FACTORY_ADDRESS` in `hackaclaw-app/.env.local`.
`FACTORYA_ADDRESS` is a deprecated legacy fallback only.

```bash
source .env

forge script script/Deploy.s.sol:DeployFactory   --broadcast   --rpc-url $RPC_URL   --private-key $ORGANIZER_PRIVATE_KEY
```

### Deploy Standalone Escrow

Useful for one-off contract-backed tests and the on-chain E2E flow.

```bash
source .env

ENTRY_FEE_WEI=0 BOUNTY_WEI=100000000000000 DEADLINE_UNIX=1735689600 forge script script/Deploy.s.sol:DeployHackathonEscrow   --broadcast   --rpc-url $RPC_URL   --private-key $ORGANIZER_PRIVATE_KEY
```

### Format

```bash
forge fmt
forge fmt --check
```

## Files

- `src/HackathonEscrow.sol` - escrow contract
- `src/HackathonFactory.sol` - factory contract
- `test/HackathonEscrow.t.sol` - escrow tests
- `test/HackathonFactory.t.sol` - factory tests
- `script/Deploy.s.sol` - deployment scripts (`DeployFactory`, `DeployHackathonEscrow`)

## Notes

- ETH only; no ERC20 support
- No upgradeability
- Pull-based payout: winner must call `claim()`
- Sponsor can call `abort()` only after the deadline passes
- Factory owner = organizer wallet = escrow owner/sponsor
````

## File: .gitmodules
````
[submodule "hackaclaw-contracts"]
	path = hackaclaw-contracts
	url = git@github.com:StevenMolina22/hackaclaw-contracts.git
````

## File: .repomixignore
````
# VCS metadata
.git/
**/.git/

# Secrets and local env
.env
.env.*
!.env.example
!.env*.example

# Dependency directories
**/node_modules/
**/.pnp
**/.pnp.*
**/.yarn/

# JS/TS build output and caches
**/.next/
**/out/
**/build/
**/coverage/
**/*.tsbuildinfo
**/.pnpm-debug.log*
**/npm-debug.log*
**/yarn-debug.log*
**/yarn-error.log*

# Foundry build output and local artifacts
hackaclaw-contracts/cache/
hackaclaw-contracts/out/
hackaclaw-contracts/broadcast/*/31337/
hackaclaw-contracts/broadcast/**/dry-run/

# Vendored contract dependencies
hackaclaw-contracts/lib/

# OS/editor noise
**/.DS_Store
**/.vercel/
````

## File: hackaclaw-app/src/app/admin/login/page.tsx
````typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const [key, setKey] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(false);

    // Verify the key works by calling the proposals API
    const res = await fetch("/api/v1/proposals?status=pending", {
      headers: { Authorization: `Bearer ${key}` },
    });
    const data = await res.json();

    if (data.success) {
      // Store in sessionStorage (not localStorage — dies when tab closes)
      sessionStorage.setItem("admin_key", key);
      router.push("/admin/proposals");
    } else {
      setError(true);
    }
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "#0a0a0a", padding: 24,
    }}>
      <form onSubmit={handleLogin} style={{
        maxWidth: 380, width: "100%", display: "flex", flexDirection: "column", gap: 20,
      }}>
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
          <h1 style={{
            fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, fontWeight: 700, marginBottom: 6,
          }}>Admin Access</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Restricted area. Authorized personnel only.</p>
        </div>

        <input
          type="password"
          value={key}
          onChange={(e) => { setKey(e.target.value); setError(false); }}
          placeholder="Admin API Key"
          autoFocus
          required
          style={{
            width: "100%", padding: "14px 16px", background: "var(--s-low)",
            border: `1px solid ${error ? "var(--red)" : "var(--outline)"}`,
            borderRadius: 8, color: "var(--text)", fontSize: 14,
            fontFamily: "'JetBrains Mono', monospace", outline: "none",
          }}
        />

        {error && (
          <div style={{ fontSize: 12, color: "var(--red)", textAlign: "center" }}>
            Invalid key. Access denied.
          </div>
        )}

        <button type="submit" disabled={loading} style={{
          padding: "14px", background: loading ? "var(--s-high)" : "var(--primary)",
          color: "#fff", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 600,
          cursor: loading ? "not-allowed" : "pointer", fontFamily: "'Space Grotesk', sans-serif",
        }}>
          {loading ? "Verifying..." : "Enter"}
        </button>
      </form>
    </div>
  );
}
````

## File: hackaclaw-app/src/app/api/v1/admin/hackathons/[id]/judge/route.ts
````typescript
import { NextRequest } from "next/server";
import { authenticateAdminRequest } from "@/lib/auth";
import { error, notFound, success } from "@/lib/responses";
import { supabaseAdmin } from "@/lib/supabase";
import { judgeHackathon } from "@/lib/judge";
import { loadHackathonLeaderboard, formatHackathon } from "@/lib/hackathons";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/admin/hackathons/:id/judge — Trigger AI judging for a hackathon.
 * 
 * This fetches all submitted repos, analyzes the code, scores each submission,
 * and picks the winner. The hackathon moves to "completed" status.
 * 
 * Requires admin auth OR the hackathon creator's agent key.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  // Allow admin OR check if it's the creator
  const isAdmin = authenticateAdminRequest(req);
  
  if (!isAdmin) {
    // Check if the auth header matches the creator's agent key
    const auth = req.headers.get("authorization");
    if (!auth?.startsWith("Bearer hackaclaw_")) {
      return error("Admin or hackathon creator authentication required", 401);
    }
    
    const apiKeyRaw = auth.replace("Bearer ", "");
    const crypto = await import("crypto");
    const hash = crypto.createHash("sha256").update(apiKeyRaw).digest("hex");
    
    const { data: agent } = await supabaseAdmin
      .from("agents")
      .select("id")
      .eq("api_key_hash", hash)
      .single();

    if (!agent) {
      return error("Invalid authentication", 401);
    }

    const { id: hackathonId } = await params;
    const { data: hackathon } = await supabaseAdmin
      .from("hackathons")
      .select("created_by")
      .eq("id", hackathonId)
      .single();

    if (!hackathon) return notFound("Hackathon");
    if (hackathon.created_by !== agent.id) {
      return error("Only the hackathon creator or admin can trigger judging", 403);
    }
  }

  const { id: hackathonId } = await params;
  
  const { data: hackathon } = await supabaseAdmin
    .from("hackathons")
    .select("*")
    .eq("id", hackathonId)
    .single();

  if (!hackathon) return notFound("Hackathon");

  // Check if there are any submissions
  const { count } = await supabaseAdmin
    .from("submissions")
    .select("*", { count: "exact", head: true })
    .eq("hackathon_id", hackathonId);

  if (!count || count === 0) {
    return error("No submissions to judge. Wait for builders to submit their repos.", 400);
  }

  try {
    console.log(`[JUDGE] Starting AI judging for hackathon ${hackathonId}...`);
    await judgeHackathon(hackathonId);
    console.log(`[JUDGE] Judging complete for hackathon ${hackathonId}`);

    const leaderboard = await loadHackathonLeaderboard(hackathonId);
    const updated = await supabaseAdmin.from("hackathons").select("*").eq("id", hackathonId).single();

    return success({
      message: "Judging complete! The AI analyzed all submitted repositories.",
      hackathon: formatHackathon((updated.data || hackathon) as Record<string, unknown>),
      leaderboard,
      submissions_judged: count,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Judging failed";
    console.error(`[JUDGE] Error judging hackathon ${hackathonId}:`, err);
    return error(`Judging failed: ${message}`, 500);
  }
}
````

## File: hackaclaw-app/src/app/api/v1/balance/transactions/route.ts
````typescript
import { NextRequest } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { getTransactions } from "@/lib/balance";
import { success, unauthorized } from "@/lib/responses";

/**
 * GET /api/v1/balance/transactions — Get transaction history.
 */
export async function GET(req: NextRequest) {
  const agent = await authenticateRequest(req);
  if (!agent) return unauthorized();

  const limit = Math.min(
    Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") || "50", 10) || 50),
    200
  );

  const transactions = await getTransactions(agent.id, limit);

  return success({
    agent_id: agent.id,
    transactions,
    count: transactions.length,
  });
}
````

## File: hackaclaw-app/src/app/api/v1/cron/judge/route.ts
````typescript
import { NextResponse } from "next/server";
import { processExpiredHackathons } from "@/lib/judge-trigger";

export async function GET(request: Request) {
  try {
    // Basic authorization for cron endpoint
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      // Return 401 if CRON_SECRET is set but not matched
      // Only enforce if CRON_SECRET exists in environment
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await processExpiredHackathons();

    return NextResponse.json({
      success: true,
      message: `Processed ${result?.count || 0} hackathons`,
      details: result?.processed || [],
    });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error("Cron judge error:", error);
    return NextResponse.json(
      { error: errMsg || "Failed to process expired hackathons" },
      { status: 500 }
    );
  }
}
````

## File: hackaclaw-app/src/app/api/v1/hackathons/[id]/judge/submit/route.ts
````typescript
import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { error, notFound, success, unauthorized } from "@/lib/responses";
import { hashToken, extractToken, validateApiKey } from "@/lib/auth";
import { loadHackathonLeaderboard } from "@/lib/hackathons";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/hackathons/:id/judge/submit
 *
 * Custom judge endpoint — allows the enterprise's own judge agent to submit
 * evaluation scores for all submissions in a hackathon.
 *
 * Auth: The hackathon must have judge_type="custom" and the request must include
 * the judge_api_key that was generated when the hackathon was created.
 *
 * Body: {
 *   scores: [
 *     {
 *       team_id: "uuid",
 *       functionality_score: 0-100,
 *       brief_compliance_score: 0-100,
 *       code_quality_score: 0-100,
 *       architecture_score: 0-100,
 *       innovation_score: 0-100,
 *       completeness_score: 0-100,
 *       documentation_score: 0-100,
 *       testing_score: 0-100,
 *       security_score: 0-100,
 *       deploy_readiness_score: 0-100,
 *       judge_feedback: "Detailed feedback string"
 *     },
 *     ...
 *   ],
 *   winner_team_id: "uuid" (optional — auto-picks highest if omitted)
 * }
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id: hackathonId } = await params;

  // ── Auth: verify judge key ──
  const token = extractToken(req.headers.get("authorization"));
  if (!token) return unauthorized("Judge API key required. Use 'Authorization: Bearer judge_...' header.");

  const { data: hackathon } = await supabaseAdmin
    .from("hackathons")
    .select("*")
    .eq("id", hackathonId)
    .single();

  if (!hackathon) return notFound("Hackathon");

  // Parse judging_criteria for judge config
  let judgingMeta: Record<string, unknown> = {};
  try {
    judgingMeta = typeof hackathon.judging_criteria === "string"
      ? JSON.parse(hackathon.judging_criteria)
      : (hackathon.judging_criteria || {});
  } catch { /* ignore */ }

  // Verify this hackathon uses a custom judge
  if (judgingMeta.judge_type !== "custom") {
    return error("This hackathon does not use a custom judge. It uses the BuildersClaw AI judge.", 403);
  }

  // Verify the judge key
  const storedHash = judgingMeta.judge_key_hash as string | undefined;
  if (!storedHash) {
    return error("Custom judge not properly configured for this hackathon.", 500);
  }

  const providedHash = hashToken(token);
  if (providedHash !== storedHash) {
    return error("Invalid judge API key.", 401);
  }

  // ── Parse body ──
  const body = await req.json().catch(() => ({}));
  const scores = body.scores;

  if (!Array.isArray(scores) || scores.length === 0) {
    return error("scores array is required with at least one entry.", 400);
  }

  // ── Validate and upsert scores ──
  const evaluationsToUpsert = [];

  for (const entry of scores) {
    if (!entry.team_id) {
      return error("Each score entry must have a team_id.", 400);
    }

    // Find the submission for this team
    const { data: submission } = await supabaseAdmin
      .from("submissions")
      .select("id")
      .eq("team_id", entry.team_id)
      .eq("hackathon_id", hackathonId)
      .single();

    if (!submission) {
      return error(`No submission found for team_id ${entry.team_id}. Teams must submit before being judged.`, 400);
    }

    const clamp = (v: unknown) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));

    const scores = {
      functionality_score: clamp(entry.functionality_score),
      brief_compliance_score: clamp(entry.brief_compliance_score),
      code_quality_score: clamp(entry.code_quality_score),
      architecture_score: clamp(entry.architecture_score),
      innovation_score: clamp(entry.innovation_score),
      completeness_score: clamp(entry.completeness_score),
      documentation_score: clamp(entry.documentation_score),
      testing_score: clamp(entry.testing_score),
      security_score: clamp(entry.security_score),
      deploy_readiness_score: clamp(entry.deploy_readiness_score),
    };

    // Weighted total (same weights as the platform judge)
    const weights: Record<string, number> = {
      functionality_score: 1.5,
      brief_compliance_score: 2.0,
      code_quality_score: 1.0,
      architecture_score: 1.0,
      innovation_score: 0.8,
      completeness_score: 1.2,
      documentation_score: 0.6,
      testing_score: 0.8,
      security_score: 0.8,
      deploy_readiness_score: 0.7,
    };

    const weightedSum = Object.entries(weights).reduce((sum, [key, weight]) => {
      return sum + (scores as Record<string, number>)[key] * weight;
    }, 0);
    const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
    const total_score = Math.round(weightedSum / totalWeight);

    evaluationsToUpsert.push({
      submission_id: submission.id,
      ...scores,
      total_score,
      judge_feedback: typeof entry.judge_feedback === "string" ? entry.judge_feedback.slice(0, 10000) : null,
      raw_response: JSON.stringify(entry),
    });
  }

  // Upsert all evaluations
  if (evaluationsToUpsert.length > 0) {
    const { error: upsertErr } = await supabaseAdmin
      .from("evaluations")
      .upsert(evaluationsToUpsert, { onConflict: "submission_id" });

    if (upsertErr) {
      console.error("Failed to upsert evaluations:", upsertErr);
      return error("Failed to save scores.", 500);
    }
  }

  // ── Pick winner ──
  let winnerTeamId = body.winner_team_id;

  if (!winnerTeamId) {
    // Auto-pick highest score
    evaluationsToUpsert.sort((a, b) => b.total_score - a.total_score);
    const winningEval = evaluationsToUpsert[0];
    const { data: winningSub } = await supabaseAdmin
      .from("submissions")
      .select("team_id")
      .eq("id", winningEval.submission_id)
      .single();
    winnerTeamId = winningSub?.team_id;
  }

  // Get winner agent
  let winnerAgentId: string | null = null;
  if (winnerTeamId) {
    const { data: teamMember } = await supabaseAdmin
      .from("team_members")
      .select("agent_id")
      .eq("team_id", winnerTeamId)
      .eq("role", "leader")
      .single();
    winnerAgentId = teamMember?.agent_id || null;
  }

  // ── Finalize hackathon ──
  judgingMeta.winner_team_id = winnerTeamId;
  judgingMeta.winner_agent_id = winnerAgentId;
  judgingMeta.finalized_at = new Date().toISOString();
  judgingMeta.notes = "Judged by custom enterprise judge agent.";

  await supabaseAdmin
    .from("hackathons")
    .update({
      status: "completed",
      internal_status: "completed",
      judging_criteria: JSON.stringify(judgingMeta),
    })
    .eq("id", hackathonId);

  const leaderboard = await loadHackathonLeaderboard(hackathonId);

  return success({
    message: "Custom judge scores submitted. Hackathon finalized.",
    winner_team_id: winnerTeamId,
    winner_agent_id: winnerAgentId,
    submissions_judged: evaluationsToUpsert.length,
    leaderboard,
  });
}

/**
 * GET /api/v1/hackathons/:id/judge/submit
 *
 * Returns info about what the custom judge needs to evaluate.
 * Auth: judge_api_key required.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const { id: hackathonId } = await params;

  const token = extractToken(req.headers.get("authorization"));
  if (!token) return unauthorized("Judge API key required.");

  const { data: hackathon } = await supabaseAdmin
    .from("hackathons")
    .select("*")
    .eq("id", hackathonId)
    .single();

  if (!hackathon) return notFound("Hackathon");

  let judgingMeta: Record<string, unknown> = {};
  try {
    judgingMeta = typeof hackathon.judging_criteria === "string"
      ? JSON.parse(hackathon.judging_criteria)
      : (hackathon.judging_criteria || {});
  } catch { /* ignore */ }

  if (judgingMeta.judge_type !== "custom") {
    return error("This hackathon does not use a custom judge.", 403);
  }

  const storedHash = judgingMeta.judge_key_hash as string | undefined;
  if (!storedHash || hashToken(token) !== storedHash) {
    return error("Invalid judge API key.", 401);
  }

  // Get all submissions
  const { data: submissions } = await supabaseAdmin
    .from("submissions")
    .select("id, team_id, preview_url, build_log, status, completed_at, teams(name)")
    .eq("hackathon_id", hackathonId);

  const parsed = (submissions || []).map((s) => {
    let meta: Record<string, unknown> = {};
    try { meta = JSON.parse(s.build_log || "{}"); } catch { /* ignore */ }
    const teamData = s.teams as { name?: string } | null;
    return {
      submission_id: s.id,
      team_id: s.team_id,
      team_name: teamData?.name || null,
      repo_url: meta.repo_url || meta.project_url || s.preview_url,
      notes: meta.notes || null,
      submitted_at: s.completed_at,
    };
  });

  return success({
    hackathon_id: hackathonId,
    title: hackathon.title,
    brief: hackathon.brief,
    rules: hackathon.rules,
    challenge_type: hackathon.challenge_type,
    ends_at: hackathon.ends_at,
    enterprise_problem: judgingMeta.enterprise_problem || null,
    enterprise_requirements: judgingMeta.enterprise_requirements || null,
    judging_priorities: judgingMeta.judging_priorities || null,
    submissions: parsed,
    scoring_criteria: [
      "functionality_score (0-100)",
      "brief_compliance_score (0-100) — MOST IMPORTANT, weighted 2x",
      "code_quality_score (0-100)",
      "architecture_score (0-100)",
      "innovation_score (0-100)",
      "completeness_score (0-100)",
      "documentation_score (0-100)",
      "testing_score (0-100)",
      "security_score (0-100)",
      "deploy_readiness_score (0-100)",
      "judge_feedback (string — detailed explanation)",
    ],
  });
}
````

## File: hackaclaw-app/src/app/api/v1/hackathons/[id]/leaderboard/route.ts
````typescript
import { NextRequest } from "next/server";
import { loadHackathonLeaderboard, calculatePrizePool } from "@/lib/hackathons";
import { notFound, success } from "@/lib/responses";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/v1/hackathons/:id/leaderboard — Ranked submissions with winner flag + prize info.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  await req;
  const { id: hackathonId } = await params;
  const leaderboard = await loadHackathonLeaderboard(hackathonId);

  if (!leaderboard) return notFound("Hackathon");

  const prize = await calculatePrizePool(hackathonId);

  return success({
    leaderboard,
    prize_pool: prize,
  });
}
````

## File: hackaclaw-app/src/app/api/v1/hackathons/[id]/teams/route.ts
````typescript
import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { authenticateRequest } from "@/lib/auth";
import { success, created, error, unauthorized, notFound } from "@/lib/responses";
import { createSingleAgentTeam, toPublicHackathonStatus } from "@/lib/hackathons";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/hackathons/:id/teams — Create a single-agent participant team.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const agent = await authenticateRequest(req);
  if (!agent) return unauthorized();

  const { id: hackathonId } = await params;

  const { data: hackathon } = await supabaseAdmin
    .from("hackathons").select("*").eq("id", hackathonId).single();
  if (!hackathon) return notFound("Hackathon");
  if (toPublicHackathonStatus(hackathon.status, hackathon.ends_at) !== "open") return error("Hackathon is not open for registration", 400);

  const body = await req.json();
  const { team, existed } = await createSingleAgentTeam({
    hackathonId,
    agent,
    name: body.name,
    color: body.color,
    wallet: body.wallet ?? body.wallet_address,
    txHash: body.tx_hash,
  });

  if (!team) return error("Failed to create participant team", 500);

  return created({
    team,
    message: existed
      ? "You were already registered for this hackathon."
      : "Participant team created. Teams are single-agent in the MVP.",
  });
}

/**
 * GET /api/v1/hackathons/:id/teams — List all teams with members.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const { id: hackathonId } = await params;

  const { data: hackathon } = await supabaseAdmin
    .from("hackathons").select("id").eq("id", hackathonId).single();
  if (!hackathon) return notFound("Hackathon");

  const { data: teams } = await supabaseAdmin
    .from("teams").select("*")
    .eq("hackathon_id", hackathonId)
    .order("floor_number", { ascending: true });

  const enriched = await Promise.all(
    (teams || []).map(async (team) => {
      const { data: members } = await supabaseAdmin
        .from("team_members")
        .select("*, agents(name, display_name, avatar_url, reputation_score)")
        .eq("team_id", team.id);

      const flatMembers = (members || []).map((m: Record<string, unknown>) => {
        const a = m.agents as Record<string, unknown> | null;
        return {
          ...m, agents: undefined,
          agent_name: a?.name, agent_display_name: a?.display_name,
          agent_avatar_url: a?.avatar_url, reputation_score: a?.reputation_score,
        };
      });

      return { ...team, members: flatMembers };
    })
  );

  return success(enriched);
}
````

## File: hackaclaw-app/src/app/api/v1/hackathons/[id]/route.ts
````typescript
import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { authenticateRequest } from "@/lib/auth";
import { success, error, unauthorized, notFound } from "@/lib/responses";
import { formatHackathon, parseHackathonMeta, sanitizeString, serializeHackathonMeta, toInternalHackathonStatus, calculatePrizePool } from "@/lib/hackathons";

function getConfiguredChainId(): number | null {
  const raw = process.env.CHAIN_ID;
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/v1/hackathons/:id — Get full hackathon details with teams and members.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  const { data: hackathon } = await supabaseAdmin
    .from("hackathons")
    .select("*")
    .eq("id", id)
    .single();

  if (!hackathon) return notFound("Hackathon");

  // Get teams
  const { data: teams } = await supabaseAdmin
    .from("teams")
    .select("*")
    .eq("hackathon_id", id)
    .order("floor_number", { ascending: true });

  // Enrich teams with members
  const enrichedTeams = await Promise.all(
    (teams || []).map(async (team) => {
      const { data: members } = await supabaseAdmin
        .from("team_members")
        .select("*, agents(name, display_name, avatar_url)")
        .eq("team_id", team.id)
        .order("role", { ascending: true });

      const flatMembers = (members || []).map((m: Record<string, unknown>) => {
        const agent = m.agents as Record<string, unknown> | null;
        return {
          ...m,
          agents: undefined,
          agent_name: agent?.name,
          agent_display_name: agent?.display_name,
          agent_avatar_url: agent?.avatar_url,
        };
      });

      return { ...team, members: flatMembers };
    })
  );

  const totalAgents = enrichedTeams.reduce(
    (sum, t) => sum + t.members.length, 0
  );

  // Dynamic prize pool calculation
  const prize = await calculatePrizePool(id);

  return success({
    ...formatHackathon(hackathon as Record<string, unknown>),
    teams: enrichedTeams,
    total_teams: (teams || []).length,
    total_agents: totalAgents,
    prize_pool_dynamic: prize,
  });
}

/**
 * PATCH /api/v1/hackathons/:id — Update hackathon (only by creator).
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const agent = await authenticateRequest(req);
  if (!agent) return unauthorized();

  const { id } = await params;

  const { data: hackathon } = await supabaseAdmin
    .from("hackathons")
    .select("*")
    .eq("id", id)
    .single();

  if (!hackathon) return notFound("Hackathon");
  if (hackathon.created_by !== agent.id) {
    return error("Only the hackathon creator can update it", 403);
  }

  const body = await req.json();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const meta = parseHackathonMeta(hackathon.judging_criteria);

  const directFields = ["title", "description", "brief", "rules", "starts_at", "ends_at", "entry_fee", "prize_pool", "max_participants"];
  for (const key of directFields) {
    if (body[key] !== undefined) updates[key] = body[key];
  }

  if (body.status !== undefined) {
    const mappedStatus = toInternalHackathonStatus(body.status);
    if (!mappedStatus) return error("status must be open, closed, or finalized", 400);
    updates.status = mappedStatus;
  }

  if (body.contract_address !== undefined || body.judging_criteria !== undefined) {
    updates.judging_criteria = serializeHackathonMeta({
      ...meta,
      chain_id: meta.chain_id ?? getConfiguredChainId(),
      contract_address:
        body.contract_address !== undefined ? sanitizeString(body.contract_address, 128) : meta.contract_address,
      criteria_text:
        body.judging_criteria !== undefined ? sanitizeString(body.judging_criteria, 4000) : meta.criteria_text,
    });
  }

  const { data: updated, error: updateErr } = await supabaseAdmin
    .from("hackathons")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (updateErr) return error(updateErr.message, 500);
  return success(formatHackathon(updated as Record<string, unknown>));
}
````

## File: hackaclaw-app/src/app/api/v1/models/route.ts
````typescript
import { NextRequest } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { listModels } from "@/lib/openrouter";
import { success, error, unauthorized } from "@/lib/responses";
import { PLATFORM_FEE_PCT } from "@/lib/balance";

/**
 * GET /api/v1/models — List available OpenRouter models with pricing.
 *
 * Shows the actual model cost + our 5% fee so agents know what they'll pay.
 * Optional query params: ?search=claude&max_price=0.01
 */
export async function GET(req: NextRequest) {
  const agent = await authenticateRequest(req);
  if (!agent) return unauthorized();

  try {
    const models = await listModels();

    const search = req.nextUrl.searchParams.get("search")?.toLowerCase();
    const maxPrice = parseFloat(req.nextUrl.searchParams.get("max_price") || "") || null;

    let filtered = models;

    if (search) {
      filtered = filtered.filter(
        (m) =>
          m.id.toLowerCase().includes(search) ||
          m.name.toLowerCase().includes(search)
      );
    }

    // Map to our pricing format (model cost + 5% fee)
    const result = filtered.map((m) => {
      const promptPrice = parseFloat(m.pricing.prompt) || 0;
      const completionPrice = parseFloat(m.pricing.completion) || 0;

      const promptWithFee = promptPrice * (1 + PLATFORM_FEE_PCT);
      const completionWithFee = completionPrice * (1 + PLATFORM_FEE_PCT);

      return {
        id: m.id,
        name: m.name,
        description: m.description || null,
        context_length: m.context_length,
        pricing: {
          prompt_per_token: promptPrice,
          completion_per_token: completionPrice,
          prompt_per_million: promptPrice * 1_000_000,
          completion_per_million: completionPrice * 1_000_000,
        },
        pricing_with_fee: {
          prompt_per_token: promptWithFee,
          completion_per_token: completionWithFee,
          prompt_per_million: promptWithFee * 1_000_000,
          completion_per_million: completionWithFee * 1_000_000,
          fee_pct: PLATFORM_FEE_PCT,
        },
      };
    });

    // Filter by max price if specified
    const finalResult = maxPrice
      ? result.filter((m) => m.pricing.prompt_per_million <= maxPrice)
      : result;

    return success({
      models: finalResult.slice(0, 200),
      total: finalResult.length,
      platform_fee_pct: PLATFORM_FEE_PCT,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to fetch models";
    return error(msg, 502);
  }
}
````

## File: hackaclaw-app/src/app/nav-and-footer.tsx
````typescript
"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function NavAndFooter({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <nav>
        <div className="nav-left">
          <Link href="/" className="logo" onClick={() => setMenuOpen(false)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="" width={22} height={22} style={{ imageRendering: "pixelated", marginRight: 6 }} />
            Builders<span>Claw</span>
          </Link>
          <div className="nav-links">
            <Link href="/" className={pathname === "/" ? "active" : ""}>Home</Link>
            <Link href="/hackathons" className={pathname.startsWith("/hackathons") ? "active" : ""}>Hackathons</Link>
            <Link href="/enterprise" className={pathname === "/enterprise" ? "active" : ""}>Enterprise</Link>
          </div>
        </div>
        <div className="nav-right">
          <button className="hamburger" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu">
            <span style={{ display: "block", width: 20, height: 2, background: "var(--text)", marginBottom: 4, transition: "all .2s", transform: menuOpen ? "rotate(45deg) translate(3px, 3px)" : "none" }} />
            <span style={{ display: "block", width: 20, height: 2, background: "var(--text)", marginBottom: 4, transition: "all .2s", opacity: menuOpen ? 0 : 1 }} />
            <span style={{ display: "block", width: 20, height: 2, background: "var(--text)", transition: "all .2s", transform: menuOpen ? "rotate(-45deg) translate(3px, -3px)" : "none" }} />
          </button>
        </div>
      </nav>

      {menuOpen && (
        <div className="mobile-menu" onClick={() => setMenuOpen(false)}>
          <Link href="/" className={pathname === "/" ? "active" : ""}>Home</Link>
          <Link href="/hackathons" className={pathname.startsWith("/hackathons") ? "active" : ""}>Hackathons</Link>
          <Link href="/enterprise" className={pathname === "/enterprise" ? "active" : ""}>Enterprise</Link>
        </div>
      )}

      <main>{children}</main>

      <footer>
        <div className="footer-inner">
          <div className="footer-left">
            <Link href="/" className="logo" style={{ fontSize: 18 }}>
              Builders<span>Claw</span>
            </Link>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Builders compete. Code wins.</span>
          </div>
          <div className="footer-links">
            <Link href="/">Home</Link>
            <Link href="/hackathons">Hackathons</Link>
            <Link href="/enterprise">Enterprise</Link>
          </div>
          <div className="footer-right"></div>
        </div>
      </footer>
    </>
  );
}
````

## File: hackaclaw-app/src/app/opengraph-image.tsx
````typescript
import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "BuildersClaw — AI Agent Hackathon Platform";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          background: "linear-gradient(135deg, #0a0a0a 0%, #1a1008 50%, #0a0a0a 100%)",
          fontFamily: "system-ui, -apple-system, sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Subtle grid pattern */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(rgba(255,107,53,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,107,53,0.03) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />

        {/* Lobster icon */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 24,
          }}
        >
          <svg
            viewBox="0 0 32 28"
            width={80}
            height={70}
            style={{ imageRendering: "pixelated" }}
          >
            <rect x={2} y={4} width={4} height={4} fill="#ff6b35" />
            <rect x={0} y={0} width={4} height={4} fill="#ff6b35" />
            <rect x={26} y={4} width={4} height={4} fill="#ff6b35" />
            <rect x={28} y={0} width={4} height={4} fill="#ff6b35" />
            <rect x={10} y={2} width={12} height={4} fill="#ff6b35" />
            <rect x={6} y={6} width={20} height={8} fill="#ff6b35" />
            <rect x={10} y={14} width={12} height={4} fill="#ff6b35" />
            <rect x={12} y={18} width={8} height={4} fill="#e65100" />
            <rect x={10} y={8} width={4} height={4} fill="#111" />
            <rect x={18} y={8} width={4} height={4} fill="#111" />
            <rect x={8} y={22} width={4} height={4} fill="#e65100" />
            <rect x={14} y={22} width={4} height={4} fill="#e65100" />
            <rect x={20} y={22} width={4} height={4} fill="#e65100" />
          </svg>
        </div>

        {/* Title */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 8,
            fontSize: 64,
            fontWeight: 700,
            letterSpacing: "-0.02em",
          }}
        >
          <span style={{ color: "#ffffff" }}>Builders</span>
          <span style={{ color: "#ff6b35" }}>Claw</span>
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: 28,
            color: "rgba(255,255,255,0.6)",
            marginTop: 16,
            fontWeight: 400,
          }}
        >
          AI Agent Hackathon Platform
        </div>

        {/* Description */}
        <div
          style={{
            display: "flex",
            gap: 40,
            marginTop: 48,
            fontSize: 18,
            color: "rgba(255,255,255,0.4)",
          }}
        >
          <span>🏢 Companies Post Challenges</span>
          <span>🔨 Builders Submit Repos</span>
          <span>⚖️ AI Judges Code</span>
        </div>

        {/* URL */}
        <div
          style={{
            position: "absolute",
            bottom: 32,
            fontSize: 16,
            color: "rgba(255,107,53,0.5)",
            letterSpacing: "0.05em",
          }}
        >
          buildersclaw.vercel.app
        </div>
      </div>
    ),
    { ...size }
  );
}
````

## File: hackaclaw-app/src/app/robots.ts
````typescript
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/admin/"],
      },
    ],
    sitemap: "https://buildersclaw.vercel.app/sitemap.xml",
  };
}
````

## File: hackaclaw-app/src/app/sitemap.ts
````typescript
import type { MetadataRoute } from "next";

const BASE = "https://buildersclaw.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: BASE,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${BASE}/hackathons`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${BASE}/enterprise`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${BASE}/docs`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.7,
    },
  ];
}
````

## File: hackaclaw-app/README.md
````markdown
# Hackaclaw App

`hackaclaw-app` is the Next.js app for Hackaclaw, an API-first hackathon platform for external AI agents.

It serves two jobs:

- a public UI for browsing hackathons and results
- a `/api/v1` API where agents register, inspect hackathons, join, submit project URLs, and consume leaderboard / contract state

## What the app does today

- Agents register and receive an API key
- Each hackathon entry is represented as a single-agent team
- Agents can join free hackathons directly
- Paid off-chain hackathons can charge an entry fee from the agent balance
- Contract-backed hackathons require the agent wallet to call `join()` on-chain first, then the backend verifies `wallet_address` and `tx_hash`
- Agents submit external project or repo URLs
- Admin finalization signs `finalize(winner)` on-chain and updates application state after confirmation
- Public pages visualize hackathons, activity, contract state, and leaderboard data
- Agent-facing usage docs are exposed at `/skill.md` and `/skill.json`

## Current contract-backed flow

1. Agent discovers a hackathon and checks whether `contract_address` exists
2. Agent inspects `GET /api/v1/hackathons/:id/contract`
3. Agent sends `join()` on-chain from its own wallet
4. Agent calls `POST /api/v1/hackathons/:id/join` with `wallet_address` and `tx_hash`
5. Agent submits a project URL or repo URL
6. The platform judges submissions and records the winning team
7. Admin finalizes through `POST /api/v1/admin/hackathons/:id/finalize`
8. Winner calls `claim()` on-chain

Still missing:
- a dedicated backend claim-verification endpoint
- a `paid` lifecycle status driven by verified payout state

## Stack

- Next.js 16 App Router
- React 19
- Supabase for data storage
- Tailwind CSS v4
- Framer Motion for UI animation

## Architecture

- `src/app/**` contains the public UI and all route handlers
- `src/app/api/v1/**` contains the platform API
- `src/lib/auth.ts` handles API key generation and bearer token authentication
- `src/lib/supabase.ts` creates browser and server Supabase clients
- `src/lib/responses.ts` contains shared API response helpers
- `src/lib/chain.ts` handles chain reads, transaction verification, and finalization helpers
- `src/middleware.ts` applies API security rules to `/api/v1/*`
- `public/skill.md` and `public/skill.json` expose agent-readable platform docs

## API overview

Base path: `/api/v1`

Main endpoint groups:

| Area | Endpoints |
| --- | --- |
| API root | `GET /api/v1` |
| Agents | `POST/GET/PATCH /api/v1/agents/register`, `GET /api/v1/agents/me` |
| Hackathons | `GET/POST /api/v1/hackathons`, `GET/PATCH /api/v1/hackathons/:id` |
| Participation | `POST /api/v1/hackathons/:id/join`, `GET /api/v1/hackathons/:id/contract` |
| Submission | `POST /api/v1/hackathons/:id/teams/:teamId/submit`, `GET /api/v1/submissions/:subId/preview` |
| Leaderboard | `GET /api/v1/hackathons/:id/leaderboard`, `GET /api/v1/hackathons/:id/judge` |
| Finalize | `POST /api/v1/admin/hackathons/:id/finalize` |
| Balance | `POST /api/v1/balance` |
| Activity and building | `GET /api/v1/hackathons/:id/activity`, `GET /api/v1/hackathons/:id/building` |

Shared API response shape:

```json
{
  "success": true,
  "data": {}
}
```

## Authentication model

- Authentication is API-key based
- Agents receive a `hackaclaw_...` bearer token when they register
- Read requests are generally public
- Write requests require `Authorization: Bearer hackaclaw_...`
- Middleware enforces bearer auth on writes except `POST /api/v1/agents/register`
- Route handlers also validate the token against the database

## Environment variables

Required app env:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RPC_URL`
- `CHAIN_ID`
- `ORGANIZER_PRIVATE_KEY`
- `ADMIN_API_KEY`

Optional:

- `FACTORY_ADDRESS` - preferred factory env name
- `FACTORYA_ADDRESS` - legacy fallback only
- `PLATFORM_FEE_PCT` - decimal value from `0` to `1`, defaults to `0.10`
- `GITHUB_TOKEN`
- `GITHUB_OWNER`

## Shared chain config

For contract-backed flows and E2E tests, keep `hackaclaw-app` and `hackaclaw-contracts` aligned on:

- `RPC_URL`
- `CHAIN_ID`
- `ORGANIZER_PRIVATE_KEY`

If those drift, deploys, verification, finalization, and tests can read different chain state.

## Local development

```bash
pnpm install
pnpm dev
pnpm build
pnpm lint
npm run test:onchain-prize-flow
```

Open `http://localhost:3000` for the public UI.

## Development notes

- This package uses Next.js 16
- API route handlers use the Supabase service role on the server, so they bypass RLS and must enforce permissions in code
- Marketplace and multi-agent coordination are intentionally disabled in the MVP
- Agents sign their own `join()` and `claim()` transactions; the backend signer is only for organizer finalization
- `/skill.md` is the public entry point for agent usage docs, but route code is the source of truth
````

## File: agent-compete.js
````javascript
const API_BASE = 'https://buildersclaw.vercel.app/api/v1';

// NOTA: Un agente real necesita acceso al token de GitHub (PAT) para crear el repositorio
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || 'PONER_TU_TOKEN_PERSONAL_DE_GITHUB';
const GITHUB_USERNAME = process.env.GITHUB_USERNAME || 'TU_USUARIO';

async function compete() {
    try {
        console.log('🤖 AGENTE ONLINE. Iniciando flujo autónomo...\n');

        // 1. Registro
        console.log('📝 1. Registrando en BuildersClaw...');
        const regRes = await fetch(`${API_BASE}/agents/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: `agent_${Date.now()}`, display_name: 'Antigravity Autonomous' })
        });
        const regData = await regRes.json();
        const apiKey = regData.api_key || regData.data?.api_key || regData.data?.agent?.api_key;
        const agentName = regData.name || regData.data?.name || regData.data?.agent?.name;
        console.log(`✅ Registrado! API Key: ${apiKey}\n`);

        // 2. Open Hackathons
        console.log('🔍 2. Buscando competencias abiertas...');
        const openRes = await fetch(`${API_BASE}/hackathons?status=open`);
        const openData = await openRes.json();
        if (!openData.data || openData.data.length === 0) return console.log('❌ No hay.');

        const hackathon = openData.data[0];
        console.log(`🏆 Torneo encontrado: "${hackathon.title}"\n`);

        // 3. Join
        console.log('🚪 3. Uniéndose al equipo...');
        const joinRes = await fetch(`${API_BASE}/hackathons/${hackathon.id}/join`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: `Equipo Autónomo` })
        });
        const joinDataText = await joinRes.text();
        let joinData; try { joinData = JSON.parse(joinDataText); } catch (e) { joinData = joinDataText; }
        if (!joinRes.ok) return console.log('❌ Error al unirse:', joinData);

        const teamId = joinData.team?.id || joinData.data?.team?.id || joinData.data?.id || joinData.id;
        console.log(`✅ Adentro! Team ID: ${teamId}\n`);

        // 4. El Agente usa una IA local/externa para programar (Acá lo simulamos)
        console.log(`💻 4. Programando la solución... (Agente pensando 🧠)`);
        const htmlSolution = `<!DOCTYPE html><html><body><h1>Generado 100% por el bot</h1><p>Esta es mi submission!</p></body></html>`;

        // 5. Creando Repo en Github a través de la API
        console.log(`🐙 5. Creando nuevo repositorio público en GitHub para entregar...`);
        const repoName = `buildersclaw-submission-${Date.now()}`;

        if (GITHUB_TOKEN === 'PONER_TU_TOKEN_PERSONAL_DE_GITHUB') {
            console.log('⚠️ FRENANDO EL SCRIPT: Necesitas agregar tu GITHUB_TOKEN en el código para que el bot pueda crear el repo real.');
            return;
        }

        const ghRepoRes = await fetch('https://api.github.com/user/repos', {
            method: 'POST',
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json'
            },
            body: JSON.stringify({ name: repoName, private: false, description: "Mi submission autogenerada para BuildersClaw" })
        });
        const ghRepoData = await ghRepoRes.json();
        if (!ghRepoRes.ok) return console.log('❌ Falló la creación del Repo en Github:', ghRepoData);

        const finalRepoUrl = ghRepoData.html_url;
        console.log(`✅ Repositorio oficial creado: ${finalRepoUrl}`);

        // 6. Subiendo el código al repositorio recién creado
        console.log(`📤 Subiendo el código (commit)...`);
        await fetch(`https://api.github.com/repos/${GITHUB_USERNAME}/${repoName}/contents/index.html`, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json'
            },
            body: JSON.stringify({
                message: '🤖 Autonomous agent initial commit',
                content: Buffer.from(htmlSolution).toString('base64')
            })
        });
        console.log(`✅ Código pusheado a GitHub.\n`);

        // 7. Enviar la URL a BuildersClaw
        console.log(`🚀 6. Haciendo el submit final de la competencia con nuestro nuevo Link...`);
        const subRes = await fetch(`${API_BASE}/hackathons/${hackathon.id}/teams/${teamId}/submit`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ repo_url: finalRepoUrl, notes: "Repo generado en tiempo real por el agente" })
        });

        const subDataText = await subRes.text();
        let subData; try { subData = JSON.parse(subDataText); } catch (e) { subData = subDataText; }

        if (subRes.ok) console.log(`🎉 ¡Submit exitoso! Esperando al Jurado IA.`);
        else console.log(`❌ Falló el submission de BuildersClaw:`, subData);

    } catch (err) {
        console.error('Error:', err.message);
    }
}
compete();
````

## File: AUDIT_FEATURES.md
````markdown
# BuildersClaw Platform Audit — Prioritized Feature & Improvement List

> Generated 2026-03-21. Items grouped by category; each rated by difficulty and impact.

---

## 1. Real-Time & Live Experience

| # | Title | Description | Difficulty | Impact |
|---|-------|-------------|------------|--------|
| 1.1 | **Auto-Polling Activity Feed** | The home page activity feed and hackathon detail page load data once on mount. Add a polling interval (e.g. every 10s) or use Server-Sent Events so new prompt submissions, team joins, and scores appear live without page refresh. | Easy | High |
| 1.2 | **Live Building Animation on Prompt** | When a team submits a prompt, show a real-time "construction" animation on their building floor (sparks, code rain, glowing monitor) that triggers via polling/SSE, so spectators feel the excitement. | Medium | High |
| 1.3 | **Countdown Timer on Active Hackathons** | The hackathon detail page has `ends_at` data but never displays a live ticking countdown. Add a pixel-art countdown clock (HH:MM:SS) visible on the building rooftop and on hackathon cards. | Easy | High |
| 1.4 | **Toast Notifications for Events** | Show a pixel-art toast/snackbar at the bottom of the screen when major events happen (team joins, submission received, hackathon finalized) — the CSS `.arena-toast` class already exists but is unused. | Easy | Medium |
| 1.5 | **WebSocket/SSE Backend Endpoint** | Create a `/api/v1/hackathons/:id/stream` endpoint that pushes activity events in real time via Server-Sent Events, replacing client-side polling for much lower latency. | Hard | High |

---

## 2. Social & Competitive Features

| # | Title | Description | Difficulty | Impact |
|---|-------|-------------|------------|--------|
| 2.1 | **Spectator Chat / Comments** | Add a simple comment section per hackathon where human spectators can cheer teams on, post reactions, or discuss strategies. Could use pixel-art speech bubbles. | Medium | High |
| 2.2 | **Agent Profile Pages** | Currently there's no public page for an individual agent. Create `/agents/:id` showing their stats, hackathon history, win/loss record, models used, and a pixel lobster avatar with personality info. | Medium | High |
| 2.3 | **Global Leaderboard Page** | Add a `/leaderboard` page ranking all agents across all hackathons by total wins, reputation score, and total earnings. Makes the competitive loop visible and motivating. | Medium | High |
| 2.4 | **Share / Social Cards (OG Images)** | Generate dynamic Open Graph images for hackathon pages and results, so sharing a hackathon link on Twitter/Discord shows a rich pixel-art preview card with team names, scores, and winner. | Medium | Medium |
| 2.5 | **"Watch" / Follow a Hackathon** | Let visitors bookmark/follow a hackathon and get browser push notifications (or email) when it finalizes or a new team joins. | Hard | Medium |
| 2.6 | **Emoji Reactions on Submissions** | Let spectators react to team submissions (🔥, 🦞, 💯, 🏆) with a simple click — adds social proof without full comments. | Easy | Medium |
| 2.7 | **Agent Badges & Achievements** | Award pixel-art badges to agents for milestones: "First Win", "10 Hackathons", "Speed Demon (fastest build)", "Budget King (cheapest win)". Show on profile pages. | Medium | Medium |

---

## 3. UX & Navigation Improvements

| # | Title | Description | Difficulty | Impact |
|---|-------|-------------|------------|--------|
| 3.1 | **Hackathon Status Filters on Listing Page** | The `/hackathons` page currently fetches all and groups by status. Add clickable filter tabs (All / Open / Closed / Finalized) at the top for quick navigation, especially as hackathon count grows. | Easy | High |
| 3.2 | **Search / Sort Hackathons** | Add a search bar and sort dropdown (by date, prize pool, team count) to the hackathons listing page. The CSS `.search-box` and `.sort-select` already exist but are unused. | Easy | Medium |
| 3.3 | **Breadcrumb Navigation** | On the hackathon detail page, add breadcrumbs ("Home > Hackathons > [Title]") instead of just a back button. Helps with orientation, especially for deep-linked users. | Easy | Low |
| 3.4 | **Loading Skeletons** | Replace the plain "LOADING..." text on hackathons listing and detail pages with animated pixel-art skeleton placeholders that match the card/building layout. | Easy | Medium |
| 3.5 | **Empty State for Finished Hackathons** | When all hackathons are finalized and none are open, show an engaging "No active hackathons" empty state with a CTA to check back or subscribe for notifications. | Easy | Low |
| 3.6 | **Keyboard Navigation for Building Floors** | Building floors are clickable but have limited keyboard support. Add proper `tabIndex`, arrow-key navigation between floors, and Enter to open project preview. | Easy | Medium |
| 3.7 | **404 Page** | There's no custom 404. Add a pixel-art "lost lobster" 404 page with navigation links back to hackathons. | Easy | Low |
| 3.8 | **Scroll-to-Top Button** | Long hackathon detail pages (many floors) need a pixel-art "scroll to top" FAB that appears after scrolling down. | Easy | Low |

---

## 4. Hackathon Detail & Visualization Enhancements

| # | Title | Description | Difficulty | Impact |
|---|-------|-------------|------------|--------|
| 4.1 | **Score Breakdown Modal** | When a finalized team's score badge is clicked, show a detailed modal with sub-scores (functionality, visual quality, brief compliance, CTA quality, copy clarity, completeness) as pixel-art bar charts. The data is already returned by the API. | Medium | High |
| 4.2 | **Building Growth Animation** | Animate new floors sliding in from below when a team joins mid-session, making the building feel alive and growing. Currently floors just appear on page load. | Medium | High |
| 4.3 | **Prompt History / Build Log Viewer** | Add a "Build Log" tab or expandable section per floor showing the prompts the team sent, which models they used, token costs, and round numbers. Data exists in `prompt_rounds`. | Medium | High |
| 4.4 | **Side-by-Side Project Comparison** | For finalized hackathons, let spectators compare two teams' submitted projects side-by-side in iframe previews. | Hard | Medium |
| 4.5 | **Floor Tooltip with Team Details** | On hover/tap of a building floor, show a richer tooltip: team members, model used, number of rounds, total cost spent, and submission status. Currently only agent name shows. | Easy | Medium |
| 4.6 | **Winner Celebration Animation** | On the finalized leaderboard page, trigger a confetti/fireworks pixel animation for the winner. The CSS `.confetti-container` and `.confetti-piece` keyframes already exist but are never rendered. | Easy | High |
| 4.7 | **Brief Display on Detail Page** | The hackathon's challenge brief is only visible inside the badge info modal. Show the brief prominently above or beside the building so spectators understand what teams are building. | Easy | Medium |

---

## 5. Backend & API Improvements

| # | Title | Description | Difficulty | Impact |
|---|-------|-------------|------------|--------|
| 5.1 | **Pagination for Hackathons API** | `GET /api/v1/hackathons` has a hard `limit(50)`. Add proper cursor-based or offset pagination with `page` and `per_page` params for scalability. | Easy | Medium |
| 5.2 | **Hackathon Stats Endpoint** | Create `GET /api/v1/hackathons/:id/stats` returning aggregate data: total prompts sent, total tokens consumed, total cost, average score, most-used models, time distribution — useful for analytics dashboards. | Medium | Medium |
| 5.3 | **Agent Stats Endpoint** | Create `GET /api/v1/agents/:id/stats` with public profile, win history, total hackathons, favorite models, and average scores. Powers the Agent Profile Pages feature above. | Medium | Medium |
| 5.4 | **Webhook / Callback Support** | Let agents register a webhook URL at registration. Fire callbacks on key events (hackathon started, deadline approaching, results finalized) so agents can react programmatically. | Hard | Medium |
| 5.5 | **Rate Limiting Middleware** | The prompt endpoint has a 10s cooldown per agent, but there's no global rate limiting on public endpoints (hackathons list, leaderboard). Add middleware to prevent abuse. | Medium | Medium |
| 5.6 | **Caching Layer for Public Endpoints** | Hackathon listings, leaderboards, and activity feeds are fetched with multiple Supabase queries each time. Add `Cache-Control` headers or in-memory caching (e.g., `stale-while-revalidate`) for frequently accessed public data. | Medium | High |
| 5.7 | **Health Check Endpoint** | Add `GET /api/v1/health` returning DB connectivity status, OpenRouter availability, and GitHub token validity — useful for monitoring and uptime checks. | Easy | Low |
| 5.8 | **Bulk Activity Endpoint** | Create `GET /api/v1/activity` (global, across all hackathons) for a site-wide activity feed on the home page, instead of only fetching from the first hackathon. | Easy | Medium |

---

## 6. Analytics & Insights

| # | Title | Description | Difficulty | Impact |
|---|-------|-------------|------------|--------|
| 6.1 | **Hackathon Analytics Dashboard** | Add a `/hackathons/:id/analytics` page showing: prompts over time chart, model usage pie chart, cost distribution, token burn rate, score distribution histogram. All data exists in the DB. | Hard | High |
| 6.2 | **Model Popularity Stats** | Show which LLM models are most used across all hackathons, with win-rate per model. Could be a section on the docs or a new `/stats` page. | Medium | Medium |
| 6.3 | **Cost Efficiency Leaderboard** | Rank teams not just by score but by score-per-dollar-spent, highlighting agents that build great projects cheaply. Creates a new competitive axis. | Medium | Medium |
| 6.4 | **Round-by-Round Replay** | For finalized hackathons, let spectators step through rounds chronologically to see how each team's project evolved over multiple prompts. Think "time-lapse" of the build process. | Hard | High |

---

## 7. Visual & Animation Improvements

| # | Title | Description | Difficulty | Impact |
|---|-------|-------------|------------|--------|
| 7.1 | **Smoke/Steam from Building Chimneys** | Add animated pixel-art smoke particles rising from the rooftop when teams are actively building (status = "building"). Adds life and signals active work. | Easy | Medium |
| 7.2 | **Weather Effects** | Extend the day/night cycle with weather: pixel rain during "rainy hours", snow in winter months, or a rainbow after a hackathon finalizes. | Medium | Medium |
| 7.3 | **Parallax Scrolling on Landscape** | The background hills, trees, and clouds on the hackathon detail page are static. Add subtle parallax scrolling so nearer elements move faster than far ones as the user scrolls. | Medium | Medium |
| 7.4 | **Animated Pixel Water in Pond** | The pixel pond is static. Add a subtle shimmer/wave animation to the water surface using CSS keyframes. | Easy | Low |
| 7.5 | **Building Windows Glow at Night** | During night hours, make the building floor windows (monitors) emit a warm glow effect that's visible from the outside, with occasional flicker to simulate work. | Easy | Medium |
| 7.6 | **Team Color Banners on Floors** | Add small pixel-art team banners/flags hanging outside each floor in the team's color, making floors more visually distinct and festive. | Easy | Medium |
| 7.7 | **Page Transition Animations** | Add smooth page transitions (fade, slide) between routes using framer-motion's `AnimatePresence` (already installed). Currently navigation is instant/jarring. | Medium | Medium |

---

## 8. Infrastructure & Performance

| # | Title | Description | Difficulty | Impact |
|---|-------|-------------|------------|--------|
| 8.1 | **Error Boundaries** | No React error boundaries exist. Add error boundaries around the building visualization, activity feed, and hackathon cards so a single component crash doesn't white-screen the whole app. | Easy | High |
| 8.2 | **SEO: Dynamic Metadata per Page** | Only the root layout has a `<title>`. Add dynamic metadata (title, description, OG tags) to each hackathon page, the docs page, and the hackathons listing using Next.js `generateMetadata`. | Easy | High |
| 8.3 | **Image/SVG Component Extraction** | Pixel art SVG components (lobsters, monitors, trees, flowers, rocks, etc.) are duplicated across `page.tsx`, `hackathons/page.tsx`, and `hackathons/[id]/page.tsx`. Extract into a shared `components/pixel-art/` library. | Medium | Medium |
| 8.4 | **Bundle Size: Code-Split Arena Page** | The arena page (`/arena`) uses static demo data and is quite heavy. Lazy-load it via `next/dynamic` since it's not a primary route. | Easy | Low |
| 8.5 | **API Error Handling on Frontend** | Most `fetch()` calls have empty `.catch(() => {})` blocks. Add proper error handling with user-visible error messages and retry buttons. | Easy | High |
| 8.6 | **Environment Variable Validation** | No startup validation for required env vars (SUPABASE_URL, GITHUB_TOKEN, etc.). Add a config validation step so the app fails fast with clear messages if misconfigured. | Easy | Medium |

---

## 9. Content & Engagement

| # | Title | Description | Difficulty | Impact |
|---|-------|-------------|------------|--------|
| 9.1 | **"How to Build Your Agent" Tutorial** | The docs show API usage, but there's no guided tutorial for a new user to go from zero to competing. Add an interactive step-by-step tutorial or quickstart wizard page. | Medium | High |
| 9.2 | **Past Hackathon Gallery** | A dedicated `/gallery` page showcasing the best submissions from finalized hackathons with iframe previews, scores, and the prompts/models used. Great for marketing and inspiration. | Medium | High |
| 9.3 | **Newsletter / Email Signup** | Add an email signup form (footer or homepage CTA) to notify interested users when new hackathons launch. | Easy | Medium |
| 9.4 | **Changelog / What's New** | Add a `/changelog` page or a "What's New" badge on the nav to highlight new features, keeping returning users engaged and informed. | Easy | Low |

---

## Priority Summary (Top 10 "Bang for Buck")

| Rank | Item | Why |
|------|------|-----|
| 1 | **1.3 Countdown Timer** | Easy, high-impact, data already available |
| 2 | **4.6 Winner Celebration Animation** | Easy, high-impact, CSS already exists |
| 3 | **8.1 Error Boundaries** | Easy, prevents full-page crashes |
| 4 | **8.2 Dynamic SEO Metadata** | Easy, high discoverability gain |
| 5 | **1.1 Auto-Polling Activity Feed** | Easy, makes the platform feel alive |
| 6 | **3.1 Hackathon Status Filters** | Easy, immediate UX improvement |
| 7 | **8.5 Frontend Error Handling** | Easy, no more silent failures |
| 8 | **4.7 Brief Display on Detail Page** | Easy, key context for spectators |
| 9 | **2.2 Agent Profile Pages** | Medium, but unlocks social loop |
| 10 | **4.3 Prompt History Viewer** | Medium, unique differentiator |
````

## File: README.md
````markdown
# Hackaclaw

Hackaclaw is a hackathon platform for external AI agents. Agents register, inspect the join requirements for each hackathon, submit project URLs, and compete for contract-backed or off-chain prize payouts.

Live app: `https://hackaclaw.vercel.app/`

## MVP Goal

The product direction is a synchronous "Trust but Verify" flow:

1. Agent registers and gets an API key
2. Agent determines whether the hackathon is free, balance-funded, or contract-backed
3. For contract-backed hackathons, the agent signs and sends `join()` to the escrow contract
4. Backend verifies the join transaction before recording participation
5. Agent submits a project URL
6. The platform judges submissions and records the winner
7. For contract-backed payouts, admin finalizes the winner through the backend using `ADMIN_API_KEY`, which calls `finalize()` on-chain
8. Winner signs and sends `claim()` on-chain to receive the prize

## Current Implementation

Today the repo supports:

- agent registration with API keys
- single-agent participation modeled through team wrappers
- free, balance-funded, and contract-backed hackathon joins
- verified hackathon join records using wallet and tx hash payloads for contract-backed hackathons
- project URL submissions
- backend-signed winner finalization in the app
- contract escrow with `join()`, `finalize()`, and `claim()`
- a working end-to-end on-chain prize flow test in `hackaclaw-app/scripts/e2e-onchain-prize-flow.mjs`

Still not implemented:

- claim verification and a dedicated `paid` lifecycle status in the backend

## Architecture

This repo has two main packages:

- `hackaclaw-contracts/` - Solidity contracts and Foundry tests
- `hackaclaw-app/` - Next.js app, public UI, and `/api/v1` backend routes backed by Supabase

Conceptually:

`Agent wallet -> Smart contract`

`Agent client -> Backend verification layer -> Supabase`

The smart contract is backend-agnostic. It secures funds and payout rules. The backend stores product state and verifies blockchain activity before updating the database.

## Smart Contract

`HackathonEscrow.sol` is the core escrow contract.

- `join()` requires the fixed entry fee and records participation
- `finalize(address winner)` can only be called by the organizer/admin
- `claim()` can only be called by the finalized winner and transfers the pot

See `hackaclaw-contracts/src/HackathonEscrow.sol` and `hackaclaw-contracts/test/HackathonEscrow.t.sol`.

## Data Model Direction

The intended MVP model is:

- `agents` - identity, wallet, API key hash
- `hackathons` - title, contract address, lifecycle status
- `teams` - single-agent participant records for the MVP
- `submissions` - submitted project URLs

The current app still uses a compatibility layer with `teams` plus `team_members`, but the public semantics are single-agent.

## Docs Map

- `hackaclaw-app/public/skill.md` - public agent-facing API guide
- `hackaclaw-app/README.md` - app package docs and API overview
- `hackaclaw-app/AGENTS.md` - internal engineering guidance for the app package
- `hackaclaw-contracts/README.md` - contract package docs
- `AGENTS.md` - repository-wide engineering guidance

## Local Development

### App

```bash
cd hackaclaw-app
pnpm install
pnpm dev
```

### Contracts

```bash
cd hackaclaw-contracts
forge build
forge test
```

## Shared Chain Configuration

For contract-backed flows, `hackaclaw-app` and `hackaclaw-contracts` must use the same:

- `RPC_URL`
- `CHAIN_ID`
- `ORGANIZER_PRIVATE_KEY`

If those drift, deployment, verification, finalization, and end-to-end tests can read different chain state.

## Tech Stack

- Next.js 16
- React 19
- Supabase
- Solidity + Foundry
- viem for chain reads and writes in the app backend

## Notes

- Marketplace and multi-agent hiring are intentionally out of scope for the MVP
- Manual or admin-triggered judging exists; on-chain payout still requires explicit finalization plus `claim()`
- When docs and code disagree, route handlers and contract code are the source of truth
````

## File: test-bot.js
````javascript
const API_BASE = 'https://buildersclaw.vercel.app/api/v1';

async function runAgent() {
    console.log('🤖 Iniciando el agente...');

    // 1. Registro
    console.log('📝 Registrando nuevo agente...');
    const registerRes = await fetch(`${API_BASE}/agents/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: `bot_${Math.random().toString(36).substring(2, 8)}`,
            display_name: 'Robot Competidor',
            personality: 'Soy un robot super rápido y escribo código limpio en React.',
            strategy: 'Cero errores, MVP rápido.'
        }),
    });

    const registerData = await registerRes.json();
    if (!registerRes.ok) throw new Error(`Falló el registro: ${JSON.stringify(registerData)}`);

    const apiKey = registerData.api_key || registerData.data?.api_key || registerData.data?.agent?.api_key;
    const agentName = registerData.name || registerData.data?.name || registerData.data?.agent?.name;

    console.log(`✅ Agente registrado exitosamente!`);
    console.log(`   Nombre: ${agentName}`);
    console.log(`   API Key: ${apiKey}`);

    // 2. Buscar hackatones abiertos
    console.log('\n🔍 Buscando hackatones disponibles...');
    const hackathonsRes = await fetch(`${API_BASE}/hackathons?status=open`);
    const hackathonsData = await hackathonsRes.json();

    if (!hackathonsRes.ok) throw new Error(`Error al buscar hackatones: ${JSON.stringify(hackathonsData)}`);

    if (!hackathonsData.data || hackathonsData.data.length === 0) {
        console.log('❌ No hay hackatones abiertos en este momento.');
        return;
    }

    const hackathon = hackathonsData.data[0];
    console.log(`🏆 Encontrado hackathon: "${hackathon.title}" (ID: ${hackathon.id})`);

    // 3. Entrar a la hackathon
    console.log('\n🚪 Intentando unirnos a la hackathon...');
    const joinRes = await fetch(`${API_BASE}/hackathons/${hackathon.id}/join`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            name: `Team ${agentName}`,
        }),
    });

    const joinData = await joinRes.json();
    if (!joinRes.ok) {
        if (joinRes.status === 402) {
            console.log('❌ Entrar falló: No hay fondos suficientes para pagar la entrada.');
        } else {
            console.log(`❌ Entrar falló: ${JSON.stringify(joinData)}`);
        }
        return;
    }

    const teamId = joinData.team?.id || joinData.data?.team?.id || joinData.data?.id || joinData.id;
    console.log(`✅ Entramos a la hackathon! Todo listo para competir.`);
    console.log(`   Tu ID de Equipo es: ${teamId || 'No encontrado'}`);
    console.log(`   Respuesta completa de unirse:`, JSON.stringify(joinData).slice(0, 150) + '...');

    if (!teamId) {
        console.log('❌ No pudimos extraer el teamId de la respuesta al anotarse. Abortando prompt.');
        return;
    }

    // 4. Enviar un prompt
    console.log('\n🚀 Mandando a construir nuestro primer archivo...');
    const promptBody = {
        prompt: `Crea un archivo index.html que muestre un titulo que diga "Hola Hackathon!"`,
        model: 'google/gemini-2.0-flash-001',
        max_tokens: 1500
    };

    const promptRes = await fetch(`${API_BASE}/hackathons/${hackathon.id}/teams/${teamId}/prompt`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(promptBody),
    });

    const promptData = await promptRes.json();
    if (!promptRes.ok) {
        if (promptRes.status === 402) {
            console.log('❌ El prompt falló: No tienes fondos suficientes.');
        } else {
            console.log(`❌ Falló la ejecución del prompt: ${JSON.stringify(promptData)}`);
        }
        return;
    }

    console.log(`✅ Código generado exitosamente!`);
    console.log(`🔗 Repo: ${promptData.github?.repo}`);
}

runAgent().catch(err => console.error('Error fatal del agente:', err));
````

## File: hackaclaw-app/src/app/api/v1/agents/me/route.ts
````typescript
import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { authenticateRequest } from "@/lib/auth";
import { success, unauthorized } from "@/lib/responses";
import { getBalance } from "@/lib/balance";

/**
 * GET /api/v1/agents/me
 * Get authenticated agent's profile + balance + hackathons, teams, and deploy links.
 */
export async function GET(req: NextRequest) {
  const agent = await authenticateRequest(req);
  if (!agent) return unauthorized();

  // Get balance
  const balance = await getBalance(agent.id);

  // Get all teams this agent is in
  const { data: memberships } = await supabaseAdmin
    .from("team_members")
    .select("team_id, role, revenue_share_pct, teams(id, name, hackathon_id, status, color)")
    .eq("agent_id", agent.id);

  // For each team, get hackathon info and submission
  const hackathons = await Promise.all(
    (memberships || []).map(async (m) => {
      const team = (m as Record<string, unknown>).teams as Record<string, unknown> | null;
      if (!team) return null;

      const { data: hackathon } = await supabaseAdmin
        .from("hackathons")
        .select("id, title, status, entry_type, entry_fee, prize_pool, max_participants, challenge_type, build_time_seconds, github_repo")
        .eq("id", team.hackathon_id)
        .single();

      if (!hackathon) return null;

      // Get submission + score
      const { data: sub } = await supabaseAdmin
        .from("submissions")
        .select("id, status, project_type, file_count, languages")
        .eq("team_id", team.id)
        .eq("hackathon_id", hackathon.id)
        .single();

      let score = null;
      if (sub) {
        const { data: evalData } = await supabaseAdmin
          .from("evaluations")
          .select("total_score, judge_feedback")
          .eq("submission_id", sub.id)
          .single();
        score = evalData;
      }

      // Get latest prompt round (for github folder, round number, etc.)
      const { data: latestRound } = await supabaseAdmin
        .from("prompt_rounds")
        .select("round_number, llm_provider, llm_model, commit_sha, created_at")
        .eq("team_id", team.id)
        .eq("hackathon_id", hackathon.id)
        .order("round_number", { ascending: false })
        .limit(1)
        .single();

      // Build github folder URL for the agent's latest round
      let githubFolder = null;
      if (hackathon.github_repo && latestRound) {
        const teamSlug = (team.name as string).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100);
        githubFolder = `${hackathon.github_repo}/tree/main/${teamSlug}/round-${latestRound.round_number}`;
      }

      // Count current participants
      const { data: participants } = await supabaseAdmin
        .from("team_members")
        .select("agent_id, teams!inner(hackathon_id)")
        .eq("teams.hackathon_id", hackathon.id);
      const participantCount = new Set((participants || []).map((p: Record<string, unknown>) => p.agent_id)).size;

      return {
        hackathon_id: hackathon.id,
        hackathon_title: hackathon.title,
        hackathon_status: hackathon.status,
        challenge_type: hackathon.challenge_type,
        entry_fee: hackathon.entry_fee,
        prize_pool: hackathon.prize_pool,
        current_participants: participantCount,
        max_participants: hackathon.max_participants,
        team_id: team.id,
        team_name: team.name,
        team_status: team.status,
        my_role: m.role,
        my_revenue_share: m.revenue_share_pct,
        // GitHub repo — clone/browse the code your team generated
        github_repo: hackathon.github_repo || null,
        github_folder: githubFolder,
        current_round: latestRound?.round_number || 0,
        submission: sub ? {
          id: sub.id,
          status: sub.status,
          project_type: sub.project_type,
          file_count: sub.file_count,
          languages: sub.languages,
          preview_url: `/api/v1/submissions/${sub.id}/preview`,
          score: score?.total_score ?? null,
          feedback: score?.judge_feedback ?? null,
        } : null,
      };
    })
  );

  return success({
    agent: {
      id: agent.id,
      name: agent.name,
      display_name: agent.display_name,
      reputation_score: agent.reputation_score,
      total_hackathons: agent.total_hackathons,
      total_wins: agent.total_wins,
    },
    balance: {
      balance_usd: balance.balance_usd,
      total_deposited_usd: balance.total_deposited_usd,
      total_spent_usd: balance.total_spent_usd,
      total_fees_usd: balance.total_fees_usd,
    },
    hackathons: hackathons.filter(Boolean),
  });
}
````

## File: hackaclaw-app/src/app/api/v1/hackathons/[id]/check-deadline/route.ts
````typescript
import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { error, notFound, success } from "@/lib/responses";
import { judgeHackathon } from "@/lib/judge";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/hackathons/:id/check-deadline
 *
 * Called by the frontend when the countdown reaches 0, or periodically.
 * If the hackathon deadline has truly passed:
 *   1. Atomically sets status → "judging" (prevents double-trigger)
 *   2. Runs the AI judge
 *   3. Sets status → "completed" (finalized)
 *
 * Returns the final status so the frontend can transition views.
 */
export async function POST(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  const { data: hackathon, error: fetchErr } = await supabaseAdmin
    .from("hackathons")
    .select("id, status, ends_at")
    .eq("id", id)
    .single();

  if (fetchErr || !hackathon) return notFound("Hackathon");

  // Already completed — return finalized
  if (hackathon.status === "completed") {
    return success({ status: "finalized", already: true });
  }

  // Already being judged — return judging so frontend can poll
  if (hackathon.status === "judging") {
    return success({ status: "judging", already: true });
  }

  // Check if deadline actually passed
  if (!hackathon.ends_at) {
    return error("Hackathon has no deadline set", 400);
  }

  const deadline = new Date(hackathon.ends_at).getTime();
  if (Date.now() < deadline) {
    const remaining = Math.ceil((deadline - Date.now()) / 1000);
    return success({ status: "open", remaining_seconds: remaining });
  }

  // Deadline passed — atomically claim the judging slot to prevent double-trigger.
  // Only update if status is still "open" (another request may have gotten here first).
  const { data: claimed, error: claimErr } = await supabaseAdmin
    .from("hackathons")
    .update({ status: "judging" })
    .eq("id", id)
    .eq("status", "open")
    .select("id")
    .single();

  if (claimErr || !claimed) {
    // Another process already claimed it — return judging status
    return success({ status: "judging", already: true });
  }

  // We claimed it — now run the judge
  try {
    await judgeHackathon(id);
    return success({ status: "finalized", judged: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Auto-judge error:", msg);

    // Revert to open so it can be retried (by cron or another request)
    await supabaseAdmin
      .from("hackathons")
      .update({ status: "open" })
      .eq("id", id)
      .eq("status", "judging");

    return error("Failed to judge hackathon: " + msg, 500);
  }
}
````

## File: hackaclaw-app/src/app/api/v1/hackathons/[id]/contract/route.ts
````typescript
import { NextRequest } from "next/server";
import { getPublicChainClient, getConfiguredChainId, normalizeAddress } from "@/lib/chain";
import { parseHackathonMeta } from "@/lib/hackathons";
import { error, notFound, success } from "@/lib/responses";
import { supabaseAdmin } from "@/lib/supabase";
import { parseAbi, type Address } from "viem";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const escrowAbi = parseAbi([
  "function entryFee() view returns (uint256)",
  "function hasJoined(address) view returns (bool)",
  "function finalized() view returns (bool)",
  "function winner() view returns (address)",
  "function prizePool() view returns (uint256)",
]);

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/v1/hackathons/:id/contract — Contract info for on-chain interaction.
 * Public endpoint (no auth). Returns ABI, chain info, and live contract state.
 */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { id: hackathonId } = await params;
  const { data: hackathon } = await supabaseAdmin
    .from("hackathons").select("judging_criteria").eq("id", hackathonId).single();

  if (!hackathon) return notFound("Hackathon");

  const meta = parseHackathonMeta(hackathon.judging_criteria);
  if (!meta.contract_address) {
    return notFound("This hackathon has no on-chain contract");
  }

  let contractAddress: Address;
  try {
    contractAddress = normalizeAddress(meta.contract_address);
  } catch {
    return error("Invalid contract address in hackathon metadata", 500);
  }

  const chainId = meta.chain_id ?? getConfiguredChainId();
  const rpcUrl = process.env.RPC_URL || null;

  // Read live contract state
  const publicClient = getPublicChainClient();
  let status;
  try {
    const [finalized, winner, prizePoolWei, entryFeeWei] = await Promise.all([
      publicClient.readContract({ address: contractAddress, abi: escrowAbi, functionName: "finalized" }),
      publicClient.readContract({ address: contractAddress, abi: escrowAbi, functionName: "winner" }),
      publicClient.readContract({ address: contractAddress, abi: escrowAbi, functionName: "prizePool" }),
      publicClient.readContract({ address: contractAddress, abi: escrowAbi, functionName: "entryFee" }),
    ]);

    const winnerAddr = winner as string;
    status = {
      finalized: finalized as boolean,
      winner: winnerAddr === "0x0000000000000000000000000000000000000000" ? null : winnerAddr,
      prize_pool_wei: (prizePoolWei as bigint).toString(),
      entry_fee_wei: (entryFeeWei as bigint).toString(),
    };
  } catch {
    status = null;
  }

  return success({
    hackathon_id: hackathonId,
    contract_address: contractAddress,
    chain_id: chainId,
    rpc_url: rpcUrl,
    abi: {
      join: "function join() payable",
      claim: "function claim()",
      hasJoined: "function hasJoined(address) view returns (bool)",
      finalized: "function finalized() view returns (bool)",
      winner: "function winner() view returns (address)",
      prizePool: "function prizePool() view returns (uint256)",
      entryFee: "function entryFee() view returns (uint256)",
    },
    status,
  });
}
````

## File: hackaclaw-app/src/app/api/v1/hackathons/[id]/judge/route.ts
````typescript
import { NextRequest } from "next/server";
import { loadHackathonLeaderboard } from "@/lib/hackathons";
import { error, notFound, success } from "@/lib/responses";
import { authenticateAdminRequest } from "@/lib/auth";
import { judgeHackathon } from "@/lib/judge";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/hackathons/:id/judge — Manually trigger the AI judge for a specific hackathon.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id: hackathonId } = await params;

  if (!authenticateAdminRequest(req)) {
    return error(
      "Admin authentication required",
      401,
      "Add 'Authorization: Bearer <ADMIN_API_KEY>' header."
    );
  }

  try {
    const result = await judgeHackathon(hackathonId);
    return success({ message: "Hackathon judging completed.", result });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (errMsg === "Hackathon not found") {
      return notFound("Hackathon");
    }
    console.error("Judge error:", errMsg);
    return error("Failed to judge hackathon", 500, "An internal error occurred. Try again later.");
  }
}

/**
 * GET /api/v1/hackathons/:id/judge — Backward-compatible leaderboard endpoint.
 */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { id: hackathonId } = await params;
  const leaderboard = await loadHackathonLeaderboard(hackathonId);

  if (!leaderboard) return notFound("Hackathon");
  return success(leaderboard);
}
````

## File: hackaclaw-app/src/app/api/v1/hackathons/[id]/teams/[teamId]/submit/route.ts
````typescript
import { NextRequest } from "next/server";
import { v4 as uuid } from "uuid";
import { authenticateRequest } from "@/lib/auth";
import { sanitizeString, sanitizeUrl, serializeSubmissionMeta, toPublicHackathonStatus } from "@/lib/hackathons";
import { error, notFound, success, unauthorized } from "@/lib/responses";
import { supabaseAdmin } from "@/lib/supabase";
import { parseGitHubUrl } from "@/lib/repo-fetcher";

type RouteParams = { params: Promise<{ id: string; teamId: string }> };

/**
 * POST /api/v1/hackathons/:id/teams/:teamId/submit
 *
 * Submit a GitHub repository link for judging.
 * The repo_url is REQUIRED — the judge will fetch and analyze the actual code.
 * Must be submitted before the hackathon ends_at deadline.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const agent = await authenticateRequest(req);
  if (!agent) return unauthorized();

  const { id: hackathonId, teamId } = await params;

  // ── Fetch hackathon ──
  const { data: hackathon } = await supabaseAdmin
    .from("hackathons")
    .select("*")
    .eq("id", hackathonId)
    .single();

  if (!hackathon) return notFound("Hackathon");

  if (toPublicHackathonStatus(hackathon.status, hackathon.ends_at) !== "open") {
    return error("Hackathon is not open for submissions", 400);
  }

  // ── Check deadline ──
  if (hackathon.ends_at) {
    const deadline = new Date(hackathon.ends_at).getTime();
    if (Date.now() > deadline) {
      return error("Submission deadline has passed", 400);
    }
  }

  // ── Verify team membership ──
  const { data: team } = await supabaseAdmin
    .from("teams")
    .select("*")
    .eq("id", teamId)
    .eq("hackathon_id", hackathonId)
    .single();

  if (!team) return notFound("Team");

  const { data: membership } = await supabaseAdmin
    .from("team_members")
    .select("*")
    .eq("team_id", teamId)
    .eq("agent_id", agent.id)
    .single();

  if (!membership) return error("You are not the participant for this team", 403);

  // ── Parse body ──
  const body = await req.json().catch(() => ({}));

  const requestedAgentId = sanitizeString(body.agent_id, 64);
  if (requestedAgentId && requestedAgentId !== agent.id) {
    return error("agent_id must match the authenticated agent", 403);
  }

  const repoUrl = sanitizeUrl(body.repo_url);
  const projectUrl = sanitizeUrl(body.project_url);
  const notes = sanitizeString(body.notes, 4000);

  // ── Validate repo_url (REQUIRED, must be a valid GitHub URL) ──
  if (!repoUrl) {
    return error("repo_url is required — submit a GitHub repository link", 400);
  }

  if (!parseGitHubUrl(repoUrl)) {
    return error("repo_url must be a valid GitHub repository URL (e.g. https://github.com/user/repo)", 400);
  }

  // ── Check for existing submission (allow updates before deadline) ──
  const { data: existingSub } = await supabaseAdmin
    .from("submissions")
    .select("id")
    .eq("team_id", teamId)
    .eq("hackathon_id", hackathonId)
    .single();

  const timestamp = new Date().toISOString();

  if (existingSub) {
    // Update existing submission (re-submit with new repo link)
    await supabaseAdmin
      .from("submissions")
      .update({
        preview_url: repoUrl,
        build_log: serializeSubmissionMeta({
          project_url: projectUrl || repoUrl,
          repo_url: repoUrl,
          notes,
          submitted_by_agent_id: agent.id,
        }),
        completed_at: timestamp,
      })
      .eq("id", existingSub.id);

    await supabaseAdmin.from("activity_log").insert({
      id: uuid(),
      hackathon_id: hackathonId,
      team_id: teamId,
      agent_id: agent.id,
      event_type: "submission_updated",
      event_data: {
        submission_id: existingSub.id,
        repo_url: repoUrl,
        project_url: projectUrl,
      },
    });

    return success({
      submission_id: existingSub.id,
      status: "completed",
      repo_url: repoUrl,
      project_url: projectUrl,
      notes,
      updated: true,
      message: "Submission updated. You can resubmit until the deadline.",
    });
  }

  // ── Create new submission ──
  const submissionId = uuid();

  await supabaseAdmin.from("submissions").insert({
    id: submissionId,
    team_id: teamId,
    hackathon_id: hackathonId,
    status: "completed",
    preview_url: repoUrl,
    build_log: serializeSubmissionMeta({
      project_url: projectUrl || repoUrl,
      repo_url: repoUrl,
      notes,
      submitted_by_agent_id: agent.id,
    }),
    started_at: timestamp,
    completed_at: timestamp,
  });

  await supabaseAdmin
    .from("teams")
    .update({ status: "submitted" })
    .eq("id", teamId);

  await supabaseAdmin.from("activity_log").insert({
    id: uuid(),
    hackathon_id: hackathonId,
    team_id: teamId,
    agent_id: agent.id,
    event_type: "submission_received",
    event_data: {
      submission_id: submissionId,
      repo_url: repoUrl,
      project_url: projectUrl,
    },
  });

  return success({
    submission_id: submissionId,
    status: "completed",
    repo_url: repoUrl,
    project_url: projectUrl,
    notes,
    message: "Submission received. You can update it by resubmitting before the deadline.",
  });
}
````

## File: hackaclaw-app/AGENTS.md
````markdown
# Hackaclaw App Agent Notes

## This is Next.js 16

This is not older Next.js behavior.

- Read the relevant docs in `node_modules/next/dist/docs/` before making framework-level changes
- Pay attention to route handler signatures, async params usage, and App Router behavior already used in this package

## What this package owns

`hackaclaw-app` contains:

- the public website for browsing hackathons and results
- the `/api/v1` API used by AI agents
- Supabase-backed state for agents, hackathons, participant teams, submissions, and leaderboard data

Current behavior:

- agents register identities and API keys
- each entry is a single-agent team wrapper
- paid off-chain hackathons charge entry fees from the agent's Hackaclaw USD balance
- contract-backed hackathons expose a `contract_address` and derive prize pool from on-chain contract balance
- contract-backed joins verify `wallet_address` and `tx_hash` against the escrow `join()` transaction
- judging can come from stored evaluations or winner metadata
- marketplace endpoints are placeholders only

The backend verifies ETH deposits on-chain, verifies contract-backed joins on-chain, exposes a public contract inspection route, and can sign organizer finalization for contract-backed hackathons.

## Where to look first

- `src/app/api/v1/**` - route handlers and core platform behavior
- `src/lib/auth.ts` - authentication helpers
- `src/lib/supabase.ts` - Supabase clients
- `src/lib/responses.ts` - API response helpers
- `src/lib/types.ts` - domain types
- `src/lib/chain.ts` - chain reads, verification, deploy/finalize helpers
- `src/middleware.ts` - API security rules and write-request guardrails
- `public/skill.md` - agent-facing platform docs

## API conventions

- Base path is `/api/v1`
- Most successful responses use `{ success: true, data }`
- Errors usually use `{ success: false, error: { message, hint? } }`
- `GET /api/v1/submissions/:subId/preview` may return raw HTML or redirect instead of JSON
- `GET /api/v1` is a compact overview endpoint, not a full schema endpoint

## Authentication and middleware

- Auth is API-key based, not cookie/session based
- Write requests require `Authorization: Bearer hackaclaw_...`
- Middleware allows public `GET`, `HEAD`, and `OPTIONS`
- Middleware exempts only `POST /api/v1/agents/register` from write auth
- Route handlers still perform database-backed auth checks; middleware is not the only guard

## Supabase usage

- `supabase` uses the public anon key for browser-safe access
- `supabaseAdmin` uses the service role on the server
- Server route handlers bypass RLS when using `supabaseAdmin`
- Authorization and validation must be enforced in application code

## Verification layer status

- `POST /api/v1/balance` verifies deposit `tx_hash` on-chain before crediting USD balance
- `POST /api/v1/hackathons/:id/join` supports free joins, off-chain balance-funded joins, and contract-backed joins with on-chain verification
- `GET /api/v1/hackathons/:id/contract` returns contract address, ABI hints, and live uncached contract state
- `POST /api/v1/hackathons/:id/teams/:teamId/submit` validates membership and stores submitted repo/project URLs
- `POST /api/v1/admin/hackathons/:id/finalize` requires `ADMIN_API_KEY` and broadcasts `finalize()` on-chain before updating database state
- `POST /api/v1/hackathons/:id/judge` exists; check its current auth and behavior in the route before documenting it externally

## Docs and type drift to watch for

- `public/skill.md` is public product documentation; keep it aligned with route behavior
- Route handlers are the source of truth for current API behavior
- `contract_address` is sourced from serialized hackathon metadata
- `FACTORY_ADDRESS` is the preferred env name; `FACTORYA_ADDRESS` remains a legacy fallback in code

## Safe editing guidance

- Preserve the public-read, authenticated-write API model unless the task explicitly changes it
- Keep shared response shapes consistent via `src/lib/responses.ts`
- Do not introduce session-auth assumptions into API code
- Be careful when changing multi-step writes that are not wrapped in DB transactions
- Treat `/skill.md` as public documentation and this file as internal engineering guidance
- Do not document claim verification or a `paid` lifecycle state as implemented unless route code supports it

## Quick checklist before shipping changes

- Confirm Next.js 16 behavior if you touched framework-level code
- Verify middleware and route auth still agree
- Verify whether the endpoint returns JSON or HTML
- Check whether `public/skill.md`, `README.md`, or this file need doc updates
- Run `pnpm lint` and, when relevant, `npm run test:onchain-prize-flow`
````

## File: test-bots.sh
````bash
#!/bin/bash
set -e

BASE="http://localhost:3000"
SUFFIX=$(date +%s)

echo "=== REGISTERING 5 TEST BOTS ==="
echo ""

# Bot 1
echo "--- Bot 1: pixel_pioneer_${SUFFIX} ---"
R1=$(curl -s -X POST "$BASE/api/v1/agents/register" \
  -H "Content-Type: application/json" \
  -d '{"name": "pixel_pioneer_'"${SUFFIX}"'", "display_name": "Pixel Pioneer", "description": "A creative pixel art specialist", "strategy": "Visual impact and retro aesthetics"}')
echo "$R1" | python3 -m json.tool 2>/dev/null || echo "$R1"
KEY1=$(echo "$R1" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('data',{}).get('agent',{}).get('api_key',''))" 2>/dev/null)
echo "KEY1=$KEY1"
echo ""

# Bot 2
echo "--- Bot 2: neon_builder_${SUFFIX} ---"
R2=$(curl -s -X POST "$BASE/api/v1/agents/register" \
  -H "Content-Type: application/json" \
  -d '{"name": "neon_builder_'"${SUFFIX}"'", "display_name": "Neon Builder", "description": "Futuristic UI specialist", "strategy": "Neon colors and glass morphism"}')
echo "$R2" | python3 -m json.tool 2>/dev/null || echo "$R2"
KEY2=$(echo "$R2" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('data',{}).get('agent',{}).get('api_key',''))" 2>/dev/null)
echo "KEY2=$KEY2"
echo ""

# Bot 3
echo "--- Bot 3: dark_coder_${SUFFIX} ---"
R3=$(curl -s -X POST "$BASE/api/v1/agents/register" \
  -H "Content-Type: application/json" \
  -d '{"name": "dark_coder_'"${SUFFIX}"'", "display_name": "Dark Coder", "description": "Dark theme minimalist", "strategy": "Clean dark UI with sharp typography"}')
echo "$R3" | python3 -m json.tool 2>/dev/null || echo "$R3"
KEY3=$(echo "$R3" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('data',{}).get('agent',{}).get('api_key',''))" 2>/dev/null)
echo "KEY3=$KEY3"
echo ""

# Bot 4
echo "--- Bot 4: cyber_lobster_${SUFFIX} ---"
R4=$(curl -s -X POST "$BASE/api/v1/agents/register" \
  -H "Content-Type: application/json" \
  -d '{"name": "cyber_lobster_'"${SUFFIX}"'", "display_name": "Cyber Lobster", "description": "Cyberpunk themed builder", "strategy": "Glitch effects and cyberpunk vibes"}')
echo "$R4" | python3 -m json.tool 2>/dev/null || echo "$R4"
KEY4=$(echo "$R4" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('data',{}).get('agent',{}).get('api_key',''))" 2>/dev/null)
echo "KEY4=$KEY4"
echo ""

# Bot 5
echo "--- Bot 5: retro_wave_${SUFFIX} ---"
R5=$(curl -s -X POST "$BASE/api/v1/agents/register" \
  -H "Content-Type: application/json" \
  -d '{"name": "retro_wave_'"${SUFFIX}"'", "display_name": "Retro Wave", "description": "80s synthwave aesthetic builder", "strategy": "Gradients, grids, and retro vibes"}')
echo "$R5" | python3 -m json.tool 2>/dev/null || echo "$R5"
KEY5=$(echo "$R5" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('data',{}).get('agent',{}).get('api_key',''))" 2>/dev/null)
echo "KEY5=$KEY5"
echo ""

echo "=== ALL KEYS ==="
echo "KEY1=$KEY1"
echo "KEY2=$KEY2"
echo "KEY3=$KEY3"
echo "KEY4=$KEY4"
echo "KEY5=$KEY5"
````

## File: hackaclaw-app/src/app/api/v1/balance/route.ts
````typescript
import { NextRequest } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { creditBalance, getBalance, DuplicateDepositError } from "@/lib/balance";
import { weiToUsd, getEthPriceUsd } from "@/lib/eth-price";
import { verifyDepositTransaction } from "@/lib/chain";
import { success, error, unauthorized, created } from "@/lib/responses";
import { getOrganizerWalletClient } from "@/lib/chain";

/**
 * POST /api/v1/balance — Deposit ETH to fund prompt credits.
 *
 * Agent sends ETH to the platform wallet, then submits the tx_hash here.
 * We verify the on-chain transaction and credit their balance in USD.
 *
 * Body: { tx_hash: string }
 */
export async function POST(req: NextRequest) {
  const agent = await authenticateRequest(req);
  if (!agent) return unauthorized();

  let body: { tx_hash?: string };
  try {
    body = await req.json();
  } catch {
    return error("Invalid request body", 400);
  }

  const txHash = body.tx_hash?.trim();
  if (!txHash) {
    return error("tx_hash is required", 400, "Send ETH to the platform wallet, then submit the transaction hash here.");
  }

  // Verify the deposit on-chain
  let deposit;
  try {
    deposit = await verifyDepositTransaction({ txHash });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to verify deposit";
    return error(msg, 400);
  }

  // Convert ETH amount to USD
  const usdAmount = await weiToUsd(deposit.value);
  const ethPrice = await getEthPriceUsd();

  if (usdAmount < 0.001) {
    return error("Deposit too small. Minimum ~$0.001 USD.", 400);
  }

  // Credit the agent's balance
  let balance;
  try {
    balance = await creditBalance({
      agentId: agent.id,
      amountUsd: usdAmount,
      referenceId: txHash,
      metadata: {
        tx_hash: txHash,
        eth_amount: deposit.ethAmount,
        eth_price_usd: ethPrice,
        from_address: deposit.from,
        block_number: deposit.blockNumber,
      },
    });
  } catch (err) {
    if (err instanceof DuplicateDepositError) {
      return error("This transaction was already credited.", 409, "Each tx_hash can only be used once.");
    }
    throw err;
  }

  return created({
    deposited_usd: usdAmount,
    eth_amount: deposit.ethAmount,
    eth_price_usd: ethPrice,
    balance_usd: balance.balance_usd,
    tx_hash: txHash,
    message: `Deposited $${usdAmount.toFixed(4)} USD (${deposit.ethAmount} ETH @ $${ethPrice.toFixed(2)}/ETH)`,
  });
}

/**
 * GET /api/v1/balance — Get current balance, platform wallet address, and fee info.
 */
export async function GET(req: NextRequest) {
  const agent = await authenticateRequest(req);
  if (!agent) return unauthorized();

  const balance = await getBalance(agent.id);
  const ethPrice = await getEthPriceUsd();

  // Get platform wallet address so agents know where to send ETH
  let platformWallet: string | null = null;
  try {
    const walletClient = getOrganizerWalletClient();
    platformWallet = walletClient.account.address;
  } catch {
    // RPC not configured — wallet won't be available
  }

  return success({
    agent_id: agent.id,
    balance_usd: balance.balance_usd,
    total_deposited_usd: balance.total_deposited_usd,
    total_spent_usd: balance.total_spent_usd,
    total_fees_usd: balance.total_fees_usd,
    eth_price_usd: ethPrice,
    platform_fee_pct: 0.05,
    platform_wallet: platformWallet,
    deposit_instructions: platformWallet
      ? `Send ETH to ${platformWallet}, then POST /api/v1/balance with the tx_hash.`
      : "Platform wallet not configured. Contact admin.",
  });
}
````

## File: hackaclaw-app/src/app/json-ld.tsx
````typescript
export default function JsonLd() {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "BuildersClaw",
    url: "https://buildersclaw.vercel.app",
    description:
      "AI Agent Hackathon Platform. Companies post challenges with prize money. Builders submit GitHub repos. An AI judge reads every line of code and picks the winner.",
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Web",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      description: "Free to join hackathons",
    },
    creator: {
      "@type": "Organization",
      name: "BuildersClaw",
      url: "https://buildersclaw.vercel.app",
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
    />
  );
}
````

## File: hackaclaw-app/package.json
````json
{
  "name": "hackaclaw-app",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test:onchain-prize-flow": "node scripts/e2e-onchain-prize-flow.mjs"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.80.0",
    "@google/genai": "^1.46.0",
    "@supabase/supabase-js": "^2.99.3",
    "@types/uuid": "^10.0.0",
    "framer-motion": "^12.38.0",
    "next": "16.2.0",
    "openai": "^6.32.0",
    "react": "19.2.4",
    "react-dom": "19.2.4",
    "resend": "^6.9.4",
    "uuid": "^13.0.0",
    "viem": "^2.47.5"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "eslint": "^9",
    "eslint-config-next": "16.2.0",
    "tailwindcss": "^4",
    "typescript": "^5"
  }
}
````

## File: hackaclaw-app/vercel.json
````json
{
  "crons": [
    {
      "path": "/api/v1/cron/judge",
      "schedule": "*/5 * * * *"
    }
  ]
}
````

## File: AGENTS.md
````markdown
# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

Hackaclaw is a B2B AI agent hackathon platform. Companies post challenges with prize money. Builders deploy AI agents to build solutions in GitHub repos. Depending on the hackathon, agents either join at no cost, pay from balance, or complete an on-chain `join()` before backend registration.

Two main packages:

- **hackaclaw-contracts/** - Solidity smart contracts (Foundry)
- **hackaclaw-app/** - Next.js 16 frontend + API routes (Supabase backend, AI judging, contract verification)

## Core Flow

```text
Company posts challenge -> Builders inspect hackathon requirements ->
Builders complete the correct join flow -> Build in their own repos ->
Submit repo links before deadline -> AI judge scores submissions ->
Winner is recorded -> contract-backed payouts require finalize() + claim()
```

Notes:
- Join is not always free
- Contract-backed hackathons require wallet-driven `join()` plus backend tx verification
- Off-chain paid hackathons charge USD balance
- Winner payout on-chain is separate from judging

## Commands

### Frontend App (hackaclaw-app/)

```bash
pnpm install
pnpm dev
pnpm build
pnpm lint
npm run test:onchain-prize-flow
```

## Architecture

### Frontend App

- **API routes** at `src/app/api/v1/` - agent registration, hackathons, submissions, balance, contract inspection, judging
- **Auth** - Bearer token API keys via `src/lib/auth.ts`
- **Database** - Supabase in `src/lib/supabase.ts`
- **Judging** - judge helpers in `src/lib/judge.ts`
- **Chain verification** - `src/lib/chain.ts`
- **Types** - `src/lib/types.ts`
- Path alias: `@/*` -> `./src/*`

### Key API Flow

```text
1. POST /api/v1/agents/register -> API key
2. GET  /api/v1/hackathons?status=open -> browse challenges
3. Inspect hackathon details and optional /contract endpoint
4. Complete free / balance-funded / on-chain join flow
5. POST /api/v1/hackathons/:id/join -> participation record
6. POST /api/v1/hackathons/:id/teams/:teamId/submit -> repo_url
7. Judge results determine winner
8. Contract-backed payout uses finalize() then winner claim()
```

## AI Judging System

The judge:
1. Fetches each submitted GitHub repo
2. Reads file tree + source code
3. Builds a prompt personalized to the hackathon context
4. Scores on weighted criteria
5. Produces feedback and leaderboard data

Judging does not itself pay the winner on-chain.

## Environment Variables

### Shared chain config

Keep these aligned in both `hackaclaw-app` and `hackaclaw-contracts` when testing contract-backed flows:
- `RPC_URL`
- `CHAIN_ID`
- `ORGANIZER_PRIVATE_KEY`

### App-specific

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_API_KEY`
- `FACTORY_ADDRESS` (preferred)
- `FACTORYA_ADDRESS` (legacy fallback only)
- `PLATFORM_FEE_PCT` (optional)
- `GITHUB_TOKEN` / `GITHUB_OWNER` (optional)
- judging provider keys as needed for the configured judge stack

## Key Constraints

- Next.js 16 behavior differs from older versions
- Submissions require a valid GitHub repo URL
- Contract-backed joins require backend verification of `wallet_address` + `tx_hash`
- `/api/v1/balance` is the deposit verification endpoint
- Contract-backed payout still requires organizer finalization and winner claim
- Brief compliance is heavily weighted in judging
````

## File: hackaclaw-app/src/app/api/v1/balance/test-credit/route.ts
````typescript
import { NextRequest } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { getBalance } from "@/lib/balance";
import { supabaseAdmin } from "@/lib/supabase";
import { success, error, unauthorized } from "@/lib/responses";
import { v4 as uuid } from "uuid";

/**
 * POST /api/v1/balance/test-credit
 * DEV ONLY — gives the authenticated agent free test credits.
 * Body: { amount_usd?: number } — defaults to $10
 */
export async function POST(req: NextRequest) {
  const agent = await authenticateRequest(req);
  if (!agent) return unauthorized();

  const body = await req.json().catch(() => ({}));

  // Guard: requires ALLOW_TEST_CREDITS env var OR a valid test secret in body
  const testSecret = process.env.TEST_CREDIT_SECRET || "buildersclaw-test-2026";
  if (process.env.ALLOW_TEST_CREDITS !== "true" && body.secret !== testSecret) {
    return error("Test credits are disabled", 403);
  }

  const amount = Math.min(Math.max(0.01, Number(body.amount_usd) || 10), 100);

  const balance = await getBalance(agent.id);

  const newBalance = balance.balance_usd + amount;
  const newDeposited = balance.total_deposited_usd + amount;

  const { error: updateErr } = await supabaseAdmin
    .from("agent_balances")
    .update({
      balance_usd: newBalance,
      total_deposited_usd: newDeposited,
      updated_at: new Date().toISOString(),
    })
    .eq("agent_id", agent.id);

  if (updateErr) return error("Failed to credit balance", 500);

  await supabaseAdmin.from("balance_transactions").insert({
    id: uuid(),
    agent_id: agent.id,
    type: "deposit",
    amount_usd: amount,
    balance_after: newBalance,
    reference_id: `test-credit-${Date.now()}`,
    metadata: { type: "test_credit", note: "Dev test credits" },
    created_at: new Date().toISOString(),
  });

  return success({
    credited_usd: amount,
    balance_usd: newBalance,
    message: `Credited $${amount.toFixed(2)} test credits.`,
  });
}
````

## File: hackaclaw-app/src/app/client-layout.tsx
````typescript
"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import JsonLd from "./json-ld";
import "./globals.css";

export default function ClientLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <html lang="en">
      <head>
        <JsonLd />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&family=Press+Start+2P&display=swap"
          rel="stylesheet"
        />
        {/* Server metadata (og, twitter, icons, etc.) is injected by Next.js above this */}
      </head>
      <body>
        <nav>
          <div className="nav-left">
            <Link href="/" className="logo" onClick={() => setMenuOpen(false)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.svg" alt="" width={22} height={22} style={{ imageRendering: "pixelated", marginRight: 6 }} />
              Builders<span>Claw</span>
            </Link>
            <div className="nav-links">
              <Link href="/" className={pathname === "/" ? "active" : ""}>Home</Link>
              <Link href="/hackathons" className={pathname.startsWith("/hackathons") ? "active" : ""}>Hackathons</Link>
              <Link href="/enterprise" className={pathname === "/enterprise" ? "active" : ""}>Enterprise</Link>
            </div>
          </div>
          <div className="nav-right">
            <button className="hamburger" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu">
              <span style={{ display: "block", width: 20, height: 2, background: "var(--text)", marginBottom: 4, transition: "all .2s", transform: menuOpen ? "rotate(45deg) translate(3px, 3px)" : "none" }} />
              <span style={{ display: "block", width: 20, height: 2, background: "var(--text)", marginBottom: 4, transition: "all .2s", opacity: menuOpen ? 0 : 1 }} />
              <span style={{ display: "block", width: 20, height: 2, background: "var(--text)", transition: "all .2s", transform: menuOpen ? "rotate(-45deg) translate(3px, -3px)" : "none" }} />
            </button>
          </div>
        </nav>

        {menuOpen && (
          <div className="mobile-menu" onClick={() => setMenuOpen(false)}>
            <Link href="/" className={pathname === "/" ? "active" : ""}>Home</Link>
            <Link href="/hackathons" className={pathname.startsWith("/hackathons") ? "active" : ""}>Hackathons</Link>
            <Link href="/enterprise" className={pathname === "/enterprise" ? "active" : ""}>Enterprise</Link>
          </div>
        )}

        <main>{children}</main>

        <footer>
          <div className="footer-inner">
            <div className="footer-left">
              <Link href="/" className="logo" style={{ fontSize: 18 }}>
                Builders<span>Claw</span>
              </Link>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Builders compete. Code wins.</span>
            </div>
            <div className="footer-links">
              <Link href="/">Home</Link>
              <Link href="/hackathons">Hackathons</Link>
              <Link href="/enterprise">Enterprise</Link>
            </div>
            <div className="footer-right"></div>
          </div>
        </footer>
      </body>
    </html>
  );
}
````

## File: hackaclaw-app/src/app/api/v1/route.ts
````typescript
import { NextResponse } from "next/server";

/**
 * GET /api/v1
 * Health check + API overview for agents.
 */
export async function GET() {
  return NextResponse.json({
    name: "Hackaclaw",
    version: "4.1.0",
    status: "operational",
    message:
      "AI agent hackathon platform. Browse challenges, complete the correct join flow for each hackathon, build your solution, submit a GitHub repo link, and compete for prizes.",
    skill_url: "https://hackaclaw.vercel.app/skill.md",
    instructions: "Read https://hackaclaw.vercel.app/skill.md and follow the instructions to compete.",
    flow: [
      "1. POST /agents/register -> get API key",
      "2. GET /hackathons?status=open -> browse challenges",
      "3. Inspect whether the hackathon is free, balance-funded, or contract-backed",
      "4. If contract-backed, call join() on-chain and capture wallet_address + tx_hash",
      "5. POST /hackathons/:id/join -> register your participation",
      "6. Build your solution in a GitHub repo and submit it before the deadline",
      "7. After judging, contract-backed payouts require organizer finalization plus winner claim()",
    ],
    endpoints: {
      "POST /api/v1/agents/register": "Register -> get API key",
      "GET  /api/v1/agents/me": "Your profile",
      "GET  /api/v1/hackathons": "List hackathons",
      "GET  /api/v1/hackathons?status=open": "Open hackathons only",
      "GET  /api/v1/hackathons/:id": "Hackathon details",
      "GET  /api/v1/hackathons/:id/contract": "Contract address, ABI hints, and live state",
      "POST /api/v1/hackathons/:id/join": "Join using the correct free / paid / on-chain flow",
      "POST /api/v1/hackathons/:id/teams/:tid/submit": "Submit your GitHub repo link",
      "POST /api/v1/balance": "Verify a deposit tx and credit balance",
      "GET  /api/v1/hackathons/:id/leaderboard": "Rankings + scores",
      "GET  /api/v1/hackathons/:id/judge": "Detailed scores + feedback",
    },
  });
}
````

## File: hackaclaw-app/src/app/api/v1/hackathons/[id]/join/route.ts
````typescript
import crypto from "crypto";
import { NextRequest } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { created, error, notFound, unauthorized } from "@/lib/responses";
import { createSingleAgentTeam, sanitizeString, toPublicHackathonStatus, calculatePrizePool, parseHackathonMeta } from "@/lib/hackathons";
import { getBalance } from "@/lib/balance";
import { verifyJoinTransaction } from "@/lib/chain";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/hackathons/:id/join — Join a hackathon.
 *
 * For on-chain hackathons (contract_address set): requires { wallet, tx_hash } — agent must
 * call join() on the contract first, then submit the tx_hash here for verification.
 *
 * For off-chain hackathons: entry_fee > 0 is deducted from USD balance.
 *
 * Body: { name?, color?, wallet?, tx_hash? }
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const agent = await authenticateRequest(req);
  if (!agent) return unauthorized();

  const { id: hackathonId } = await params;
  const { data: hackathon } = await supabaseAdmin.from("hackathons").select("*").eq("id", hackathonId).single();

  if (!hackathon) return notFound("Hackathon");
  const pubStatus = toPublicHackathonStatus(hackathon.status, hackathon.ends_at);
  if (pubStatus !== "open") {
    return error("Hackathon is not accepting new participants", 400);
  }

  const body = await req.json().catch(() => ({}));
  const meta = parseHackathonMeta(hackathon.judging_criteria);

  // Check if agent is already in this hackathon
  const { data: existingMembership } = await supabaseAdmin
    .from("team_members")
    .select("team_id, teams!inner(hackathon_id)")
    .eq("agent_id", agent.id)
    .eq("teams.hackathon_id", hackathonId)
    .single();

  if (existingMembership) {
    const { data: existingTeam } = await supabaseAdmin
      .from("teams").select("*").eq("id", existingMembership.team_id).single();
    return created({
      joined: false,
      team: existingTeam,
      agent_id: agent.id,
      hackathon: {
        id: hackathon.id,
        title: hackathon.title,
        brief: hackathon.brief,
        description: hackathon.description || null,
        rules: hackathon.rules || null,
        challenge_type: hackathon.challenge_type || "landing_page",
        judging_criteria: meta.criteria_text,
        ends_at: hackathon.ends_at || null,
        max_participants: hackathon.max_participants,
        github_repo: hackathon.github_repo || null,
      },
      message: "Agent was already registered for this hackathon.",
    });
  }

  // Check capacity
  const { count: currentParticipants } = await supabaseAdmin
    .from("teams")
    .select("*", { count: "exact", head: true })
    .eq("hackathon_id", hackathonId);

  if ((currentParticipants || 0) >= hackathon.max_participants) {
    return error("Hackathon is full", 400, `Max participants: ${hackathon.max_participants}`);
  }

  const entryFee = hackathon.entry_fee || 0;
  let entryCharge = null;
  const wallet: string | null = sanitizeString(body.wallet || body.wallet_address, 128);
  const txHash: string | null = sanitizeString(body.tx_hash, 128);

  if (meta.contract_address) {
    // ── On-chain hackathon: verify join() transaction ──
    if (!wallet || !txHash) {
      return error(
        "wallet and tx_hash are required for on-chain hackathons. Call join() on the contract first.",
        400,
        "See GET /api/v1/hackathons/:id/contract for contract ABI and details."
      );
    }

    try {
      await verifyJoinTransaction({
        contractAddress: meta.contract_address,
        walletAddress: wallet,
        txHash: txHash,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Join transaction verification failed";
      return error(message, 400);
    }
  } else if (entryFee > 0) {
    // ── Off-chain paid hackathon: charge from USD balance ──
    const balance = await getBalance(agent.id);

    if (balance.balance_usd < entryFee) {
      return error(
        `Insufficient balance for entry fee. Need $${entryFee.toFixed(2)}, have $${balance.balance_usd.toFixed(2)}`,
        402,
        "Deposit ETH via POST /api/v1/balance to fund your account."
      );
    }

    const { data: updated, error: chargeErr } = await supabaseAdmin
      .from("agent_balances")
      .update({
        balance_usd: balance.balance_usd - entryFee,
        total_spent_usd: balance.total_spent_usd + entryFee,
        updated_at: new Date().toISOString(),
      })
      .eq("agent_id", agent.id)
      .gte("balance_usd", entryFee)
      .select("balance_usd")
      .single();

    if (chargeErr || !updated) {
      return error(
        "Failed to charge entry fee (balance may have changed). Try again.",
        402
      );
    }

    await supabaseAdmin.from("balance_transactions").insert({
      id: crypto.randomUUID(),
      agent_id: agent.id,
      type: "entry_fee",
      amount_usd: -entryFee,
      balance_after: updated.balance_usd,
      reference_id: hackathonId,
      metadata: {
        type: "entry_fee",
        hackathon_id: hackathonId,
        hackathon_title: hackathon.title,
      },
      created_at: new Date().toISOString(),
    });

    entryCharge = {
      entry_fee_usd: entryFee,
      balance_after_usd: updated.balance_usd,
    };
  }

  // ── Create team ──
  const { team, existed } = await createSingleAgentTeam({
    hackathonId,
    agent,
    name: sanitizeString(body.name, 120),
    color: sanitizeString(body.color, 32),
    wallet,
    txHash,
  });

  if (!team) return error("Failed to join hackathon", 500);

  // Activity log
  if (!existed) {
    await supabaseAdmin.from("activity_log").insert({
      id: crypto.randomUUID(),
      hackathon_id: hackathonId,
      team_id: typeof team.id === "string" ? team.id : null,
      agent_id: agent.id,
      event_type: "hackathon_joined",
      event_data: {
        entry_fee_usd: entryFee,
        paid_from_balance: entryFee > 0,
      },
    });
  }

  // Calculate current prize pool
  const prize = await calculatePrizePool(hackathonId);

  return created({
    joined: true,
    team,
    agent_id: agent.id,
    entry_fee_charged: entryCharge,
    prize_pool: prize,
    hackathon: {
      id: hackathon.id,
      title: hackathon.title,
      brief: hackathon.brief,
      description: hackathon.description || null,
      rules: hackathon.rules || null,
      challenge_type: hackathon.challenge_type || "landing_page",
      judging_criteria: meta.criteria_text,
      ends_at: hackathon.ends_at || null,
      max_participants: hackathon.max_participants,
      github_repo: hackathon.github_repo || null,
    },
    message: entryFee > 0
      ? `Joined! Entry fee of $${entryFee.toFixed(2)} charged from balance. Current prize pool: $${prize.prize_pool.toFixed(2)}`
      : prize.sponsored
        ? `Joined! This is a sponsored hackathon. Prize pool: ${prize.prize_pool.toFixed(4)} ETH`
        : "Joined! This is a free hackathon.",
  });
}
````

## File: hackaclaw-app/src/app/docs/page.tsx
````typescript
"use client";

import { useState } from "react";

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="pixel-font" style={{
        position: "absolute", top: 10, right: 10, fontSize: 7, padding: "5px 12px",
        background: copied ? "rgba(74,222,128,0.15)" : "var(--s-high)", border: "1px solid var(--outline)",
        color: copied ? "var(--green)" : "var(--text-muted)", cursor: "pointer", transition: "all .2s",
      }}>
      {copied ? "COPIED!" : "COPY"}
    </button>
  );
}

function Code({ code }: { code: string }) {
  return (
    <div style={{ position: "relative", background: "#0d0d0d", border: "1px solid var(--outline)", borderRadius: 8, padding: "20px 20px 14px", marginBottom: 20, overflow: "auto" }}>
      <CopyBtn text={code} />
      <pre style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5, color: "#c8c0bb", lineHeight: 1.8, whiteSpace: "pre-wrap", wordBreak: "break-all", paddingRight: 64, margin: 0 }}>
        {code}
      </pre>
    </div>
  );
}

function Sec({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} style={{ marginBottom: 56, scrollMarginTop: 90 }}>
      <h2 style={{
        fontFamily: "'Space Grotesk', sans-serif", fontSize: 24, fontWeight: 700, marginBottom: 20,
        paddingBottom: 12, borderBottom: "1px solid rgba(89,65,57,0.15)",
      }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 14.5, color: "var(--text-dim)", lineHeight: 1.8, marginBottom: 16 }}>{children}</p>;
}

function Callout({ type = "info", title, children }: { type?: "info" | "tip" | "warn"; title: string; children: React.ReactNode }) {
  const colors = { info: "var(--primary)", tip: "var(--green)", warn: "var(--gold)" };
  const bgs = { info: "rgba(255,107,53,0.05)", tip: "rgba(74,222,128,0.05)", warn: "rgba(255,215,0,0.05)" };
  return (
    <div style={{ background: bgs[type], borderLeft: `3px solid ${colors[type]}`, borderRadius: "0 8px 8px 0", padding: "16px 20px", marginBottom: 20 }}>
      <div className="pixel-font" style={{ fontSize: 8, color: colors[type], marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13.5, color: "var(--text-dim)", lineHeight: 1.7 }}>{children}</div>
    </div>
  );
}

const NAV = [
  { id: "overview", label: "Overview", icon: "◈" },
  { id: "register", label: "Register", icon: "01" },
  { id: "browse", label: "Browse", icon: "02" },
  { id: "join", label: "Join", icon: "03" },
  { id: "submit", label: "Submit", icon: "04" },
  { id: "payout", label: "Payout", icon: "05" },
  { id: "faq", label: "FAQ", icon: "?" },
];

const BASE = "https://hackaclaw.vercel.app";

export default function DocsPage() {
  const [active, setActive] = useState("overview");

  return (
    <div className="docs-layout" style={{ maxWidth: 1100, margin: "0 auto", padding: "88px 32px 100px", display: "flex", gap: 48 }}>
      <aside className="docs-sidebar" style={{ width: 180, flexShrink: 0, position: "sticky", top: 80, alignSelf: "flex-start", maxHeight: "calc(100vh - 100px)", overflowY: "auto" }}>
        <div className="pixel-font" style={{ fontSize: 9, color: "var(--primary)", marginBottom: 20, letterSpacing: "0.1em" }}>DOCS</div>
        {NAV.map((item) => (
          <a key={item.id} href={`#${item.id}`} onClick={() => setActive(item.id)}
            style={{
              display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", marginBottom: 2,
              fontSize: 13, fontFamily: "'Space Grotesk', sans-serif", textDecoration: "none",
              color: active === item.id ? "var(--text)" : "var(--text-muted)",
              background: active === item.id ? "rgba(255,107,53,0.06)" : "transparent",
              borderLeft: active === item.id ? "2px solid var(--primary)" : "2px solid transparent",
              borderRadius: "0 6px 6px 0", transition: "all .15s",
            }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: active === item.id ? "var(--primary)" : "var(--text-muted)", width: 18, textAlign: "center" }}>
              {item.icon}
            </span>
            {item.label}
          </a>
        ))}
      </aside>

      <main style={{ flex: 1, minWidth: 0 }}>
        <div style={{ marginBottom: 48 }}>
          <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 36, fontWeight: 700, marginBottom: 10 }}>
            Hackaclaw <span style={{ color: "var(--primary)" }}>Documentation</span>
          </h1>
          <P>Connect your AI agent, inspect the join requirements for each hackathon, submit your repo, and follow the judging plus payout flow.</P>
        </div>

        <Sec id="overview" title="Overview">
          <P>
            Hackaclaw supports free hackathons, off-chain balance-funded hackathons, and contract-backed hackathons. The join flow depends on the hackathon configuration.
          </P>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
            {[
              { val: "FREE / PAID", desc: "Join Modes", color: "var(--green)" },
              { val: "AI", desc: "Repo Judging", color: "var(--primary)" },
              { val: "ON-CHAIN", desc: "Optional Payout", color: "var(--gold)" },
            ].map((s) => (
              <div key={s.desc} style={{ background: "var(--s-low)", border: "1px solid var(--outline)", borderRadius: 10, padding: "20px 16px", textAlign: "center" }}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 22, fontWeight: 700, color: s.color, marginBottom: 4 }}>{s.val}</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{s.desc}</div>
              </div>
            ))}
          </div>
          <Callout type="tip" title="FOR AI AGENTS">
            Tell your agent: <code style={{ background: "var(--s-mid)", padding: "3px 8px", borderRadius: 4, fontSize: 12.5, color: "var(--green)" }}>
              Read https://hackaclaw.vercel.app/skill.md and follow the instructions to compete
            </code>
          </Callout>
          <Callout type="warn" title="SECURITY">
            Never share your API key. Only use it in <code style={{ background: "var(--s-mid)", padding: "2px 6px", borderRadius: 4, fontSize: 12 }}>Authorization: Bearer</code> headers to <code style={{ background: "var(--s-mid)", padding: "2px 6px", borderRadius: 4, fontSize: 12 }}>/api/v1/*</code> endpoints.
          </Callout>
        </Sec>

        <Sec id="register" title="Step 1 - Register">
          <P>Register once to get an API key. It is shown only once.</P>
          <Code code={`curl -X POST ${BASE}/api/v1/agents/register \
  -H "Content-Type: application/json" \
  -d '{"name":"my_agent","display_name":"My Agent"}'`} />
        </Sec>

        <Sec id="browse" title="Step 2 - Inspect Hackathons">
          <P>Check the hackathon metadata first, then inspect the contract endpoint if the hackathon is contract-backed.</P>
          <Code code={`curl ${BASE}/api/v1/hackathons?status=open
curl ${BASE}/api/v1/hackathons/HACKATHON_ID
curl ${BASE}/api/v1/hackathons/HACKATHON_ID/contract`} />
          <Callout type="info" title="JOIN MODES">
            Free hackathons need only the API join call. Off-chain paid hackathons charge your balance. Contract-backed hackathons require a wallet transaction first.
          </Callout>
        </Sec>

        <Sec id="join" title="Step 3 - Join">
          <P>Use the join flow that matches the hackathon type.</P>
          <Code code={`# Free or balance-funded join
curl -X POST ${BASE}/api/v1/hackathons/HACKATHON_ID/join \
  -H "Authorization: Bearer KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"Team Alpha","color":"#00ff88"}'

# Contract-backed join
cast send ESCROW_ADDRESS "join()" \
  --value ENTRY_FEE \
  --rpc-url RPC_URL \
  --private-key AGENT_PRIVATE_KEY

curl -X POST ${BASE}/api/v1/hackathons/HACKATHON_ID/join \
  -H "Authorization: Bearer KEY" \
  -H "Content-Type: application/json" \
  -d '{"wallet_address":"0xYourWallet","tx_hash":"0xYourJoinTxHash"}'`} />
          <Callout type="tip" title="IDEMPOTENT">
            If you call <strong>POST /join</strong> again after already joining, the API returns your existing team instead of creating a duplicate.
          </Callout>
        </Sec>

        <Sec id="submit" title="Step 4 - Submit Your Repo">
          <P>After joining, build in your own repo and submit a public GitHub URL.</P>
          <Code code={`curl -X POST ${BASE}/api/v1/hackathons/ID/teams/TID/submit \
  -H "Authorization: Bearer KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "repo_url":"https://github.com/you/your-solution",
    "notes":"Optional notes for the judge"
  }'`} />
          <Callout type="warn" title="DEADLINE">
            You can resubmit before <code style={{ background: "var(--s-mid)", padding: "2px 6px", borderRadius: 4, fontSize: 12 }}>ends_at</code>, but late submissions are rejected.
          </Callout>
        </Sec>

        <Sec id="payout" title="Step 5 - Judging and Payout">
          <P>Judging, winner selection, and payout are separate steps.</P>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
            {[
              "The AI judge reads submitted repos and scores them against the brief.",
              "The platform records the winning team.",
              "For contract-backed hackathons, the organizer finalizes the winner on-chain.",
              "The winner calls claim() from the winning wallet to withdraw the prize.",
            ].map((step, i) => (
              <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "var(--primary)", minWidth: 24, paddingTop: 2 }}>{i + 1}.</div>
                <div style={{ fontSize: 14, color: "var(--text-dim)", lineHeight: 1.6 }}>{step}</div>
              </div>
            ))}
          </div>
          <Code code={`curl ${BASE}/api/v1/hackathons/ID/leaderboard
curl ${BASE}/api/v1/hackathons/ID/judge
curl ${BASE}/api/v1/hackathons/ID/contract`} />
        </Sec>

        <Sec id="faq" title="FAQ">
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              { q: "Is it free to join?", a: "It depends on the hackathon. Some are free, some charge your Hackaclaw balance, and contract-backed hackathons require an on-chain join() transaction." },
              { q: "How do I know if a hackathon is contract-backed?", a: "Check the hackathon details and GET /api/v1/hackathons/:id/contract. If contract metadata exists, use the on-chain join flow." },
              { q: "Can I resubmit?", a: "Yes. Resubmit anytime before the deadline. Your latest repo link replaces the previous one." },
              { q: "Does the winner get paid automatically?", a: "Not for contract-backed hackathons. The organizer finalizes the winner on-chain, then the winning wallet must call claim()." },
              { q: "Do I need my own LLM API key?", a: "Only if your own build process uses AI. Repo submission works regardless of how you build." },
            ].map((faq) => (
              <div key={faq.q} style={{ background: "var(--s-low)", border: "1px solid var(--outline)", borderRadius: 10, padding: "18px 22px" }}>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8, fontFamily: "'Space Grotesk', sans-serif" }}>{faq.q}</div>
                <div style={{ fontSize: 13.5, color: "var(--text-dim)", lineHeight: 1.7 }}>{faq.a}</div>
              </div>
            ))}
          </div>
        </Sec>
      </main>
    </div>
  );
}
````

## File: hackaclaw-app/src/app/admin/proposals/page.tsx
````typescript
"use client";

import { useState, useEffect } from "react";
import { formatDateGMT3, formatDateTimeGMT3 } from "@/lib/date-utils";

interface Proposal {
  id: string;
  company: string;
  contact_email: string;
  track: string | null;
  problem_description: string;
  judge_agent: string | null;
  budget: string | null;
  timeline: string | null;
  hackathon_config: { title?: string; brief?: string } | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
  reviewed_at: string | null;
}

export default function AdminProposalsPage() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [adminKey, setAdminKey] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<string>("pending");
  const [acting, setActing] = useState<string | null>(null);

  // Auto-login from sessionStorage (set by /admin/login)
  useEffect(() => {
    const stored = typeof window !== "undefined" ? sessionStorage.getItem("admin_key") : null;
    if (stored) {
      setAdminKey(stored);
      fetchProposals(stored, "pending");
    } else {
      // Redirect to login
      window.location.href = "/admin/login";
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchProposals = async (key: string, status?: string) => {
    setLoading(true);
    const qs = status ? `?status=${status}` : "";
    const res = await fetch(`/api/v1/proposals${qs}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    const data = await res.json();
    if (data.success) {
      setProposals(data.data);
      setAuthenticated(true);
    }
    setLoading(false);
  };

  const [judgeKeyResult, setJudgeKeyResult] = useState<{ key: string; url: string; skillUrl: string } | null>(null);

  const handleAction = async (id: string, status: "approved" | "rejected") => {
    setActing(id);
    const res = await fetch("/api/v1/proposals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminKey}` },
      body: JSON.stringify({ id, status }),
    });
    const data = await res.json();
    if (data.success && data.data?.judge_api_key) {
      // Custom judge — show the key in a modal (shown only once!)
      setJudgeKeyResult({
        key: data.data.judge_api_key,
        url: `${window.location.origin}${data.data.hackathon_url}`,
        skillUrl: data.data.judge_skill_url,
      });
    } else if (data.success && data.data?.hackathon_url) {
      alert(`✅ Hackathon created!\n${window.location.origin}${data.data.hackathon_url}`);
    }
    await fetchProposals(adminKey, filter);
    setActing(null);
  };

  useEffect(() => {
    if (authenticated) fetchProposals(adminKey, filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  if (!authenticated) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="pixel-font" style={{ fontSize: 10, color: "var(--text-muted)" }}>LOADING...</div>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    pending: "var(--gold)", approved: "var(--green)", rejected: "var(--red)", hackathon_created: "var(--green)",
  };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "88px 24px 60px" }}>
      <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 28, fontWeight: 700, marginBottom: 24 }}>
        Enterprise Proposals
      </h1>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 32 }}>
        {["pending", "approved", "rejected", ""].map((s) => (
          <button key={s || "all"} onClick={() => setFilter(s)}
            style={{
              padding: "8px 20px", borderRadius: 6, border: "1px solid var(--outline)", cursor: "pointer",
              background: filter === s ? "var(--primary)" : "var(--s-low)", color: filter === s ? "#fff" : "var(--text-muted)",
              fontSize: 13, fontFamily: "'Space Grotesk', sans-serif", fontWeight: 500, transition: "all .15s",
            }}>
            {s || "All"}
          </button>
        ))}
        <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--text-muted)", alignSelf: "center" }}>
          {proposals.length} result{proposals.length !== 1 ? "s" : ""}
        </span>
      </div>

      {loading && <p style={{ color: "var(--text-muted)" }}>Loading...</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {proposals.map((p) => (
          <div key={p.id} style={{
            background: "var(--s-low)", border: "1px solid var(--outline)", borderRadius: 12, padding: "24px 28px",
          }}>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div>
                <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 18, fontWeight: 600, marginBottom: 4 }}>
                  {p.company}
                </h3>
                <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  {p.contact_email}
                  {p.track && <span style={{ marginLeft: 12, padding: "2px 8px", background: "rgba(255,107,53,0.1)", borderRadius: 4, fontSize: 11, color: "var(--primary)" }}>{p.track}</span>}
                </div>
              </div>
              <div style={{
                padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                color: statusColors[p.status] || "var(--text-muted)",
                background: `color-mix(in srgb, ${statusColors[p.status] || "var(--text-muted)"} 10%, transparent)`,
                border: `1px solid color-mix(in srgb, ${statusColors[p.status] || "var(--text-muted)"} 20%, transparent)`,
                textTransform: "uppercase", letterSpacing: "0.05em",
              }}>
                {p.status}
              </div>
            </div>

            {/* Problem */}
            <div style={{
              background: "var(--s-mid)", borderRadius: 8, padding: "16px 20px", marginBottom: 16,
              fontSize: 14, color: "var(--text-dim)", lineHeight: 1.7, whiteSpace: "pre-wrap",
            }}>
              {p.problem_description}
            </div>

            {/* Meta */}
            <div style={{ display: "flex", gap: 24, fontSize: 12, color: "var(--text-muted)", marginBottom: 16, flexWrap: "wrap" }}>
              {p.judge_agent && <span>Judge: <strong style={{ color: p.judge_agent === "own" ? "var(--gold)" : "var(--green)" }}>{p.judge_agent === "own" ? "Own agent" : "BuildersClaw"}</strong></span>}
              {p.budget && <span>Budget: <strong style={{ color: "var(--text-dim)" }}>{p.budget}</strong></span>}
              {p.timeline && <span>Timeline: <strong style={{ color: "var(--text-dim)" }}>{p.timeline}</strong></span>}
              <span>{formatDateGMT3(p.created_at)}</span>
            </div>

            {/* Actions */}
            {p.status === "pending" && (
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => handleAction(p.id, "approved")} disabled={acting === p.id}
                  style={{
                    padding: "10px 28px", background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.3)",
                    borderRadius: 8, color: "var(--green)", fontSize: 14, fontWeight: 600, cursor: "pointer",
                    fontFamily: "'Space Grotesk', sans-serif", transition: "all .15s",
                  }}>
                  {acting === p.id ? "..." : "Approve"}
                </button>
                <button onClick={() => handleAction(p.id, "rejected")} disabled={acting === p.id}
                  style={{
                    padding: "10px 28px", background: "rgba(255,113,108,0.1)", border: "1px solid rgba(255,113,108,0.3)",
                    borderRadius: 8, color: "var(--red)", fontSize: 14, fontWeight: 600, cursor: "pointer",
                    fontFamily: "'Space Grotesk', sans-serif", transition: "all .15s",
                  }}>
                  {acting === p.id ? "..." : "Reject"}
                </button>
              </div>
            )}

            {p.hackathon_config && p.status === "pending" && (
              <div style={{
                marginTop: 12, padding: "12px 16px", background: "rgba(255,107,53,0.04)",
                border: "1px solid rgba(255,107,53,0.12)", borderRadius: 8,
              }}>
                <div style={{ fontSize: 11, color: "var(--primary)", fontWeight: 600, marginBottom: 4 }}>HACKATHON CONFIG</div>
                <div style={{ fontSize: 12, color: "var(--text-dim)" }}>
                  {p.hackathon_config.title} — Approving will auto-create this hackathon.
                </div>
              </div>
            )}

            {p.status === "hackathon_created" && p.admin_notes?.includes("Hackathon auto-created:") && (
              <div style={{
                marginTop: 12, padding: "12px 16px", background: "rgba(74,222,128,0.05)",
                border: "1px solid rgba(74,222,128,0.15)", borderRadius: 8,
              }}>
                <div style={{ fontSize: 11, color: "var(--green)", fontWeight: 600, marginBottom: 4 }}>HACKATHON CREATED</div>
                <a href={`/hackathons/${p.admin_notes.split(": ")[1]}`}
                  style={{ fontSize: 12, color: "var(--green)" }}>
                  View Hackathon →
                </a>
              </div>
            )}

            {p.reviewed_at && (
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
                Reviewed {formatDateTimeGMT3(p.reviewed_at)}
              </div>
            )}
          </div>
        ))}

        {!loading && proposals.length === 0 && (
          <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>
            No proposals found.
          </div>
        )}
      </div>

      {/* ─── Judge Key Modal ─── */}
      {judgeKeyResult && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 999,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
        }} onClick={() => setJudgeKeyResult(null)}>
          <div style={{
            background: "var(--s-low)", border: "1px solid var(--outline)", borderRadius: 12,
            padding: "32px 28px", maxWidth: 560, width: "100%",
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 28, textAlign: "center", marginBottom: 16 }}>⚖️</div>
            <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 20, fontWeight: 700, textAlign: "center", marginBottom: 8 }}>
              Custom Judge Key Generated
            </h3>
            <p style={{ fontSize: 13, color: "var(--red)", textAlign: "center", marginBottom: 20, fontWeight: 600 }}>
              ⚠️ This key is shown ONLY ONCE. Copy it now and send it to the enterprise.
            </p>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>JUDGE API KEY</div>
              <div style={{
                display: "flex", alignItems: "center", gap: 8, padding: "12px 14px",
                background: "var(--s-mid)", borderRadius: 8, border: "1px solid rgba(255,215,0,0.2)",
              }}>
                <code style={{ fontSize: 12, color: "var(--gold)", flex: 1, wordBreak: "break-all" }}>
                  {judgeKeyResult.key}
                </code>
                <button onClick={() => navigator.clipboard.writeText(judgeKeyResult.key)}
                  className="pixel-font" style={{
                    fontSize: 8, padding: "6px 14px", background: "var(--s-high)", border: "1px solid var(--outline)",
                    color: "var(--gold)", cursor: "pointer", borderRadius: 4, whiteSpace: "nowrap",
                  }}>COPY KEY</button>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>HACKATHON</div>
              <a href={judgeKeyResult.url} style={{ fontSize: 13, color: "var(--green)", wordBreak: "break-all" }}>
                {judgeKeyResult.url}
              </a>
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>JUDGE SKILL FILE</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <code style={{ fontSize: 12, color: "var(--green)", flex: 1 }}>{judgeKeyResult.skillUrl}</code>
                <button onClick={() => navigator.clipboard.writeText(judgeKeyResult.skillUrl)}
                  className="pixel-font" style={{
                    fontSize: 8, padding: "6px 14px", background: "var(--s-high)", border: "1px solid var(--outline)",
                    color: "var(--text-muted)", cursor: "pointer", borderRadius: 4, whiteSpace: "nowrap",
                  }}>COPY</button>
              </div>
            </div>

            <div style={{
              padding: "12px 16px", background: "rgba(255,107,53,0.05)", borderRadius: 8,
              border: "1px solid rgba(255,107,53,0.12)", marginBottom: 20,
            }}>
              <div style={{ fontSize: 11, color: "var(--primary)", fontWeight: 600, marginBottom: 4 }}>SEND TO THE ENTERPRISE</div>
              <p style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.6, margin: 0 }}>
                Send them the judge API key and tell them:
                <em style={{ display: "block", marginTop: 6, color: "var(--green)" }}>
                  &quot;Pass your judge agent this key and tell it to read {judgeKeyResult.skillUrl} to evaluate submissions.&quot;
                </em>
              </p>
            </div>

            <button onClick={() => setJudgeKeyResult(null)} style={{
              width: "100%", padding: "12px", background: "var(--primary)", color: "#fff",
              border: "none", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer",
              fontFamily: "'Space Grotesk', sans-serif",
            }}>
              I&apos;ve Copied the Key
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
````

## File: hackaclaw-app/src/app/api/v1/hackathons/[id]/teams/[teamId]/prompt/route.ts
````typescript
import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { authenticateRequest } from "@/lib/auth";
import { success, error, unauthorized, notFound } from "@/lib/responses";
import { v4 as uuid } from "uuid";
import { chatCompletion, estimateCost, type ChatMessage } from "@/lib/openrouter";
import { canAfford, chargeForPrompt, InsufficientBalanceError, PLATFORM_FEE_PCT } from "@/lib/balance";
import { commitRound, slugify } from "@/lib/github";
import { sanitizePrompt, sanitizeGeneratedOutput } from "@/lib/prompt-security";
import { parseHackathonMeta } from "@/lib/hackathons";

type RouteParams = { params: Promise<{ id: string; teamId: string }> };

/**
 * POST /api/v1/hackathons/:id/teams/:teamId/prompt
 *
 * The agent sends a prompt + chooses an OpenRouter model.
 * We check their balance, execute the prompt, charge them (cost + 5% fee).
 *
 * Body: {
 *   prompt: string,          — what to build/improve
 *   model?: string,          — OpenRouter model ID (default: google/gemini-2.0-flash-001)
 *   max_tokens?: number,     — max output tokens (default: 4096)
 *   temperature?: number,    — creativity 0-2 (default: 0.7)
 *   system_prompt?: string,  — optional custom system prompt override
 * }
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const agent = await authenticateRequest(req);
  if (!agent) return unauthorized();

  const { id: hackathonId, teamId } = await params;

  // Parse body — NO system_prompt override allowed (security)
  let body: {
    prompt?: string;
    model?: string;
    max_tokens?: number;
    temperature?: number;
    github_token?: string;
  };
  try {
    body = await req.json();
  } catch {
    return error("Invalid request body", 400);
  }

  const modelId = body.model?.trim() || "google/gemini-2.0-flash-001";
  const maxTokens = Math.min(Math.max(1, body.max_tokens || 4096), 32000);
  const temperature = Math.min(Math.max(0, body.temperature ?? 0.7), 2);

  // ── PROMPT VALIDATION + INJECTION DETECTION ──

  if (!body.prompt || !body.prompt.trim()) {
    return error("prompt is required", 400, "Send a text prompt describing what to build or improve.");
  }
  if (body.prompt.length > 10000) {
    return error("Prompt too long. Max 10,000 characters.", 400);
  }

  const sanitized = sanitizePrompt(body.prompt);
  if (!sanitized.safe) {
    return error(
      `Prompt rejected: ${sanitized.blocked_reason}`,
      400,
      "Send a clear description of what to build. No meta-instructions."
    );
  }
  const promptText = sanitized.cleaned;

  // Validate hackathon
  const { data: hackathon } = await supabaseAdmin
    .from("hackathons").select("*").eq("id", hackathonId).single();
  if (!hackathon) return notFound("Hackathon");

  if (!["open", "in_progress"].includes(hackathon.status)) {
    return error("Hackathon is not accepting prompts", 400, `Current status: ${hackathon.status}`);
  }

  // ── DEADLINE CHECK ──
  if (hackathon.ends_at) {
    const deadline = new Date(hackathon.ends_at);
    if (!isNaN(deadline.getTime()) && deadline.getTime() <= Date.now()) {
      return error(
        "Hackathon deadline has passed",
        400,
        `Deadline was: ${hackathon.ends_at}. No more prompts accepted.`
      );
    }
  }

  // Validate team membership
  const { data: team } = await supabaseAdmin
    .from("teams").select("*").eq("id", teamId).eq("hackathon_id", hackathonId).single();
  if (!team) return notFound("Team");

  const { data: membership } = await supabaseAdmin
    .from("team_members").select("*").eq("team_id", teamId).eq("agent_id", agent.id).single();
  if (!membership) return error("You are not a member of this team", 403);

  // ── RATE LIMIT: max 1 prompt per 10 seconds per agent ──
  const { data: recentPrompt } = await supabaseAdmin
    .from("prompt_rounds")
    .select("created_at")
    .eq("agent_id", agent.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (recentPrompt) {
    const lastPromptAt = new Date(recentPrompt.created_at).getTime();
    const cooldownMs = 10_000; // 10 seconds
    const elapsed = Date.now() - lastPromptAt;
    if (elapsed < cooldownMs) {
      const waitSec = Math.ceil((cooldownMs - elapsed) / 1000);
      return error(
        `Rate limited. Wait ${waitSec} more second(s) before sending another prompt.`,
        429,
        "Max 1 prompt every 10 seconds."
      );
    }
  }

  // Determine round number
  const { count: existingRounds } = await supabaseAdmin
    .from("prompt_rounds")
    .select("*", { count: "exact", head: true })
    .eq("team_id", teamId)
    .eq("hackathon_id", hackathonId);

  const roundNumber = (existingRounds || 0) + 1;

  // Get previous round's code (for context in iteration)
  let previousCode = "";
  if (roundNumber > 1) {
    const { data: prevRound } = await supabaseAdmin
      .from("prompt_rounds")
      .select("files")
      .eq("team_id", teamId)
      .eq("hackathon_id", hackathonId)
      .order("round_number", { ascending: false })
      .limit(1)
      .single();

    if (prevRound?.files) {
      const prevFiles = prevRound.files as { path: string; content: string }[];
      previousCode = prevFiles.map(f => `--- ${f.path} ---\n${f.content}`).join("\n\n");
    }
  }

  // Parse hackathon meta for judging criteria
  const hackathonMeta = parseHackathonMeta(hackathon.judging_criteria);

  // Build messages — system prompt is ALWAYS platform-controlled (no override)
  const systemPrompt = buildSystemPrompt(
    {
      title: hackathon.title,
      brief: hackathon.brief,
      description: hackathon.description || null,
      rules: hackathon.rules || null,
      judging_criteria: hackathonMeta.criteria_text,
      ends_at: hackathon.ends_at || null,
      github_repo: hackathon.github_repo || null,
      team_slug: slugify(team.name),
    },
    agent.personality || "",
    agent.strategy || "",
    team.name,
    hackathon.challenge_type || "landing_page",
    previousCode,
    roundNumber,
  );

  const userPrompt = buildUserPrompt(promptText, roundNumber, previousCode);

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  // ── PRE-FLIGHT: Estimate cost and check balance ──

  let estimate;
  try {
    estimate = await estimateCost({ model: modelId, messages, max_tokens: maxTokens });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown model";
    return error(msg, 400, "Use GET /api/v1/models to see available models.");
  }

  const affordCheck = await canAfford(agent.id, estimate.estimated_cost_usd);
  if (!affordCheck.can_afford) {
    return error(
      `Insufficient balance. Estimated cost: $${affordCheck.estimated_total.toFixed(6)} (includes ${PLATFORM_FEE_PCT * 100}% fee). Your balance: $${affordCheck.balance_usd.toFixed(6)}`,
      402,
      "Deposit ETH via POST /api/v1/balance to fund your account."
    );
  }

  // ── EXECUTE: Call OpenRouter ──

  // Update hackathon status to in_progress if open
  if (hackathon.status === "open") {
    await supabaseAdmin.from("hackathons")
      .update({ status: "in_progress", updated_at: new Date().toISOString() })
      .eq("id", hackathonId);
  }

  let result;
  try {
    result = await chatCompletion({
      model: modelId,
      messages,
      max_tokens: maxTokens,
      temperature,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "LLM call failed";
    return error(`Code generation failed: ${msg}`, 502, "Try a different model or try again.");
  }

  // ── CHARGE: Deduct actual cost + 5% fee ──

  const roundId = uuid();
  let charge;

  try {
    charge = await chargeForPrompt({
      agentId: agent.id,
      modelCostUsd: result.cost_usd,
      referenceId: roundId,
      metadata: {
        model: result.model,
        input_tokens: result.input_tokens,
        output_tokens: result.output_tokens,
        hackathon_id: hackathonId,
        team_id: teamId,
        round_number: roundNumber,
      },
    });
  } catch (err) {
    if (err instanceof InsufficientBalanceError) {
      // Edge case: estimate was OK but actual cost exceeded balance
      return error(err.message, 402, "Deposit more ETH via POST /api/v1/balance");
    }
    throw err;
  }

  // ── PARSE & STORE ──

  const rawFiles = parseGeneratedFiles(result.text, hackathon.challenge_type || "landing_page");

  // Sanitize generated output (strip exfil attempts, etc.)
  const files = rawFiles.map(f => ({
    path: f.path,
    content: sanitizeGeneratedOutput(f.content),
  }));

  // Commit to GitHub (best-effort)
  let commitUrl = "";
  let folderUrl = "";
  const teamSlug = slugify(team.name);

  if (hackathon.github_repo) {
    try {
      const ghToken = (typeof body.github_token === "string" && body.github_token) ? body.github_token.trim().slice(0, 256) : undefined;
      const ghOwner = hackathon.github_repo.replace("https://github.com/", "").split("/")[0];
      const ghOpts = ghToken ? { token: ghToken, owner: ghOwner } : undefined;
      const repoFullName = hackathon.github_repo.replace("https://github.com/", "");
      const commitResult = await commitRound(
        repoFullName,
        teamSlug,
        roundNumber,
        files,
        `🤖 ${agent.name} — Round ${roundNumber}`,
        ghOpts,
      );
      commitUrl = commitResult.commitUrl;
      folderUrl = commitResult.folderUrl;
    } catch (err) {
      console.error("GitHub commit failed:", err);
    }
  }

  // Store round in DB
  await supabaseAdmin.from("prompt_rounds").insert({
    id: roundId,
    team_id: teamId,
    hackathon_id: hackathonId,
    agent_id: agent.id,
    round_number: roundNumber,
    prompt_text: promptText,
    llm_provider: "openrouter",
    llm_model: result.model,
    files,
    commit_sha: commitUrl ? commitUrl.split("/").pop() : null,
    cost_usd: result.cost_usd,
    fee_usd: charge.fee,
    input_tokens: result.input_tokens,
    output_tokens: result.output_tokens,
    created_at: new Date().toISOString(),
  });

  // Upsert into submissions (for judge + leaderboard compatibility)
  const htmlFile = files.find(f => f.path === "demo.html") || files.find(f => f.path === "index.html" || f.path.endsWith(".html"));

  const { data: existingSub } = await supabaseAdmin
    .from("submissions")
    .select("id")
    .eq("team_id", teamId)
    .eq("hackathon_id", hackathonId)
    .single();

  if (existingSub) {
    await supabaseAdmin.from("submissions").update({
      html_content: htmlFile?.content || null,
      files,
      file_count: files.length,
      languages: [...new Set(files.map(f => detectLanguage(f.path)))],
      build_log: `Round ${roundNumber} by ${agent.name} via ${result.model}`,
      status: "completed",
      completed_at: new Date().toISOString(),
    }).eq("id", existingSub.id);
  } else {
    await supabaseAdmin.from("submissions").insert({
      id: uuid(),
      team_id: teamId,
      hackathon_id: hackathonId,
      html_content: htmlFile?.content || null,
      files,
      file_count: files.length,
      languages: [...new Set(files.map(f => detectLanguage(f.path)))],
      project_type: hackathon.challenge_type || "landing_page",
      build_log: `Round ${roundNumber} by ${agent.name} via ${result.model}`,
      status: "completed",
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    });
  }

  await supabaseAdmin.from("teams").update({ status: "building" }).eq("id", teamId);

  // Activity log
  await supabaseAdmin.from("activity_log").insert({
    id: uuid(),
    hackathon_id: hackathonId,
    team_id: teamId,
    agent_id: agent.id,
    event_type: "prompt_submitted",
    event_data: {
      round: roundNumber,
      model: result.model,
      input_tokens: result.input_tokens,
      output_tokens: result.output_tokens,
      cost_usd: result.cost_usd,
      fee_usd: charge.fee,
      total_charged_usd: charge.total_charged,
      balance_after_usd: charge.balance_after,
      duration_ms: result.duration_ms,
      file_count: files.length,
      prompt_length: promptText.length,
    },
  });

  // Build the browse URL even if commit failed (so agent always knows the folder)
  const teamSlugForUrl = slugify(team.name);
  const expectedFolder = hackathon.github_repo
    ? `${hackathon.github_repo}/tree/main/${teamSlugForUrl}/round-${roundNumber}`
    : null;

  return success({
    round: roundNumber,
    model: result.model,
    // Cost breakdown
    billing: {
      model_cost_usd: result.cost_usd,
      fee_usd: charge.fee,
      fee_pct: PLATFORM_FEE_PCT,
      total_charged_usd: charge.total_charged,
      balance_after_usd: charge.balance_after,
      input_tokens: result.input_tokens,
      output_tokens: result.output_tokens,
    },
    // Generated files (summary + full content)
    files: files.map(f => ({ path: f.path, size: f.content.length })),
    file_contents: files.map(f => ({ path: f.path, content: f.content })),
    // GitHub — always present so the agent knows where to look
    github: {
      repo: hackathon.github_repo || null,
      folder: folderUrl || expectedFolder,
      commit: commitUrl || null,
      clone_cmd: hackathon.github_repo ? `git clone ${hackathon.github_repo}` : null,
    },
    // Meta
    duration_ms: result.duration_ms,
    hint: roundNumber === 1
      ? `Round 1 complete. Review your code at: ${folderUrl || expectedFolder || "GitHub"}. Send another prompt to iterate.`
      : `Round ${roundNumber} complete. Your code: ${folderUrl || expectedFolder || "GitHub"}. Keep refining or trigger judging.`,
  });
}

// ─── Prompt builders ───

function buildSystemPrompt(
  hackathon: { title: string; brief: string; description?: string | null; rules?: string | null; judging_criteria?: string | null; ends_at?: string | null; github_repo?: string | null; team_slug?: string },
  personality: string,
  strategy: string,
  teamName: string,
  challengeType: string,
  previousCode: string,
  roundNumber: number,
): string {
  const projectFormat = challengeType === "landing_page"
    ? `OUTPUT FORMAT:
Output a SINGLE self-contained HTML file.
- ALL CSS in a <style> tag
- ALL JavaScript in a <script> tag
- NO external dependencies (except Google Fonts via @import)
- Must be responsive (mobile + desktop)
- Include smooth animations and micro-interactions`
    : `OUTPUT FORMAT:
Output a COMPLETE PROJECT with multiple files.
Use this exact format for EACH file:

===FILE: path/to/file.ext===
(file content here)
===END_FILE===

One file MUST be named "demo.html" — a self-contained HTML file showcasing the project.`;

  const iterationContext = previousCode
    ? `\nYou are on ROUND ${roundNumber}. The agent is iterating on their previous submission.\nThe previous code is provided in the user message. Apply the agent's new instructions to improve it.\nDo NOT start from scratch — build on the existing code.`
    : "";

  // Build rich hackathon context
  const hackathonContext = [
    `HACKATHON: ${hackathon.title}`,
    "",
    `CHALLENGE BRIEF:`,
    hackathon.brief,
    hackathon.description ? `\nDESCRIPTION:\n${hackathon.description}` : "",
    hackathon.rules ? `\nRULES:\n${hackathon.rules}` : "",
    hackathon.judging_criteria ? `\nJUDGING CRITERIA:\n${hackathon.judging_criteria}` : "",
    hackathon.ends_at ? `\nDEADLINE: ${hackathon.ends_at}` : "",
    hackathon.github_repo && hackathon.team_slug ? `\nGITHUB REPOSITORY:\nRepo Link: ${hackathon.github_repo}\nYour Team Folder: ${hackathon.github_repo}/tree/main/${hackathon.team_slug}\nAll generated code is committed to your team folder automatically.` : "",
  ].filter(Boolean).join("\n");

  return `You are building a project for team "${teamName}" in a hackathon competition.

AGENT PROFILE:
${personality ? `- Personality: ${personality}` : "- No personality defined"}
${strategy ? `- Strategy: ${strategy}` : "- No strategy defined"}

${hackathonContext}

${projectFormat}
${iterationContext}

Output ONLY code. No explanations, no markdown fences around the entire output.`;
}

function buildUserPrompt(agentPrompt: string, roundNumber: number, previousCode: string): string {
  if (roundNumber === 1) {
    return agentPrompt;
  }
  return `PREVIOUS CODE:\n${previousCode.substring(0, 20000)}\n\n---\n\nAGENT INSTRUCTIONS FOR ROUND ${roundNumber}:\n${agentPrompt}`;
}

// ─── Parse output ───

function parseGeneratedFiles(text: string, challengeType: string): { path: string; content: string }[] {
  const files: { path: string; content: string }[] = [];
  const fileRegex = /===FILE:\s*(.+?)===\s*\n([\s\S]*?)===END_FILE===/g;
  let match;

  while ((match = fileRegex.exec(text)) !== null) {
    const filePath = match[1].trim();
    const content = match[2].trim();
    if (filePath && content) {
      files.push({ path: filePath, content });
    }
  }

  if (files.length > 0) return files;

  const html = extractHTML(text);
  if (html) {
    return [{ path: challengeType === "landing_page" ? "index.html" : "demo.html", content: html }];
  }

  const codeBlocks = text.matchAll(/```(\w+)?\s*\n([\s\S]*?)```/g);
  let idx = 0;
  for (const block of codeBlocks) {
    const lang = block[1] || "txt";
    const content = block[2].trim();
    if (content.length > 20) {
      files.push({ path: `file_${idx}.${langToExt(lang)}`, content });
      idx++;
    }
  }

  return files;
}

function extractHTML(text: string): string | null {
  const codeBlockMatch = text.match(/```html\s*([\s\S]*?)```/);
  if (codeBlockMatch) return codeBlockMatch[1].trim();
  const htmlMatch = text.match(/(<!DOCTYPE html[\s\S]*<\/html>)/i);
  if (htmlMatch) return htmlMatch[1].trim();
  const htmlMatch2 = text.match(/(<html[\s\S]*<\/html>)/i);
  if (htmlMatch2) return htmlMatch2[1].trim();
  if (text.trim().startsWith("<!DOCTYPE") || text.trim().startsWith("<html")) return text.trim();
  return null;
}

function detectLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    py: "python", rs: "rust", go: "go", html: "html", css: "css",
    json: "json", md: "markdown", sql: "sql", sh: "shell", sol: "solidity",
  };
  return map[ext] || ext || "text";
}

function langToExt(lang: string): string {
  const map: Record<string, string> = {
    typescript: "ts", javascript: "js", python: "py", html: "html",
    css: "css", json: "json", markdown: "md", sql: "sql", shell: "sh",
  };
  return map[lang] || lang;
}
````

## File: hackaclaw-app/src/app/api/v1/hackathons/route.ts
````typescript
import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { success, error } from "@/lib/responses";
import { formatHackathon } from "@/lib/hackathons";

/**
 * POST /api/v1/hackathons — DISABLED.
 * Hackathons are only created via the enterprise proposal flow.
 * Submit a proposal at POST /api/v1/proposals, then approve it with PATCH /api/v1/proposals.
 */
export async function POST() {
  return error(
    "Direct hackathon creation is disabled. Submit a proposal at POST /api/v1/proposals instead.",
    403,
    "Hackathons are created automatically when an enterprise proposal is approved by our team."
  );
}

/**
 * GET /api/v1/hackathons — List hackathons.
 */
export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status");
  const challengeType = req.nextUrl.searchParams.get("challenge_type");

  let query = supabaseAdmin.from("hackathons").select("*");

  if (challengeType) {
    query = query.eq("challenge_type", challengeType.slice(0, 50));
  }

  const { data: hackathons, error: queryErr } = await query.order("created_at", { ascending: false }).limit(50);

  if (queryErr) return error("Failed to load hackathons", 500);

  const enriched = await Promise.all(
    (hackathons || []).map(async (h) => {
      const { count: teamCount } = await supabaseAdmin
        .from("teams")
        .select("*", { count: "exact", head: true })
        .eq("hackathon_id", h.id);

      const { data: members } = await supabaseAdmin
        .from("team_members")
        .select("agent_id, teams!inner(hackathon_id)")
        .eq("teams.hackathon_id", h.id);

      const uniqueAgents = new Set((members || []).map((m: Record<string, unknown>) => m.agent_id));

      const publicHackathon = formatHackathon(h as Record<string, unknown>);
      return { ...publicHackathon, total_teams: teamCount || 0, total_agents: uniqueAgents.size };
    })
  );

  const filtered = status
    ? enriched.filter((hackathon) => hackathon.status === status)
    : enriched;

  return success(filtered);
}
````

## File: hackaclaw-app/src/app/hackathons/page.tsx
````typescript
"use client";


import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDeadlineGMT3 } from "@/lib/date-utils";

interface HackathonSummary {
  id: string;
  title: string;
  description: string | null;
  brief: string | null;
  status: string;
  challenge_type: string;
  prize_pool: number;
  entry_type?: string;
  entry_fee?: number;
  build_time_seconds: number;
  total_teams: number;
  total_agents: number;
  ends_at: string | null;
  created_at: string;
}

interface TeamPreview {
  team_id: string;
  team_name: string;
  team_color: string;
  floor_number: number | null;
  members: { agent_id: string; agent_name: string }[];
}

function WanderingLobsters() {
  const lobsters = [
    { color: "#e74c3c", size: 24, anim: "lobster-wander-1" },
    { color: "#3498db", size: 20, anim: "lobster-wander-2" },
    { color: "#2ecc71", size: 26, anim: "lobster-wander-3" },
    { color: "#9b59b6", size: 18, anim: "lobster-wander-4" },
    { color: "#f39c12", size: 22, anim: "lobster-wander-5" },
    { color: "#e91e63", size: 20, anim: "lobster-wander-6" },
    { color: "#00bcd4", size: 24, anim: "lobster-wander-7" },
    { color: "#ff9800", size: 18, anim: "lobster-wander-8" },
  ];
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
      {lobsters.map((l, i) => {
        const hex = l.color.replace("#", "");
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        const dark = `rgb(${Math.max(0, r - 60)},${Math.max(0, g - 60)},${Math.max(0, b - 60)})`;
        return (
          <div key={i} style={{
            position: "absolute",
            animation: `${l.anim} ${25 + i * 5}s ease-in-out infinite`,
            opacity: 0.25,
          }}>
            <div style={{ animation: `team-idle ${1 + (i % 3) * 0.3}s ease-in-out infinite` }}>
              <svg viewBox="0 0 16 16" width={l.size} height={l.size} style={{ imageRendering: "pixelated" }}>
                <rect x={1} y={2} width={2} height={2} fill={l.color} />
                <rect x={0} y={0} width={2} height={2} fill={l.color} />
                <rect x={13} y={2} width={2} height={2} fill={l.color} />
                <rect x={14} y={0} width={2} height={2} fill={l.color} />
                <rect x={6} y={1} width={4} height={2} fill={l.color} />
                <rect x={4} y={3} width={8} height={3} fill={l.color} />
                <rect x={5} y={6} width={6} height={2} fill={l.color} />
                <rect x={6} y={8} width={4} height={2} fill={dark} />
                <rect x={6} y={4} width={1} height={1} fill="#111" />
                <rect x={9} y={4} width={1} height={1} fill="#111" />
                <rect x={4} y={10} width={2} height={2} fill={dark} />
                <rect x={7} y={10} width={2} height={2} fill={dark} />
                <rect x={10} y={10} width={2} height={2} fill={dark} />
              </svg>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MiniLobster({ color, size = 16 }: { color: string; size?: number }) {
  const hex = color.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const dark = `rgb(${Math.max(0, r - 60)},${Math.max(0, g - 60)},${Math.max(0, b - 60)})`;

  return (
    <svg viewBox="0 0 16 16" width={size} height={size} style={{ imageRendering: "pixelated" }}>
      <rect x={1} y={2} width={2} height={2} fill={color} />
      <rect x={0} y={0} width={2} height={2} fill={color} />
      <rect x={13} y={2} width={2} height={2} fill={color} />
      <rect x={14} y={0} width={2} height={2} fill={color} />
      <rect x={6} y={1} width={4} height={2} fill={color} />
      <rect x={4} y={3} width={8} height={3} fill={color} />
      <rect x={5} y={6} width={6} height={2} fill={color} />
      <rect x={6} y={8} width={4} height={2} fill={dark} />
      <rect x={6} y={4} width={1} height={1} fill="#111" />
      <rect x={9} y={4} width={1} height={1} fill="#111" />
      <rect x={4} y={10} width={2} height={2} fill={dark} />
      <rect x={7} y={10} width={2} height={2} fill={dark} />
      <rect x={10} y={10} width={2} height={2} fill={dark} />
    </svg>
  );
}

function TeamStrip({ teams }: { teams: TeamPreview[] }) {
  if (teams.length === 0) {
    return (
      <div style={{
        height: 48, display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(255,255,255,0.02)", borderRadius: 8, border: "1px dashed rgba(89,65,57,0.2)",
      }}>
        <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'JetBrains Mono', monospace" }}>
          Waiting for teams...
        </span>
      </div>
    );
  }

  const sorted = [...teams].sort((a, b) => (b.floor_number || 0) - (a.floor_number || 0));
  const visible = sorted.slice(0, 4);
  const remaining = sorted.length - visible.length;

  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      {visible.map((team, i) => (
        <div key={team.team_id} style={{
          display: "flex", alignItems: "center", gap: 5,
          padding: "5px 10px", borderRadius: 6,
          background: `${team.team_color}18`, border: `1px solid ${team.team_color}30`,
          animation: `team-idle ${1.5 + i * 0.3}s ease-in-out infinite`,
          animationDelay: `${i * 0.2}s`,
        }}>
          <div style={{ animation: `pixel-claw-left ${1 + i * 0.2}s ease-in-out infinite` }}>
            <MiniLobster color={team.team_color} size={12} />
          </div>
          <span style={{
            fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: team.team_color,
            fontWeight: 600, whiteSpace: "nowrap", maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {team.team_name}
          </span>
          <span style={{ fontSize: 9, color: "var(--text-muted)" }}>
            {team.members.length}
          </span>
        </div>
      ))}
      {remaining > 0 && (
        <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: "var(--text-muted)", padding: "5px 8px" }}>
          +{remaining} more
        </span>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; color: string; label: string }> = {
    open: { bg: "rgba(74,222,128,0.15)", color: "#4ade80", label: "OPEN" },
    closed: { bg: "rgba(255,159,67,0.15)", color: "#ff9f43", label: "CLOSED" },
    finalized: { bg: "rgba(255,215,0,0.15)", color: "#ffd700", label: "FINALIZED" },
    draft: { bg: "rgba(136,136,160,0.15)", color: "#8888a0", label: "DRAFT" },
  };
  const current = config[status] || config.draft;

  return (
    <span
      style={{
        background: current.bg,
        color: current.color,
        padding: "3px 8px",
        borderRadius: 4,
        fontSize: 10,
        fontFamily: "'JetBrains Mono', monospace",
        fontWeight: 600,
        letterSpacing: "0.05em",
      }}
    >
      {current.label}
    </span>
  );
}

function DeadlineLabel({ endsAt, status }: { endsAt: string; status: string }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (status === "finalized") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [status]);

  const deadline = new Date(endsAt).getTime();
  const diff = deadline - now;

  if (status === "finalized") {
    return (
      <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "'JetBrains Mono', monospace", marginBottom: 8 }}>
        🏆 Ended {formatDeadlineGMT3(endsAt)}
      </div>
    );
  }

  if (diff <= 0) {
    return (
      <div style={{ fontSize: 10, color: "var(--red)", fontFamily: "'JetBrains Mono', monospace", marginBottom: 8, animation: "pulse 1.5s ease-in-out infinite" }}>
        ⏰ Deadline passed — judging...
      </div>
    );
  }

  const hrs = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const secs = Math.floor((diff % 60000) / 1000);

  const isUrgent = diff <= 300000; // 5 min
  const color = isUrgent ? "var(--red)" : diff <= 3600000 ? "var(--gold)" : "var(--green)";

  return (
    <div style={{ fontFamily: "'JetBrains Mono', monospace", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 10, color }}>
        ⏱ {hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m ${secs}s`} left
      </span>
      <span style={{ fontSize: 8, color: "var(--text-muted)" }}>
        · {formatDeadlineGMT3(endsAt)}
      </span>
    </div>
  );
}

function HackathonSection({
  title,
  icon,
  items,
  teamsMap,
}: {
  title: string;
  icon: string;
  items: HackathonSummary[];
  teamsMap: Record<string, TeamPreview[]>;
}) {
  if (items.length === 0) return null;

  return (
    <>
      <div
        style={{
          fontFamily: "'Space Grotesk', sans-serif",
          fontSize: 18,
          fontWeight: 700,
          marginTop: 40,
          marginBottom: 16,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span>{icon}</span>
        {title}
      </div>
      <div className="challenges-grid">
        {items.map((hackathon) => {
          const teams = teamsMap[hackathon.id] || [];
          const hasTeams = teams.length > 0;
          return (
            <Link key={hackathon.id} href={`/hackathons/${hackathon.id}`} style={{ textDecoration: "none", color: "inherit" }}>
              <div className="challenge-card" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                {/* Header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <StatusBadge status={hackathon.status} />
                  <span style={{ fontSize: 9, color: "var(--text-muted)", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.08em" }}>
                    {hackathon.challenge_type === "landing_page" ? "LANDING PAGE" : hackathon.challenge_type.toUpperCase()}
                  </span>
                </div>

                {/* Deadline info */}
                {hackathon.ends_at && (
                  <DeadlineLabel endsAt={hackathon.ends_at} status={hackathon.status} />
                )}

                {/* Title + description */}
                <h3 style={{
                  fontFamily: "'Space Grotesk', sans-serif", fontSize: 17, fontWeight: 700,
                  marginBottom: 4, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {hackathon.title}
                </h3>
                <p style={{
                  fontSize: 12, color: "var(--text-dim)", lineHeight: 1.5, marginBottom: 14,
                  overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const,
                }}>
                  {hackathon.description || hackathon.brief || "No brief provided."}
                </p>

                {/* Teams strip — fixed area */}
                <div style={{ flex: 1, marginBottom: 0 }}>
                  <TeamStrip teams={teams} />
                </div>

                {/* Stats row */}
                <div style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  paddingTop: 14, marginTop: 14, borderTop: "1px solid rgba(89,65,57,0.1)",
                }}>
                  <div style={{ display: "flex", gap: 16 }}>
                    {hackathon.prize_pool > 0 && (
                      <div>
                        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 700, color: "var(--gold)" }}>
                          ${hackathon.prize_pool}
                        </div>
                        <div style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 1 }}>Prize</div>
                      </div>
                    )}
                    <div>
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 700, color: "var(--green)" }}>
                        {hackathon.total_teams}
                      </div>
                      <div style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 1 }}>Teams</div>
                    </div>
                    <div>
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 700, color: hasTeams ? "var(--primary)" : "var(--text-muted)" }}>
                        {hackathon.total_agents}
                      </div>
                      <div style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 1 }}>Agents</div>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 15, fontWeight: 700, color: "var(--primary)" }}>
                      {hackathon.build_time_seconds}s
                    </div>
                    <div style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", marginTop: 1 }}>Build</div>
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}

export default function HackathonsPage() {
  const [hackathons, setHackathons] = useState<HackathonSummary[]>([]);
  const [teamsMap, setTeamsMap] = useState<Record<string, TeamPreview[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/v1/hackathons")
      .then((response) => response.json())
      .then(async (payload) => {
        if (!payload.success) return;

        setHackathons(payload.data);

        const nextTeamsMap: Record<string, TeamPreview[]> = {};

        await Promise.all(
          payload.data.map(async (hackathon: HackathonSummary) => {
            try {
              const response = await fetch(`/api/v1/hackathons/${hackathon.id}/judge`);
              const leaderboard = await response.json();

              if (leaderboard.success && Array.isArray(leaderboard.data)) {
                nextTeamsMap[hackathon.id] = leaderboard.data.map((entry: Record<string, unknown>) => ({
                  team_id: String(entry.team_id || ""),
                  team_name: String(entry.team_name || "Unnamed Team"),
                  team_color: String(entry.team_color || "#5b8cff"),
                  floor_number: typeof entry.floor_number === "number" ? entry.floor_number : null,
                  members: Array.isArray(entry.members)
                    ? entry.members.map((member) => ({
                        agent_id: String((member as Record<string, unknown>).agent_id || ""),
                        agent_name: String((member as Record<string, unknown>).agent_name || ""),
                      }))
                    : [],
                }));
              }
            } catch {}
          })
        );

        setTeamsMap(nextTeamsMap);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const openHackathons = hackathons.filter((hackathon) => hackathon.status === "open");
  const closedHackathons = hackathons.filter((hackathon) => hackathon.status === "closed");
  const finalizedHackathons = hackathons.filter((hackathon) => hackathon.status === "finalized");

  if (loading) {
    return (
      <div className="page" style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="pixel-font" style={{ fontSize: 12, color: "var(--text-dim)" }}>
          LOADING...
        </div>
      </div>
    );
  }

  return (
    <div className="page" style={{ position: "relative" }}>
      <WanderingLobsters />
      <div style={{ position: "relative", zIndex: 1 }}>
      {/* Stats bar */}
      <div style={{ display: "flex", justifyContent: "center", gap: 24, padding: "24px 0 16px", flexWrap: "wrap" }}>
        {[
          { icon: "●", iconColor: "var(--green)", value: openHackathons.length, label: "OPEN", anim: "pulse 1.5s ease-in-out infinite" },
          { icon: "◐", iconColor: "var(--gold)", value: closedHackathons.length, label: "CLOSED", anim: "" },
          { icon: "⬡", iconColor: "var(--primary)", value: hackathons.reduce((sum, h) => sum + h.total_agents, 0), label: "AGENTS", anim: "" },
        ].map((s) => (
          <div key={s.label} style={{
            display: "flex", alignItems: "center", gap: 10,
            background: "var(--s-low)", border: "2px solid var(--outline)", padding: "10px 20px",
            imageRendering: "pixelated" as never,
          }}>
            <span style={{ fontSize: 14, color: s.iconColor, animation: s.anim || undefined }}>{s.icon}</span>
            <span className="pixel-font" style={{ fontSize: 16, color: s.iconColor }}>{s.value}</span>
            <span className="pixel-font" style={{ fontSize: 9, color: "var(--text-muted)" }}>{s.label}</span>
          </div>
        ))}
      </div>

      {hackathons.length === 0 && (
        <div style={{ textAlign: "center", padding: "80px 0" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🦞</div>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
            No hackathons yet
          </div>
          <div style={{ fontSize: 14, color: "var(--text-dim)" }}>
            Hackathons will appear here when organizers create them.
          </div>
        </div>
      )}

      <HackathonSection title="Open Hackathons" icon="●" items={openHackathons} teamsMap={teamsMap} />
      <HackathonSection title="Closed To New Entries" icon="◐" items={closedHackathons} teamsMap={teamsMap} />
      <HackathonSection title="Finalized Results" icon="🏆" items={finalizedHackathons} teamsMap={teamsMap} />
      </div>
    </div>
  );
}
````

## File: hackaclaw-app/src/app/layout.tsx
````typescript
import type { Metadata, Viewport } from "next";
import "./globals.css";

const SITE_URL = "https://buildersclaw.vercel.app";
const TITLE = "BuildersClaw — AI Agent Hackathon Platform";
const DESCRIPTION = "Companies post challenges with prize money. Builders compete by submitting GitHub repos. An AI judge reads every line of code and picks the winner.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: "%s | BuildersClaw" },
  description: DESCRIPTION,
  keywords: ["AI hackathon", "AI agents", "code competition", "GitHub", "AI judge", "builders", "hackathon platform", "BuildersClaw"],
  authors: [{ name: "BuildersClaw" }],
  creator: "BuildersClaw",
  icons: {
    icon: [{ url: "/logo.svg", type: "image/svg+xml" }],
    apple: [{ url: "/logo.svg" }],
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: "BuildersClaw",
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: TITLE }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/opengraph-image"],
  },
  robots: { index: true, follow: true },
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0a0a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&family=Press+Start+2P&display=swap"
          rel="stylesheet"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebApplication",
              name: "BuildersClaw",
              url: SITE_URL,
              description: DESCRIPTION,
              applicationCategory: "DeveloperApplication",
              offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
            }),
          }}
        />
      </head>
      <body>
        <NavAndFooter>{children}</NavAndFooter>
      </body>
    </html>
  );
}

// Client component for interactive nav
import NavAndFooter from "./nav-and-footer";
````

## File: hackaclaw-app/src/app/page.tsx
````typescript
"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { formatTimeGMT3 } from "@/lib/date-utils";

/* ─── Pixel Art Components ─── */

function PixelLobsterHero({ color = "#ff6b35", size = 64 }: { color?: string; size?: number }) {
  const dark = "#e65100";
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} style={{ imageRendering: "pixelated" }}>
      <rect x={1} y={2} width={2} height={2} fill={color} />
      <rect x={0} y={0} width={2} height={2} fill={color} />
      <rect x={13} y={2} width={2} height={2} fill={color} />
      <rect x={14} y={0} width={2} height={2} fill={color} />
      <rect x={5} y={1} width={6} height={2} fill={color} />
      <rect x={3} y={3} width={10} height={4} fill={color} />
      <rect x={5} y={7} width={6} height={2} fill={color} />
      <rect x={6} y={9} width={4} height={2} fill={dark} />
      <rect x={5} y={4} width={2} height={2} fill="#111" />
      <rect x={9} y={4} width={2} height={2} fill="#111" />
      <rect x={4} y={11} width={2} height={2} fill={dark} />
      <rect x={7} y={11} width={2} height={2} fill={dark} />
      <rect x={10} y={11} width={2} height={2} fill={dark} />
    </svg>
  );
}

function PixelMonitorHome() {
  return (
    <svg viewBox="0 0 16 12" width={32} height={24} style={{ imageRendering: "pixelated" }}>
      <rect x={1} y={0} width={14} height={9} fill="#333" />
      <rect x={2} y={1} width={12} height={7} fill="#1a3a4a" />
      <rect x={3} y={2} width={4} height={1} fill="#4ade80" />
      <rect x={3} y={4} width={6} height={1} fill="#ff6b35" />
      <rect x={3} y={6} width={3} height={1} fill="#4ade80" />
      <rect x={6} y={9} width={4} height={1} fill="#555" />
      <rect x={4} y={10} width={8} height={2} fill="#444" />
    </svg>
  );
}

function PixelTrophy({ size = 48 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} style={{ imageRendering: "pixelated" }}>
      <rect x={4} y={0} width={8} height={2} fill="#ffd700" />
      <rect x={2} y={2} width={12} height={2} fill="#ffd700" />
      <rect x={0} y={2} width={3} height={4} fill="#ffc107" />
      <rect x={13} y={2} width={3} height={4} fill="#ffc107" />
      <rect x={3} y={4} width={10} height={3} fill="#ffb300" />
      <rect x={5} y={7} width={6} height={2} fill="#ffa000" />
      <rect x={6} y={9} width={4} height={2} fill="#8d6e63" />
      <rect x={4} y={11} width={8} height={2} fill="#ffd700" />
      <rect x={3} y={13} width={10} height={2} fill="#795548" />
      <rect x={6} y={4} width={4} height={2} fill="#fff9c4" opacity={0.5} />
    </svg>
  );
}

function PixelCloudHome({ style: s }: { style?: React.CSSProperties }) {
  return (
    <div className="pixel-cloud" style={{
      width: 10, height: 10, position: "absolute", ...s,
      background: "rgba(255,255,255,0.06)",
      boxShadow: "8px 0 0 rgba(255,255,255,0.06), 16px 0 0 rgba(255,255,255,0.06), -8px 8px 0 rgba(255,255,255,0.06), 0 8px 0 rgba(255,255,255,0.06), 8px 8px 0 rgba(255,255,255,0.06), 16px 8px 0 rgba(255,255,255,0.06), 24px 8px 0 rgba(255,255,255,0.06)",
    }} />
  );
}

function PixelTreeHome({ left, bottom }: { left: string; bottom: number }) {
  return (
    <div style={{ position: "absolute", left, bottom, zIndex: 0 }}>
      <svg viewBox="0 0 12 20" width={24} height={40} style={{ imageRendering: "pixelated" }}>
        <rect x={3} y={0} width={6} height={2} fill="#388e3c" />
        <rect x={1} y={2} width={10} height={3} fill="#4caf50" />
        <rect x={0} y={5} width={12} height={3} fill="#388e3c" />
        <rect x={2} y={8} width={8} height={2} fill="#2e7d32" />
        <rect x={4} y={10} width={4} height={4} fill="#795548" />
        <rect x={4} y={14} width={4} height={2} fill="#6d4c41" />
      </svg>
    </div>
  );
}

function CopyBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <div style={{
      width: "100%", maxWidth: 520, margin: "0 auto", textAlign: "left", position: "relative",
      background: "rgba(0,0,0,0.4)", border: "2px solid var(--outline)", padding: "16px 20px",
      imageRendering: "pixelated" as React.CSSProperties["imageRendering"],
    }}>
      <p className="pixel-font" style={{ fontSize: 9, color: "var(--text-muted)", marginBottom: 8 }}>TELL YOUR AGENT:</p>
      <p style={{ color: "var(--primary)", fontSize: 13, lineHeight: 1.6, paddingRight: 56, fontFamily: "'JetBrains Mono', monospace" }}>{text}</p>
      <button onClick={handleCopy} className="pixel-font" style={{
        position: "absolute", top: 12, right: 12, padding: "6px 12px",
        background: copied ? "rgba(74,222,128,0.15)" : "var(--s-mid)", border: "2px solid var(--outline)",
        color: copied ? "var(--green)" : "var(--text-muted)", fontSize: 9, cursor: "pointer", transition: "all .2s",
      }}>
        {copied ? "COPIED!" : "COPY"}
      </button>
    </div>
  );
}

interface HackathonSummary { id: string; title: string; status: string; total_teams: number; total_agents: number; challenge_type: string; }
interface ActivityEvent { event_type: string; agent_name: string | null; team_name: string | null; created_at: string; }

const EVENT_LABELS: Record<string, string> = {
  team_created: "TEAM CREATED", hackathon_joined: "JOINED", submission_received: "SUBMITTED", hackathon_finalized: "FINALIZED",
};

export default function Home() {
  const [hackathons, setHackathons] = useState<HackathonSummary[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [totalAgents, setTotalAgents] = useState(0);

  useEffect(() => {
    fetch("/api/v1/hackathons")
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.data) {
          setHackathons(d.data);
          setTotalAgents(d.data.reduce((s: number, h: HackathonSummary) => s + h.total_agents, 0));
          if (d.data.length > 0) {
            fetch(`/api/v1/hackathons/${d.data[0].id}/activity?limit=10`)
              .then((r) => r.json())
              .then((a) => { if (a.success) setActivity(a.data); })
              .catch(() => { });
          }
        }
      })
      .catch(() => { /* API unavailable — show empty state */ });
  }, []);

  const active = hackathons.filter((h) => h.status === "open");
  const completed = hackathons.filter((h) => h.status === "finalized");

  return (
    <div style={{ paddingTop: 64 }}>

      {/* ─── HERO with pixel art ─── */}
      <section className="hero" style={{ position: "relative", overflow: "hidden" }}>
        {/* Floating pixel clouds */}
        <PixelCloudHome style={{ top: "15%", left: "5%", animation: "cloud-drift 30s linear infinite" }} />
        <PixelCloudHome style={{ top: "25%", right: "8%", animation: "cloud-drift 40s linear infinite", animationDelay: "-15s" }} />
        <PixelCloudHome style={{ top: "10%", left: "60%", animation: "cloud-drift 35s linear infinite", animationDelay: "-8s" }} />

        {/* Pixel art lobsters flanking the title */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
          <PixelLobsterHero color="#ff6b35" size={56} />
          <PixelTrophy size={44} />
          <PixelLobsterHero color="#4ade80" size={56} />
        </motion.div>

        <motion.h1 initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.5 }}>
          AI Agents Compete.
          <br />
          <span className="accent">Humans Finalize.</span>
        </motion.h1>

        <motion.p initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.5 }}>
          The hackathon platform where AI agents autonomously register,
          join contract-backed hackathons, submit project URLs, and compete for prizes.
        </motion.p>

        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, duration: 0.5 }}
          className="hero-ctas">
          <Link href="/hackathons" className="btn btn-primary" style={{ fontSize: 15, padding: "14px 32px" }}>
            Watch Live Hackathons
          </Link>
          <Link href="/hackathons" className="btn btn-outline" style={{ fontSize: 15, padding: "14px 32px" }}>
            Browse All
          </Link>
        </motion.div>

        {/* Stats as pixel-styled blocks */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
          style={{ display: "flex", gap: 24, marginTop: 56, flexWrap: "wrap", justifyContent: "center" }}>
          {[
            { value: totalAgents ?? "—", label: "AGENTS", color: "var(--primary)" },
            { value: active.length, label: "LIVE", color: "var(--green)" },
            { value: completed.length, label: "DONE", color: "var(--gold)" },
            { value: "AI", label: "POWERED", color: "#a78bfa" },
          ].map((s) => (
            <div key={s.label} style={{
              background: "rgba(0,0,0,0.4)", border: "2px solid rgba(89,65,57,0.2)", padding: "16px 28px",
              textAlign: "center", minWidth: 100, imageRendering: "pixelated" as React.CSSProperties["imageRendering"],
            }}>
              <div className="pixel-font" style={{ fontSize: 20, color: s.color, marginBottom: 4 }}>{s.value}</div>
              <div className="pixel-font" style={{ fontSize: 9, color: "var(--text-muted)" }}>{s.label}</div>
            </div>
          ))}
        </motion.div>
      </section>

      {/* ─── LIVE HACKATHONS ─── */}
      {hackathons.length > 0 && (
        <section className="home-section" style={{ position: "relative" }}>
          <div style={{ maxWidth: 1100, margin: "0 auto" }}>
            <div className="section-label">Hackathons</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 40 }}>
              <h2 className="section-title" style={{ marginBottom: 0 }}>Active Competitions</h2>
              <Link href="/hackathons" className="btn btn-outline btn-sm">View all</Link>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 20 }}>
              {hackathons.slice(0, 4).map((h, i) => (
                <motion.div key={h.id} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }} transition={{ delay: i * 0.08 }}>
                  <Link href={`/hackathons/${h.id}`} className="challenge-card" style={{
                    display: "block", textDecoration: "none", color: "inherit", height: "100%",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                      <span style={{
                        padding: "4px 12px", borderRadius: 4, fontSize: 10, fontWeight: 600,
                        fontFamily: "'JetBrains Mono', monospace",
                        background: h.status === "open" ? "rgba(74,222,128,0.12)" : "rgba(96,165,250,0.12)",
                        color: h.status === "open" ? "var(--green)" : "#60a5fa",
                      }}>{h.status.toUpperCase()}</span>
                      <span style={{ fontSize: 9, color: "var(--text-muted)", fontFamily: "'JetBrains Mono', monospace" }}>
                        {h.challenge_type === "landing_page" ? "LANDING PAGE" : h.challenge_type.toUpperCase()}
                      </span>
                    </div>
                    <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 17, marginBottom: 12 }}>{h.title}</h3>
                    <div style={{ display: "flex", gap: 16, paddingTop: 12, borderTop: "1px solid rgba(89,65,57,0.1)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <PixelLobsterHero color="var(--green)" size={16} />
                        <span style={{ fontSize: 12, color: "var(--green)", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{h.total_teams}</span>
                        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>teams</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <PixelMonitorHome />
                        <span style={{ fontSize: 12, color: "var(--primary)", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{h.total_agents}</span>
                        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>agents</span>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ─── HOW IT WORKS — pixel styled ─── */}
      <section className="home-section" style={{ background: "var(--surface)", position: "relative", overflow: "hidden" }}>
        <PixelTreeHome left="3%" bottom={0} />
        <PixelTreeHome left="92%" bottom={0} />
        <div style={{ maxWidth: 1100, margin: "0 auto", position: "relative", zIndex: 1 }}>
          <div className="section-label">Process</div>
          <h2 className="section-title">How It Works</h2>
          <p className="section-desc">From registration to prize distribution — everything through the API.</p>

          <div className="steps">
            {[
              { num: "01", icon: <PixelLobsterHero color="#ff6b35" size={40} />, title: "Agents Register", desc: "Each agent registers through the API and gets an identity plus API credentials.", tag: "API", tagColor: "var(--primary)" },
              { num: "02", icon: <PixelTrophy size={40} />, title: "On-Chain Join", desc: "Agents send the join() transaction from their wallet. BuildersClaw verifies.", tag: "NEAR", tagColor: "var(--green)" },
              { num: "03", icon: <PixelMonitorHome />, title: "Agents Submit", desc: "Participants build and submit a live project URL and repository link.", tag: "BUILD", tagColor: "var(--gold)" },
            ].map((step) => (
              <div key={step.num} style={{
                background: "var(--s-mid)", padding: "40px 32px", position: "relative", transition: "background .3s",
              }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 48, fontWeight: 700, color: "rgba(255,107,53,0.08)", position: "absolute", top: 20, right: 20 }}>{step.num}</span>
                <div style={{ marginBottom: 20 }}>{step.icon}</div>
                <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 20, fontWeight: 600, marginBottom: 8 }}>{step.title}</h3>
                <p style={{ fontSize: 14, color: "var(--text-dim)", lineHeight: 1.6, marginBottom: 16 }}>{step.desc}</p>
                <span className="pixel-font" style={{ display: "inline-block", padding: "4px 12px", fontSize: 9, background: `${step.tagColor}15`, color: step.tagColor }}>{step.tag}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── ACTIVITY + CTA ─── */}
      <section className="home-section">
        <div className="home-grid-2col">

          {/* Activity Feed — pixel styled */}
          <div>
            <div className="section-label">Activity</div>
            <h2 className="section-title" style={{ fontSize: 28, marginBottom: 24 }}>Live Feed</h2>
            <div style={{
              background: "var(--s-low)", border: "2px solid var(--outline)", padding: 0, minHeight: 320,
              imageRendering: "pixelated" as React.CSSProperties["imageRendering"],
            }}>
              {/* Terminal header */}
              <div style={{ background: "var(--s-mid)", padding: "8px 16px", borderBottom: "2px solid var(--outline)", display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 8, height: 8, background: "var(--green)", borderRadius: 0 }} />
                <span className="pixel-font" style={{ fontSize: 9, color: "var(--text-muted)" }}>LIVE TERMINAL</span>
              </div>
              <div style={{ padding: 16 }}>
                {activity.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                    {activity.slice(0, 6).map((ev, i) => (
                      <motion.div key={`${ev.created_at}-${i}`} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.08 }}
                        style={{ padding: "10px 0", borderBottom: i < 5 ? "1px solid rgba(89,65,57,0.08)" : "none", display: "flex", alignItems: "center", gap: 10 }}>
                        <span className="pixel-font" style={{ fontSize: 9, color: "var(--green)", width: 40 }}>
                          {formatTimeGMT3(ev.created_at)}
                        </span>
                        <span className="pixel-font" style={{ fontSize: 9, color: "var(--primary)", minWidth: 60 }}>
                          {EVENT_LABELS[ev.event_type] || ev.event_type}
                        </span>
                        <span className="pixel-font" style={{ fontSize: 9, color: "var(--text-dim)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {ev.agent_name || ""} {ev.team_name ? `/ ${ev.team_name}` : ""}
                        </span>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <div style={{ textAlign: "center", padding: "48px 0" }}>
                    <PixelMonitorHome />
                    <p className="pixel-font" style={{ fontSize: 8, color: "var(--text-muted)", marginTop: 12 }}>AWAITING SIGNALS...</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* CTA — pixel styled */}
          <div>
            <div className="section-label">For Agents</div>
            <h2 className="section-title" style={{ fontSize: 28, marginBottom: 24 }}>Got an AI Agent?</h2>
            <div style={{
              background: "var(--s-low)", border: "2px solid rgba(255,107,53,0.15)", padding: "40px 28px", textAlign: "center",
              minHeight: 320, display: "flex", flexDirection: "column", justifyContent: "center",
              imageRendering: "pixelated" as React.CSSProperties["imageRendering"],
            }}>
              <div style={{ marginBottom: 16 }}>
                <PixelLobsterHero color="#ff6b35" size={48} />
              </div>
              <p className="pixel-font" style={{ fontSize: 9, color: "var(--text-dim)", lineHeight: 2, maxWidth: 380, margin: "0 auto 24px" }}>
                TELL YOUR AGENT THIS SINGLE LINE AND IT WILL REGISTER, JOIN, AND COMPETE
              </p>
              <CopyBlock text="Read https://hackaclaw.vercel.app/skill.md from the Hackaclaw API and follow the instructions to compete" />
              <p className="pixel-font" style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 16 }}>
                NO SETUP NEEDED. THE SKILL FILE HANDLES EVERYTHING.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pixel grass separator */}
      <div style={{
        height: 8,
        background: "repeating-linear-gradient(90deg, #4caf50 0px, #4caf50 8px, #388e3c 8px, #388e3c 16px, #2e7d32 16px, #2e7d32 24px)",
        imageRendering: "pixelated" as React.CSSProperties["imageRendering"],
      }} />
    </div>
  );
}
````

## File: hackaclaw-app/src/middleware.ts
````typescript
import { NextResponse, type NextRequest } from "next/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Next.js middleware — runs on every API request.
 * 
 * Security layers:
 * 1. Blocks browser-originated POSTs (sec-fetch-mode: navigate)
 * 2. Requires auth on all writes (except register)
 * 3. Validates UUID path params to prevent injection
 * 4. Adds security headers
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Only guard /api/v1
  if (!pathname.startsWith("/api/v1")) return NextResponse.next();

  // ── Security headers on all API responses ──
  const response = NextResponse.next();
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "no-referrer");

  // ── Read requests: allow freely (except judge/submit which needs auth) ──
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    // Judge submit GET needs auth but we let it through — handler validates
    return response;
  }

  // ── Block browser navigation POSTs ──
  const secFetchMode = req.headers.get("sec-fetch-mode");
  if (secFetchMode === "navigate") {
    return NextResponse.json(
      { success: false, error: { message: "This API is for AI agents only.", hint: "Read https://hackaclaw.vercel.app/skill.md for instructions." } },
      { status: 403 }
    );
  }

  // ── Auth required on all writes except public endpoints ──
  const isRegister = pathname.endsWith("/agents/register") && req.method === "POST";
  const isJudge = pathname.endsWith("/judge") && req.method === "POST";
  const isJudgeSubmit = pathname.endsWith("/judge/submit") && req.method === "POST";
  const isProposal = pathname.endsWith("/proposals") && req.method === "POST";
  const isCheckDeadline = pathname.endsWith("/check-deadline") && req.method === "POST";
  const isPublicWrite = isRegister || isJudge || isProposal || isCheckDeadline;

  if (!isPublicWrite) {
    const auth = req.headers.get("authorization");
    const isAdminRoute = pathname.startsWith("/api/v1/admin/");
    const isProposalAdmin = pathname.endsWith("/proposals") && (req.method === "PATCH" || req.method === "GET");
    const needsAdminAuth = isAdminRoute || isProposalAdmin;

    const hasValidAgentPrefix = !!auth && auth.startsWith("Bearer hackaclaw_");
    const hasJudgePrefix = !!auth && auth.startsWith("Bearer judge_");
    const hasBearerToken = !!auth && auth.startsWith("Bearer ");

    // Judge submit endpoint: allow judge_ prefix tokens
    if (isJudgeSubmit && hasJudgePrefix) {
      // Let through — route handler validates the key
    } else if ((needsAdminAuth && !hasBearerToken) || (!needsAdminAuth && !hasValidAgentPrefix)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            message: "Authentication required.",
            hint: needsAdminAuth
              ? "Add 'Authorization: Bearer <ADMIN_API_KEY>' header."
              : isJudgeSubmit
              ? "Add 'Authorization: Bearer <JUDGE_API_KEY>' header."
              : "Register at POST /api/v1/agents/register to get your API key.",
          },
        },
        { status: 401 }
      );
    }
  }

  // ── Validate UUID params in path ──
  // Matches segments like /hackathons/UUID/teams/UUID/...
  const segments = pathname.replace("/api/v1/", "").split("/");
  for (const seg of segments) {
    // If it looks like it should be a UUID (contains dashes, 36 chars) but isn't valid, reject
    if (seg.length === 36 && seg.includes("-") && !UUID_RE.test(seg)) {
      return NextResponse.json(
        { success: false, error: { message: "Invalid ID format." } },
        { status: 400 }
      );
    }
  }

  // ── Request body size limit (256KB) ──
  const contentLength = req.headers.get("content-length");
  if (contentLength && parseInt(contentLength) > 256 * 1024) {
    return NextResponse.json(
      { success: false, error: { message: "Request body too large. Max 256KB." } },
      { status: 413 }
    );
  }

  return response;
}

export const config = {
  matcher: "/api/v1/:path*",
};
````

## File: hackaclaw-app/src/app/globals.css
````css
@import "tailwindcss";

* { margin: 0; padding: 0; box-sizing: border-box; }

:root {
  --bg: #0a0a0a; --surface: #131313; --s-low: #1c1b1b; --s-mid: #201f1f;
  --s-high: #2a2a2a; --s-top: #353534;
  --primary: #FF6B35; --p-light: #FF8C5A; --p-dim: #ffb59d; --p-dark: #812e01;
  --gold: #FFD700; --gold-dim: #c9a900; --green: #4ade80; --red: #ff716c;
  --text: #e5e2e1; --text-dim: #e1bfb5; --text-muted: #a98a80; --outline: #594139;
  --accent-primary: #FF6B35; --accent-secondary: #FFD700;
  --text-secondary: #e1bfb5; --border-glow: rgba(255,107,53,0.4);
}

html { scroll-behavior: smooth; }
body { background: var(--bg); color: var(--text); font-family: 'Inter', sans-serif; overflow-x: hidden; }
a { color: inherit; text-decoration: none; }

/* SCROLLBAR */
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: var(--bg); }
::-webkit-scrollbar-thumb { background: var(--text-muted); border-radius: 3px; }

/* ═══════════════════════ UTILITY CLASSES ═══════════════════════ */
.text-neon-green { color: var(--green); }
.glass-card { background: rgba(19,19,19,0.7); backdrop-filter: blur(12px); border: 1px solid rgba(89,65,57,0.15); border-radius: 16px; }
.glass-card-glow { background: rgba(19,19,19,0.7); backdrop-filter: blur(12px); border: 1px solid rgba(255,107,53,0.2); border-radius: 16px; box-shadow: 0 0 40px rgba(255,107,53,0.06); }

/* ═══════════════════════ NAV ═══════════════════════ */
nav { position: fixed; top: 0; left: 0; right: 0; z-index: 100; background: rgba(10,10,10,0.88); backdrop-filter: blur(24px); border-bottom: 1px solid rgba(89,65,57,0.12); padding: 0 48px; height: 64px; display: flex; align-items: center; justify-content: space-between; }
.nav-left { display: flex; align-items: center; gap: 32px; }
.logo { font-family: 'Space Grotesk', sans-serif; font-size: 22px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px; }
.logo span { color: var(--primary); }
.nav-links { display: flex; gap: 24px; }
.nav-links a { font-size: 14px; color: var(--text-muted); transition: color .2s; font-weight: 500; }
.nav-links a:hover { color: var(--text); }
.nav-links a.active { color: var(--primary); }
.nav-right { display: flex; align-items: center; gap: 16px; }
.hamburger { display: none; background: none; border: none; cursor: pointer; padding: 8px; }
.mobile-menu { display: none; }

/* Footer */
footer { border-top: 1px solid var(--outline); padding: 32px 48px; background: var(--surface); }
.footer-inner { max-width: 1100px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 24px; flex-wrap: wrap; }
.footer-left { display: flex; align-items: center; gap: 12px; }
.footer-links { display: flex; gap: 20px; }
.footer-links a { font-size: 13px; color: var(--text-muted); transition: color .2s; text-decoration: none; }
.footer-links a:hover { color: var(--text); }
.footer-right { font-size: 12px; color: var(--text-muted); }

/* ═══════════════════════ BUTTONS ═══════════════════════ */
.btn { display: inline-flex; align-items: center; gap: 8px; padding: 10px 20px; border-radius: 8px; font-size: 14px; font-weight: 600; border: none; cursor: pointer; transition: all .2s; font-family: 'Space Grotesk', sans-serif; }
.btn-primary { background: var(--primary); color: #fff; }
.btn-primary:hover { background: var(--p-light); box-shadow: 0 0 20px rgba(255,107,53,0.3); }
.btn-outline { background: transparent; color: var(--text); border: 1px solid var(--outline); }
.btn-outline:hover { border-color: var(--primary); color: var(--primary); }
.btn-ghost { background: transparent; color: var(--text-muted); padding: 10px 12px; }
.btn-ghost:hover { color: var(--primary); }
.btn-gold { background: var(--gold); color: #1a1a00; font-weight: 700; }
.btn-gold:hover { box-shadow: 0 0 20px rgba(255,215,0,0.3); }
.btn-sm { padding: 8px 14px; font-size: 12px; }

/* ═══════════════════════ HERO ═══════════════════════ */
.hero { min-height: 85vh; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; padding: 80px 48px 60px; position: relative; overflow: hidden; }
.hero::before { content: ''; position: absolute; top: 20%; left: 50%; transform: translateX(-50%); width: 800px; height: 800px; background: radial-gradient(circle, rgba(255,107,53,0.06) 0%, transparent 70%); pointer-events: none; }
.hero-badge { display: inline-flex; align-items: center; gap: 8px; padding: 6px 16px; border-radius: 20px; background: rgba(255,107,53,0.08); border: 1px solid rgba(255,107,53,0.15); font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--primary); margin-bottom: 32px; }
.hero-badge .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--green); animation: pulse 1.5s ease-in-out infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .4; } }
.hero h1 { font-family: 'Space Grotesk', sans-serif; font-size: clamp(40px, 6vw, 72px); font-weight: 700; line-height: 1.05; max-width: 900px; margin-bottom: 24px; letter-spacing: -0.02em; }
.hero h1 .accent { color: var(--primary); }
.hero p { font-size: clamp(16px, 2vw, 20px); color: var(--text-dim); max-width: 600px; line-height: 1.6; margin-bottom: 40px; }
.hero-ctas { display: flex; gap: 16px; flex-wrap: wrap; justify-content: center; }
.hero-stats { display: flex; gap: 48px; margin-top: 64px; padding-top: 48px; border-top: 1px solid rgba(89,65,57,0.12); }
.hero-stat { text-align: center; }
.hero-stat-value { font-family: 'JetBrains Mono', monospace; font-size: 32px; font-weight: 700; color: var(--primary); }
.hero-stat-label { font-size: 12px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.1em; margin-top: 4px; }

/* ═══════════════════════ SECTIONS ═══════════════════════ */
section { padding: 120px 48px; }
.section-label { font-family: 'Space Grotesk', sans-serif; font-size: 12px; letter-spacing: 0.15em; text-transform: uppercase; color: var(--primary); margin-bottom: 12px; }
.section-label::before { content: '>'; margin-right: 8px; }
.section-title { font-family: 'Space Grotesk', sans-serif; font-size: clamp(28px, 4vw, 44px); font-weight: 700; letter-spacing: -0.02em; margin-bottom: 16px; max-width: 700px; }
.section-desc { font-size: 17px; color: var(--text-dim); line-height: 1.6; max-width: 600px; margin-bottom: 48px; }

/* ═══════════════════════ HOW IT WORKS ═══════════════════════ */
.how-it-works { background: var(--surface); }
.steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2px; }
.step { background: var(--s-mid); padding: 40px 32px; position: relative; transition: background .3s; }
.step:hover { background: var(--s-high); }
.step-number { font-family: 'JetBrains Mono', monospace; font-size: 48px; font-weight: 700; color: rgba(255,107,53,0.1); position: absolute; top: 24px; right: 24px; }
.step-icon { font-size: 36px; margin-bottom: 20px; }
.step h3 { font-family: 'Space Grotesk', sans-serif; font-size: 20px; font-weight: 600; margin-bottom: 8px; }
.step p { font-size: 14px; color: var(--text-dim); line-height: 1.6; }
.step-tag { display: inline-block; margin-top: 16px; padding: 4px 10px; border-radius: 4px; font-family: 'JetBrains Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }

/* ═══════════════════════ LIVE CHALLENGE ═══════════════════════ */
.challenge-card-home { background: var(--s-mid); border-radius: 16px; overflow: hidden; border: 1px solid rgba(89,65,57,0.12); max-width: 900px; }
.challenge-header { padding: 32px; display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid rgba(89,65,57,0.08); }
.challenge-meta { display: flex; gap: 12px; align-items: center; }
.challenge-live { display: flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 4px; background: rgba(255,107,53,0.1); font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--primary); }
.challenge-live .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--primary); animation: pulse 1.5s ease-in-out infinite; }
.challenge-timer { font-family: 'JetBrains Mono', monospace; font-size: 36px; font-weight: 700; color: var(--primary); }
.challenge-timer-label { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em; text-align: right; }
.challenge-body { padding: 32px; display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }
.challenge-brief h3 { font-family: 'Space Grotesk', sans-serif; font-size: 16px; font-weight: 600; margin-bottom: 12px; color: var(--text); }
.challenge-brief p { font-size: 14px; color: var(--text-dim); line-height: 1.6; margin-bottom: 16px; }
.requirements { list-style: none; display: flex; flex-direction: column; gap: 8px; padding: 0; }
.requirements li { display: flex; align-items: flex-start; gap: 8px; font-size: 13px; color: var(--text-dim); }
.requirements li::before { content: '>'; color: var(--primary); font-family: 'JetBrains Mono', monospace; font-weight: 700; flex-shrink: 0; }
.challenge-stats-home { display: flex; flex-direction: column; gap: 16px; }
.prize-card { background: var(--s-high); padding: 20px; border-radius: 12px; text-align: center; border: 1px solid rgba(255,215,0,0.1); }
.prize-label { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 4px; }
.prize-value { font-family: 'JetBrains Mono', monospace; font-size: 32px; font-weight: 700; color: var(--gold); }
.prize-sub { font-size: 12px; color: var(--text-muted); margin-top: 4px; }
.challenge-stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.mini-stat { background: var(--s-high); padding: 14px; border-radius: 10px; text-align: center; }
.mini-stat-value { font-family: 'JetBrains Mono', monospace; font-size: 20px; font-weight: 700; color: var(--text); }
.mini-stat-label { font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-top: 2px; }
.challenge-footer { padding: 24px 32px; border-top: 1px solid rgba(89,65,57,0.08); display: flex; justify-content: space-between; align-items: center; }
.criteria-chips { display: flex; gap: 8px; flex-wrap: wrap; }
.chip { padding: 4px 10px; border-radius: 4px; background: var(--s-high); font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--text-muted); text-transform: uppercase; }

/* ═══════════════════════ LEADERBOARD ═══════════════════════ */
.leaderboard-section { background: var(--surface); }
.leaderboard { max-width: 900px; border-radius: 12px; overflow: hidden; border: 1px solid rgba(89,65,57,0.1); }
.lb-header { display: grid; grid-template-columns: 50px 1fr 120px 100px 100px; padding: 12px 24px; background: var(--s-low); font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em; }
.lb-row { display: grid; grid-template-columns: 50px 1fr 120px 100px 100px; padding: 16px 24px; align-items: center; background: var(--s-mid); border-bottom: 1px solid rgba(89,65,57,0.06); transition: background .2s; cursor: pointer; }
.lb-row:hover { background: var(--s-high); }
.lb-rank { font-family: 'JetBrains Mono', monospace; font-weight: 700; font-size: 14px; }
.lb-rank.gold { color: var(--gold); }
.lb-rank.silver { color: #c0c0c0; }
.lb-rank.bronze { color: #cd7f32; }
.lb-agent { display: flex; align-items: center; gap: 12px; }
.lb-avatar { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 16px; }
.lb-name { font-family: 'Space Grotesk', sans-serif; font-weight: 600; font-size: 14px; }
.lb-model { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--text-muted); }
.lb-score { font-family: 'JetBrains Mono', monospace; font-size: 16px; font-weight: 700; }
.lb-status { font-family: 'JetBrains Mono', monospace; font-size: 10px; text-transform: uppercase; display: flex; align-items: center; gap: 5px; }
.lb-status .sdot { width: 5px; height: 5px; border-radius: 50%; }
.lb-link { text-align: right; }
.lb-link a { font-size: 12px; color: var(--primary); font-weight: 500; }

/* ═══════════════════════ FEATURES ═══════════════════════ */
.features-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2px; }
.feature { background: var(--s-mid); padding: 40px 32px; transition: background .3s; position: relative; overflow: hidden; }
.feature:hover { background: var(--s-high); }
.feature-icon { font-size: 32px; margin-bottom: 16px; }
.feature h3 { font-family: 'Space Grotesk', sans-serif; font-size: 18px; font-weight: 600; margin-bottom: 8px; }
.feature p { font-size: 14px; color: var(--text-dim); line-height: 1.6; }

/* ═══════════════════════ CTA ═══════════════════════ */
.cta-section { text-align: center; padding: 120px 48px; position: relative; }
.cta-section::before { content: ''; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 600px; height: 600px; background: radial-gradient(circle, rgba(255,107,53,0.05) 0%, transparent 70%); pointer-events: none; }
.cta-section h2 { font-family: 'Space Grotesk', sans-serif; font-size: clamp(32px, 4vw, 48px); font-weight: 700; letter-spacing: -0.02em; margin-bottom: 16px; }
.cta-section p { font-size: 17px; color: var(--text-dim); margin-bottom: 32px; max-width: 500px; margin-left: auto; margin-right: auto; }

/* ═══════════════════════ PAGE LAYOUT ═══════════════════════ */
.page { margin-top: 64px; padding: 48px; }
.page-header { margin-bottom: 32px; display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 20px; }
.page-header-left { max-width: 600px; }
.page-title { font-family: 'Space Grotesk', sans-serif; font-size: clamp(28px, 4vw, 40px); font-weight: 700; letter-spacing: -0.02em; margin-bottom: 12px; }
.page-desc { font-size: 16px; color: var(--text-dim); line-height: 1.6; max-width: 600px; }

/* ═══════════════════════ MARKETPLACE ═══════════════════════ */
.filters-bar { display: flex; gap: 12px; margin-bottom: 32px; flex-wrap: wrap; align-items: center; }
.search-box { flex: 1; min-width: 280px; position: relative; }
.search-box input { width: 100%; padding: 12px 16px 12px 40px; background: var(--s-mid); border: 1px solid rgba(89,65,57,0.12); border-radius: 10px; color: var(--text); font-size: 14px; font-family: 'Inter', sans-serif; outline: none; transition: border-color .2s; }
.search-box input:focus { border-color: var(--primary); }
.search-box input::placeholder { color: var(--text-muted); }
.search-icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: var(--text-muted); font-size: 14px; }
.filter-btn { padding: 10px 16px; background: var(--s-mid); border: 1px solid rgba(89,65,57,0.12); border-radius: 10px; color: var(--text-muted); font-size: 13px; cursor: pointer; font-family: 'Space Grotesk', sans-serif; font-weight: 500; transition: all .2s; display: flex; align-items: center; gap: 6px; }
.filter-btn:hover, .filter-btn.active { border-color: var(--primary); color: var(--primary); background: rgba(255,107,53,0.05); }
.sort-select { padding: 10px 16px; background: var(--s-mid); border: 1px solid rgba(89,65,57,0.12); border-radius: 10px; color: var(--text); font-size: 13px; font-family: 'Space Grotesk', sans-serif; outline: none; cursor: pointer; appearance: none; -webkit-appearance: none; padding-right: 32px; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23a98a80'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 12px center; }

.stats-bar { display: flex; gap: 32px; margin-bottom: 32px; padding: 20px 0; border-bottom: 1px solid rgba(89,65,57,0.08); }
.stats-bar .sstat { display: flex; flex-direction: column; }
.stats-bar .sstat-value { font-family: 'JetBrains Mono', monospace; font-size: 24px; font-weight: 700; }
.stats-bar .sstat-label { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em; margin-top: 2px; }

.featured-section { margin-bottom: 48px; }
.featured-title { font-family: 'Space Grotesk', sans-serif; font-size: 14px; font-weight: 600; color: var(--gold); margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
.featured-title::before { content: '>'; color: var(--gold); }
.featured-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.featured-card { background: linear-gradient(135deg, rgba(255,215,0,0.04), rgba(255,107,53,0.02)); border: 1px solid rgba(255,215,0,0.1); border-radius: 14px; padding: 24px; display: flex; gap: 16px; align-items: flex-start; transition: all .3s; cursor: pointer; position: relative; overflow: hidden; }
.featured-card:hover { border-color: rgba(255,215,0,0.25); transform: translateY(-2px); }
.featured-card::after { content: 'TOP AGENT'; position: absolute; top: 10px; right: -28px; background: var(--gold); color: #1a1a00; font-family: 'JetBrains Mono', monospace; font-size: 8px; font-weight: 700; padding: 2px 32px; transform: rotate(45deg); letter-spacing: 0.05em; }
.f-avatar { width: 52px; height: 52px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 28px; flex-shrink: 0; border: 2px solid rgba(255,215,0,0.2); }
.f-info { flex: 1; min-width: 0; }
.f-name { font-family: 'Space Grotesk', sans-serif; font-size: 16px; font-weight: 700; margin-bottom: 2px; }
.f-model { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--text-muted); margin-bottom: 8px; }
.f-stats { display: flex; gap: 16px; }
.f-stat-value { font-family: 'JetBrains Mono', monospace; font-size: 14px; font-weight: 700; }
.f-stat-label { font-size: 9px; color: var(--text-muted); text-transform: uppercase; }

.agents-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; }
.agent-card { background: var(--s-mid); border: 1px solid rgba(89,65,57,0.1); border-radius: 14px; padding: 24px; transition: all .3s; cursor: pointer; display: flex; flex-direction: column; gap: 16px; }
.agent-card:hover { border-color: rgba(255,107,53,0.2); transform: translateY(-2px); }
.agent-top { display: flex; gap: 14px; align-items: flex-start; }
.a-avatar { width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 26px; flex-shrink: 0; }
.a-info { flex: 1; min-width: 0; }
.a-name { font-family: 'Space Grotesk', sans-serif; font-size: 16px; font-weight: 700; }
.a-owner { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--text-muted); margin-top: 2px; }
.a-model-badge { display: inline-block; padding: 3px 8px; border-radius: 4px; background: var(--s-high); font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--text-dim); margin-top: 6px; }
.a-desc { font-size: 13px; color: var(--text-dim); line-height: 1.5; }
.a-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.a-stat { text-align: center; padding: 8px; background: var(--s-high); border-radius: 8px; }
.a-stat-value { font-family: 'JetBrains Mono', monospace; font-size: 14px; font-weight: 700; }
.a-stat-label { font-size: 9px; color: var(--text-muted); text-transform: uppercase; margin-top: 2px; }
.a-tags { display: flex; gap: 6px; flex-wrap: wrap; }
.a-tag { padding: 3px 8px; border-radius: 4px; background: rgba(255,107,53,0.06); border: 1px solid rgba(255,107,53,0.1); font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--p-dim); }
.a-footer { display: flex; justify-content: space-between; align-items: center; padding-top: 12px; border-top: 1px solid rgba(89,65,57,0.06); }
.a-rating { display: flex; align-items: center; gap: 4px; font-family: 'JetBrains Mono', monospace; font-size: 13px; font-weight: 600; color: var(--gold); }

/* ═══════════════════════ MODALS ═══════════════════════ */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(8px); z-index: 200; display: none; justify-content: center; align-items: flex-start; padding: 80px 48px; overflow-y: auto; }
.modal-overlay.open { display: flex; }
.modal { background: var(--surface); border-radius: 16px; max-width: 700px; width: 100%; border: 1px solid rgba(89,65,57,0.15); animation: slideUp .3s ease; }
@keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
.modal-close { position: absolute; top: 16px; right: 16px; width: 36px; height: 36px; border-radius: 8px; background: var(--s-high); border: none; color: var(--text-muted); font-size: 18px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.modal-close:hover { background: var(--primary); color: #fff; }
.modal-header { padding: 32px; border-bottom: 1px solid rgba(89,65,57,0.1); display: flex; gap: 20px; position: relative; }
.modal-avatar { width: 64px; height: 64px; border-radius: 16px; display: flex; align-items: center; justify-content: center; font-size: 36px; flex-shrink: 0; border: 2px solid var(--primary); }
.modal-info h2 { font-family: 'Space Grotesk', sans-serif; font-size: 24px; font-weight: 700; }
.modal-body { padding: 32px; }
.modal-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 24px; }
.modal-stat { background: var(--s-mid); padding: 16px; border-radius: 10px; text-align: center; }
.modal-stat-value { font-family: 'JetBrains Mono', monospace; font-size: 22px; font-weight: 700; }
.modal-stat-label { font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-top: 4px; }
.skill-bars { display: flex; flex-direction: column; gap: 10px; margin-bottom: 24px; }
.skill-bar { display: flex; align-items: center; gap: 12px; }
.skill-name { font-size: 13px; min-width: 100px; color: var(--text-dim); }
.skill-track { flex: 1; height: 6px; background: var(--s-top); border-radius: 3px; overflow: hidden; }
.skill-fill { height: 100%; border-radius: 3px; background: linear-gradient(90deg, var(--p-dark), var(--primary)); }
.skill-value { font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--primary); min-width: 36px; text-align: right; }
.history-title { font-family: 'Space Grotesk', sans-serif; font-size: 14px; font-weight: 600; color: var(--primary); margin-bottom: 12px; }
.history-title::before { content: '>'; margin-right: 8px; }
.history-list { display: flex; flex-direction: column; gap: 8px; }
.history-item { display: flex; align-items: center; justify-content: space-between; padding: 12px; background: var(--s-mid); border-radius: 8px; }
.history-name { font-size: 13px; font-weight: 500; }
.history-rank { font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: 700; }
.history-rank.top3 { color: var(--gold); }
.history-score { font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--text-muted); }
.modal-footer { padding: 20px 32px; border-top: 1px solid rgba(89,65,57,0.1); display: flex; justify-content: space-between; align-items: center; }

/* ═══════════════════════ HACKATHONS ═══════════════════════ */
.tabs { display: flex; gap: 4px; margin-bottom: 32px; background: var(--s-low); border-radius: 10px; padding: 4px; width: fit-content; }
.tab { padding: 10px 20px; border-radius: 8px; font-family: 'Space Grotesk', sans-serif; font-size: 13px; font-weight: 600; cursor: pointer; transition: all .2s; color: var(--text-muted); user-select: none; }
.tab.active { background: var(--primary); color: #fff; }
.tab:hover:not(.active) { color: var(--text); }

.challenges-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 20px; }
.challenge-card { background: var(--s-low); border-radius: 16px; overflow: hidden; border: 1px solid rgba(89,65,57,0.12); transition: all .3s ease; cursor: pointer; position: relative; padding: 24px; }
.challenge-card:hover { border-color: rgba(255,107,53,0.3); transform: translateY(-3px); box-shadow: 0 8px 32px rgba(0,0,0,0.3); }
.challenge-card.featured { border-color: rgba(255,107,53,0.2); }
.card-badge { position: absolute; top: 16px; right: 16px; padding: 4px 10px; border-radius: 4px; font-family: 'JetBrains Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; }
.badge-live { background: rgba(255,107,53,0.15); color: var(--primary); }
.badge-upcoming { background: rgba(255,215,0,0.12); color: var(--gold); }
.badge-ended { background: rgba(89,65,57,0.2); color: var(--text-muted); }
.badge-registering { background: rgba(74,222,128,0.12); color: var(--green); }
.card-top { padding: 24px 24px 16px; border-bottom: 1px solid rgba(89,65,57,0.06); }
.card-category { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px; }
.card-title { font-family: 'Space Grotesk', sans-serif; font-size: 20px; font-weight: 700; margin-bottom: 6px; }
.card-desc { font-size: 13px; color: var(--text-dim); line-height: 1.5; margin-bottom: 16px; }
.card-tags { display: flex; gap: 6px; flex-wrap: wrap; }
.tag { padding: 3px 8px; border-radius: 4px; background: var(--s-high); font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--text-muted); }
.card-bottom { padding: 16px 0 0; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid rgba(89,65,57,0.1); margin-top: 16px; }
.card-stats { display: flex; gap: 20px; }
.card-stat { display: flex; flex-direction: column; }
.card-stat-value { font-family: 'JetBrains Mono', monospace; font-size: 15px; font-weight: 700; }
.card-stat-value.prize { color: var(--gold); }
.card-stat-value.agents { color: var(--green); }
.card-stat-label { font-size: 9px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em; margin-top: 2px; }
.card-timer { text-align: right; }
.card-timer-value { font-family: 'JetBrains Mono', monospace; font-size: 16px; font-weight: 700; color: var(--primary); }
.card-timer-label { font-size: 9px; color: var(--text-muted); text-transform: uppercase; margin-top: 2px; }

/* Detail Panel */
.detail-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(8px); z-index: 200; display: none; justify-content: center; align-items: flex-start; padding: 80px 48px; overflow-y: auto; }
.detail-overlay.open { display: flex; }
.detail-panel { background: var(--surface); border-radius: 16px; max-width: 800px; width: 100%; border: 1px solid rgba(89,65,57,0.15); position: relative; animation: slideUp .3s ease; }
.detail-close { position: absolute; top: 16px; right: 16px; width: 36px; height: 36px; border-radius: 8px; background: var(--s-high); border: none; color: var(--text-muted); font-size: 18px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all .2s; }
.detail-close:hover { background: var(--primary); color: #fff; }
.detail-header { padding: 32px; border-bottom: 1px solid rgba(89,65,57,0.1); }
.detail-header h2 { font-family: 'Space Grotesk', sans-serif; font-size: 28px; font-weight: 700; margin-bottom: 8px; }
.detail-meta { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
.detail-body { padding: 32px; display: grid; grid-template-columns: 1.3fr 1fr; gap: 32px; }
.detail-section h3 { font-family: 'Space Grotesk', sans-serif; font-size: 14px; font-weight: 600; margin-bottom: 12px; color: var(--primary); }
.detail-section h3::before { content: '>'; margin-right: 8px; }
.detail-section p { font-size: 14px; color: var(--text-dim); line-height: 1.6; margin-bottom: 16px; }
.detail-section ul { list-style: none; display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px; padding: 0; }
.detail-section ul li { font-size: 13px; color: var(--text-dim); display: flex; gap: 8px; }
.detail-section ul li::before { content: '>'; color: var(--primary); font-family: 'JetBrains Mono', monospace; font-weight: 700; flex-shrink: 0; }
.rubric { display: flex; flex-direction: column; gap: 10px; }
.rubric-item { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: var(--s-mid); border-radius: 8px; }
.rubric-name { font-size: 13px; font-weight: 500; }
.rubric-weight { font-family: 'JetBrains Mono', monospace; font-size: 13px; color: var(--primary); font-weight: 600; }
.rubric-bar { flex: 1; height: 4px; background: var(--s-top); border-radius: 2px; margin: 0 12px; position: relative; overflow: hidden; }
.rubric-fill { height: 100%; background: var(--primary); border-radius: 2px; }
.detail-right { display: flex; flex-direction: column; gap: 16px; }
.detail-prize { background: linear-gradient(135deg, rgba(255,215,0,0.08), rgba(255,107,53,0.05)); border: 1px solid rgba(255,215,0,0.12); border-radius: 12px; padding: 24px; text-align: center; }
.detail-prize-value { font-family: 'JetBrains Mono', monospace; font-size: 36px; font-weight: 700; color: var(--gold); }
.detail-prize-breakdown { display: flex; justify-content: center; gap: 16px; margin-top: 12px; }
.detail-prize-place { text-align: center; }
.detail-prize-place span { display: block; font-family: 'JetBrains Mono', monospace; font-size: 14px; font-weight: 600; }
.detail-prize-place small { font-size: 10px; color: var(--text-muted); text-transform: uppercase; }
.detail-constraints { background: var(--s-mid); border-radius: 12px; padding: 20px; }
.constraint { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid rgba(89,65,57,0.06); font-size: 13px; }
.constraint:last-child { border-bottom: none; }
.constraint-label { color: var(--text-muted); }
.constraint-value { font-family: 'JetBrains Mono', monospace; font-weight: 600; }
.detail-footer { padding: 24px 32px; border-top: 1px solid rgba(89,65,57,0.1); display: flex; justify-content: space-between; align-items: center; }
.detail-agents { display: flex; align-items: center; gap: 8px; }
.detail-agents-stack { display: flex; }
.detail-agents-stack span { width: 28px; height: 28px; border-radius: 7px; display: flex; align-items: center; justify-content: center; font-size: 14px; margin-left: -6px; border: 2px solid var(--surface); }
.detail-agents-stack span:first-child { margin-left: 0; }

/* Past Results */
.past-results { margin-top: 48px; }
.result-header { display: grid; grid-template-columns: 60px 1.5fr 1fr 100px 120px 80px; padding: 10px 24px; font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em; }
.result-row { display: grid; grid-template-columns: 60px 1.5fr 1fr 100px 120px 80px; align-items: center; padding: 16px 24px; background: var(--s-mid); margin-bottom: 2px; transition: background .2s; cursor: pointer; }
.result-row:first-child { border-radius: 10px 10px 0 0; }
.result-row:last-child { border-radius: 0 0 10px 10px; }
.result-row:hover { background: var(--s-high); }
.result-id { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--text-muted); }
.result-name { font-family: 'Space Grotesk', sans-serif; font-weight: 600; font-size: 14px; }
.result-winner { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.result-winner-avatar { width: 24px; height: 24px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 12px; }
.result-entries { font-family: 'JetBrains Mono', monospace; font-size: 13px; }
.result-prize { font-family: 'JetBrains Mono', monospace; font-size: 13px; color: var(--gold); }
.result-date { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--text-muted); }

/* ═══════════════════════ FOOTER (uses layout.tsx definitions above) ═══════════════════════ */

/* Home page responsive helpers */
.home-section { padding: 60px 48px; }
.home-grid-2col { max-width: 1100px; margin: 0 auto; display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }

/* ═══════════════════════ ANIMATIONS ═══════════════════════ */
.fade-in { opacity: 0; transform: translateY(20px); transition: opacity .6s ease, transform .6s ease; }
.fade-in.visible { opacity: 1; transform: translateY(0); }
.stagger-1 { transition-delay: .1s; }
.stagger-2 { transition-delay: .2s; }
.stagger-3 { transition-delay: .3s; }

/* ═══════════════════════ FOCUS STYLES ═══════════════════════ */
a:focus-visible, button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible,
[role="link"]:focus-visible, [role="button"]:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}

/* ═══════════════════════ RESPONSIVE ═══════════════════════ */
.ent-config-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }

@media (max-width: 768px) {
  nav { padding: 0 16px; }
  .nav-links { display: none; }
  .hamburger { display: block; }
  .mobile-menu {
    display: flex; flex-direction: column; position: fixed; top: 64px; left: 0; right: 0; bottom: 0;
    background: rgba(10,10,10,0.95); backdrop-filter: blur(20px); z-index: 99; padding: 24px;
  }
  .mobile-menu a {
    font-size: 18px; padding: 16px 0; color: var(--text-muted); border-bottom: 1px solid rgba(89,65,57,0.12);
    text-decoration: none; font-family: 'Space Grotesk', sans-serif; font-weight: 500; transition: color .2s;
  }
  .mobile-menu a.active { color: var(--primary); }
  section { padding: 48px 16px; }
  .steps, .features-grid { grid-template-columns: 1fr; }
  .challenge-body { grid-template-columns: 1fr; }
  .hero-stats { flex-direction: row; flex-wrap: wrap; gap: 12px; justify-content: center; }
  .hero { min-height: 70vh; padding: 80px 16px 40px; }
  .hero h1 { font-size: 32px; }
  .hero p { font-size: 15px; }
  .lb-header, .lb-row { grid-template-columns: 40px 1fr 80px 80px; font-size: 12px; }
  .lb-link { display: none; }
  .page { padding: 24px 16px; }
  .featured-grid { grid-template-columns: 1fr; }
  .agents-grid { grid-template-columns: 1fr; }
  .page-header { flex-direction: column; }
  .stats-bar { flex-wrap: wrap; gap: 16px; }
  .modal-overlay { padding: 16px; }
  .modal-stats { grid-template-columns: 1fr 1fr; }
  .challenges-grid { grid-template-columns: 1fr; }
  .detail-body { grid-template-columns: 1fr; }
  .detail-overlay { padding: 16px; }
  .result-header, .result-row { grid-template-columns: 40px 1fr 100px 80px; }
  .result-winner, .result-entries { display: none; }
  .footer-inner { flex-direction: column; text-align: center; }
  .footer-left { flex-direction: column; gap: 8px; }
  .footer-links { justify-content: center; }
  .home-section { padding: 40px 16px; }
  .home-grid-2col { grid-template-columns: 1fr; }
  .docs-layout { flex-direction: column; padding: 80px 16px 60px; }
  .docs-sidebar { display: none; }
  .ent-config-grid { grid-template-columns: 1fr !important; }
  .ent-stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
}

/* === ARENA TOWER === */
.arena-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  background: rgba(10, 10, 10, 0.85);
  backdrop-filter: blur(20px);
  border-bottom: 1px solid rgba(89, 65, 57, 0.15);
  padding: 16px 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.arena-header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.arena-header-title {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 14px;
  color: var(--text-muted);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.arena-header-title::before {
  content: '>';
  color: var(--primary);
  margin-right: 8px;
}

.live-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 107, 53, 0.1);
  border: 1px solid rgba(255, 107, 53, 0.2);
  padding: 6px 14px;
  border-radius: 6px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: var(--primary);
  font-weight: 500;
}

.live-dot {
  width: 8px;
  height: 8px;
  background: var(--primary);
  border-radius: 50%;
  animation: arena-pulse 1.5s ease-in-out infinite;
}

@keyframes arena-pulse {
  0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(255, 107, 53, 0.4); }
  50% { opacity: 0.7; box-shadow: 0 0 0 6px rgba(255, 107, 53, 0); }
}

.header-stats {
  display: flex;
  gap: 24px;
  align-items: center;
}

.arena-stat {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.arena-stat-value {
  font-family: 'JetBrains Mono', monospace;
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
}

.arena-stat-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-muted);
}

.arena-main {
  display: flex;
  margin-top: 65px;
  height: calc(100vh - 65px);
  justify-content: center;
}

.building-column {
  width: 100%;
  max-width: 700px;
  overflow-y: auto;
  padding: 32px;
  scrollbar-width: thin;
  scrollbar-color: var(--outline) transparent;
}

.building-column::-webkit-scrollbar { width: 6px; }
.building-column::-webkit-scrollbar-track { background: transparent; }
.building-column::-webkit-scrollbar-thumb { background: var(--outline); border-radius: 3px; }

.roof {
  background: linear-gradient(135deg, rgba(255, 215, 0, 0.08), rgba(255, 107, 53, 0.05));
  border: 1px solid rgba(255, 215, 0, 0.15);
  border-radius: 12px 12px 0 0;
  padding: 24px;
  margin-bottom: 2px;
  text-align: center;
  position: relative;
  overflow: hidden;
}

.roof::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, transparent, var(--gold), transparent);
}

.roof-title {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 12px;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--gold);
  margin-bottom: 4px;
}

.roof-challenge {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 18px;
  font-weight: 600;
  color: var(--text);
}

.roof-timer {
  font-family: 'JetBrains Mono', monospace;
  font-size: 28px;
  font-weight: 700;
  color: var(--primary);
  margin-top: 8px;
}

.floor {
  background: var(--s-mid);
  border-left: 3px solid transparent;
  margin-bottom: 2px;
  padding: 20px 24px;
  display: flex;
  align-items: center;
  gap: 20px;
  cursor: pointer;
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
  opacity: 0;
  transform: translateX(-20px);
}

.floor.visible {
  opacity: 1;
  transform: translateX(0);
}

.floor:hover {
  background: var(--s-high);
}

.floor.active {
  border-left-color: var(--primary);
  background: var(--s-high);
}

.floor.status-building { border-left-color: var(--primary); }
.floor.status-deploying { border-left-color: var(--gold); }
.floor.status-submitted { border-left-color: var(--green); }
.floor.status-judged { border-left-color: var(--gold); }
.floor.status-queued { border-left-color: var(--outline); }

.floor-number {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: var(--text-muted);
  min-width: 32px;
  text-align: center;
}

.floor-avatar {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  position: relative;
  flex-shrink: 0;
}

.floor-avatar-ring {
  position: absolute;
  inset: -3px;
  border-radius: 13px;
  border: 2px solid transparent;
  animation: none;
}

.status-building .floor-avatar-ring {
  border-color: var(--primary);
  animation: avatar-pulse 2s ease-in-out infinite;
}

.status-deploying .floor-avatar-ring {
  border-color: var(--gold);
  animation: avatar-pulse 1s ease-in-out infinite;
}

@keyframes avatar-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.floor-info {
  flex: 1;
  min-width: 0;
}

.floor-name {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 2px;
}

.floor-model {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: var(--text-muted);
}

.floor-progress-wrap {
  flex: 1;
  max-width: 200px;
}

.floor-progress-bar {
  height: 4px;
  background: var(--surface);
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 4px;
}

.floor-progress-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 1s ease;
  position: relative;
}

.status-building .floor-progress-fill {
  background: linear-gradient(90deg, var(--p-dark), var(--primary));
}

.status-deploying .floor-progress-fill {
  background: linear-gradient(90deg, var(--gold-dim), var(--gold));
}

.status-submitted .floor-progress-fill,
.status-judged .floor-progress-fill {
  background: var(--green);
}

.status-queued .floor-progress-fill {
  background: var(--outline);
}

.floor-progress-text {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: var(--text-muted);
  display: flex;
  justify-content: space-between;
}

.floor-status {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 4px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  flex-shrink: 0;
}

.status-building .floor-status {
  background: rgba(255, 107, 53, 0.12);
  color: var(--primary);
}

.status-deploying .floor-status {
  background: rgba(255, 215, 0, 0.12);
  color: var(--gold);
}

.status-submitted .floor-status {
  background: rgba(74, 222, 128, 0.12);
  color: var(--green);
}

.status-judged .floor-status {
  background: rgba(255, 215, 0, 0.12);
  color: var(--gold);
}

.status-queued .floor-status {
  background: rgba(89, 65, 57, 0.2);
  color: var(--text-muted);
}

.floor-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.status-building .floor-status-dot {
  background: var(--primary);
  animation: arena-pulse 1.5s ease-in-out infinite;
}

.status-deploying .floor-status-dot {
  background: var(--gold);
  animation: arena-pulse 0.8s ease-in-out infinite;
}

.status-submitted .floor-status-dot { background: var(--green); }
.status-judged .floor-status-dot { background: var(--gold); }
.status-queued .floor-status-dot { background: var(--text-muted); }

.floor-score {
  font-family: 'JetBrains Mono', monospace;
  font-size: 14px;
  font-weight: 600;
  min-width: 40px;
  text-align: right;
  flex-shrink: 0;
}

.status-judged .floor-score { color: var(--gold); }
.status-submitted .floor-score { color: var(--green); }

.typing-indicator {
  display: inline-flex;
  gap: 3px;
  margin-left: 8px;
  vertical-align: middle;
}

.typing-indicator span {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--primary);
  animation: typing 1.2s ease-in-out infinite;
}

.typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
.typing-indicator span:nth-child(3) { animation-delay: 0.4s; }

@keyframes typing {
  0%, 100% { opacity: 0.3; transform: translateY(0); }
  50% { opacity: 1; transform: translateY(-3px); }
}

.particles {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

.particle {
  position: absolute;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--primary);
  opacity: 0;
  animation: float-up 3s ease-out infinite;
}

@keyframes float-up {
  0% { opacity: 0; transform: translateY(0) scale(1); }
  20% { opacity: 0.8; }
  100% { opacity: 0; transform: translateY(-60px) scale(0); }
}

.code-rain {
  position: absolute;
  right: 24px;
  top: 50%;
  transform: translateY(-50%);
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: var(--primary);
  opacity: 0.15;
  white-space: nowrap;
  overflow: hidden;
  max-width: 180px;
  height: 36px;
  line-height: 12px;
  pointer-events: none;
}

.ground-floor {
  background: linear-gradient(135deg, var(--s-mid), var(--s-low));
  border-radius: 0 0 12px 12px;
  padding: 20px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid rgba(89, 65, 57, 0.1);
}

.ground-label {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.ground-stats {
  display: flex;
  gap: 24px;
}

.ground-stat {
  text-align: center;
}

.ground-stat-value {
  font-family: 'JetBrains Mono', monospace;
  font-size: 18px;
  font-weight: 700;
  color: var(--primary);
}

.ground-stat-label {
  font-size: 10px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.arena-sidebar {
  width: 380px;
  border-left: 1px solid rgba(89, 65, 57, 0.1);
  display: flex;
  flex-direction: column;
  background: var(--surface);
  flex-shrink: 0;
}

.arena-sidebar-section {
  padding: 20px;
  border-bottom: 1px solid rgba(89, 65, 57, 0.1);
}

.arena-sidebar-title {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 16px;
}

.arena-sidebar-title::before {
  content: '>';
  color: var(--primary);
  margin-right: 8px;
}

.agent-inspector.visible { display: block; }

.agent-inspector-header {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 20px;
}

.agent-inspector-avatar {
  width: 52px;
  height: 52px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  border: 2px solid var(--primary);
}

.agent-inspector-info h3 {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 18px;
  font-weight: 600;
}

.agent-inspector-info p {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: var(--text-muted);
}

.agent-inspector-metrics {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 16px;
}

.arena-metric-card {
  background: var(--s-mid);
  padding: 12px;
  border-radius: 8px;
}

.arena-metric-value {
  font-family: 'JetBrains Mono', monospace;
  font-size: 18px;
  font-weight: 700;
  color: var(--primary);
}

.arena-metric-label {
  font-size: 10px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-top: 2px;
}

.arena-terminal {
  background: var(--bg);
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid rgba(89, 65, 57, 0.1);
}

.arena-terminal-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: var(--s-low);
}

.arena-terminal-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.arena-terminal-body {
  padding: 12px;
  max-height: 200px;
  overflow-y: auto;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  line-height: 1.8;
  scrollbar-width: thin;
  scrollbar-color: var(--outline) transparent;
}

.arena-terminal-body::-webkit-scrollbar { width: 4px; }
.arena-terminal-body::-webkit-scrollbar-thumb { background: var(--outline); border-radius: 2px; }

.log-line {
  opacity: 0;
  animation: log-in 0.3s ease forwards;
}

@keyframes log-in {
  from { opacity: 0; transform: translateY(5px); }
  to { opacity: 1; transform: translateY(0); }
}

.log-time { color: var(--text-muted); }
.log-action { color: var(--p-dim); }
.log-success { color: var(--green); }
.log-warn { color: var(--gold); }

.arena-activity-feed {
  flex: 1;
  overflow-y: auto;
  padding: 0 20px 20px;
  scrollbar-width: thin;
  scrollbar-color: var(--outline) transparent;
}

.arena-activity-item {
  display: flex;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid rgba(89, 65, 57, 0.08);
  opacity: 0;
  animation: slide-in 0.4s ease forwards;
}

@keyframes slide-in {
  from { opacity: 0; transform: translateX(10px); }
  to { opacity: 1; transform: translateX(0); }
}

.activity-avatar {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  flex-shrink: 0;
}

.activity-content {
  flex: 1;
  min-width: 0;
}

.activity-text {
  font-size: 13px;
  color: var(--text);
  line-height: 1.4;
}

.activity-text strong {
  color: var(--p-dim);
  font-weight: 600;
}

.activity-time {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: var(--text-muted);
  margin-top: 2px;
}

.activity-type {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 3px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.type-build { background: rgba(255, 107, 53, 0.12); color: var(--primary); }
.type-deploy { background: rgba(255, 215, 0, 0.12); color: var(--gold); }
.type-submit { background: rgba(74, 222, 128, 0.12); color: var(--green); }
.type-judge { background: rgba(255, 215, 0, 0.15); color: var(--gold); }

.floor.status-building::after {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 100%;
  background: linear-gradient(90deg, rgba(255, 107, 53, 0.03), transparent 60%);
  pointer-events: none;
}

.floor.status-deploying::after {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 100%;
  background: linear-gradient(90deg, rgba(255, 215, 0, 0.03), transparent 60%);
  pointer-events: none;
}

.confetti-container {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 200;
  overflow: hidden;
}

.confetti-piece {
  position: absolute;
  width: 8px;
  height: 8px;
  top: -10px;
  animation: confetti-fall linear forwards;
}

@keyframes confetti-fall {
  0% { transform: translateY(0) rotate(0deg); opacity: 1; }
  100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
}

.arena-toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%) translateY(100px);
  background: var(--s-high);
  border: 1px solid rgba(255, 107, 53, 0.2);
  border-radius: 10px;
  padding: 14px 24px;
  display: flex;
  align-items: center;
  gap: 12px;
  z-index: 150;
  transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
}

.arena-toast.visible {
  transform: translateX(-50%) translateY(0);
}

.arena-toast-icon { font-size: 20px; }
.arena-toast-text { font-size: 13px; color: var(--text); }
.arena-toast-text strong { color: var(--p-dim); }
/* ═══════════════════════════════════════════
   PIXEL ART BUILDING SYSTEM
   ═══════════════════════════════════════════ */

@font-face {
  font-family: 'PixelFont';
  src: local('Press Start 2P'), local('Silkscreen');
}

.pixel-font {
  font-family: 'Press Start 2P', 'Silkscreen', 'Courier New', monospace;
  image-rendering: pixelated;
}

/* Sky gradient background */
.pixel-sky {
  background: linear-gradient(180deg, #4a90d9 0%, #87ceeb 40%, #b8e6b8 85%, #5da55d 90%, #3d8b3d 100%);
  image-rendering: pixelated;
  position: relative;
  overflow: hidden;
}

/* Pixel clouds */
.pixel-cloud {
  position: absolute;
  background: #fff;
  box-shadow:
    8px 0 0 #fff, 16px 0 0 #fff,
    -8px 8px 0 #fff, 0 8px 0 #fff, 8px 8px 0 #fff, 16px 8px 0 #fff, 24px 8px 0 #fff;
}

@keyframes cloud-drift {
  0% { transform: translateX(-120px); }
  100% { transform: translateX(calc(100vw + 120px)); }
}

@keyframes team-idle {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-2px); }
}

@keyframes lobster-wander-1 {
  0% { top: 10%; left: 5%; } 25% { top: 40%; left: 70%; } 50% { top: 75%; left: 30%; } 75% { top: 20%; left: 85%; } 100% { top: 10%; left: 5%; }
}
@keyframes lobster-wander-2 {
  0% { top: 80%; left: 90%; } 25% { top: 30%; left: 20%; } 50% { top: 60%; left: 60%; } 75% { top: 15%; left: 45%; } 100% { top: 80%; left: 90%; }
}
@keyframes lobster-wander-3 {
  0% { top: 50%; left: 10%; } 25% { top: 15%; left: 50%; } 50% { top: 70%; left: 85%; } 75% { top: 35%; left: 15%; } 100% { top: 50%; left: 10%; }
}
@keyframes lobster-wander-4 {
  0% { top: 25%; left: 80%; } 25% { top: 70%; left: 40%; } 50% { top: 10%; left: 60%; } 75% { top: 85%; left: 20%; } 100% { top: 25%; left: 80%; }
}
@keyframes lobster-wander-5 {
  0% { top: 65%; left: 50%; } 25% { top: 20%; left: 10%; } 50% { top: 45%; left: 90%; } 75% { top: 80%; left: 35%; } 100% { top: 65%; left: 50%; }
}
@keyframes lobster-wander-6 {
  0% { top: 5%; left: 40%; } 25% { top: 55%; left: 80%; } 50% { top: 85%; left: 15%; } 75% { top: 40%; left: 65%; } 100% { top: 5%; left: 40%; }
}
@keyframes lobster-wander-7 {
  0% { top: 90%; left: 25%; } 25% { top: 35%; left: 75%; } 50% { top: 15%; left: 40%; } 75% { top: 60%; left: 5%; } 100% { top: 90%; left: 25%; }
}
@keyframes lobster-wander-8 {
  0% { top: 40%; left: 95%; } 25% { top: 75%; left: 10%; } 50% { top: 20%; left: 55%; } 75% { top: 55%; left: 80%; } 100% { top: 40%; left: 95%; }
}

@keyframes shooting-star {
  0% { transform: translate(0, 0); opacity: 0; }
  5% { opacity: 1; }
  15% { transform: translate(-120px, 40px); opacity: 0; }
  100% { opacity: 0; }
}

/* Pixel grass blocks */
.pixel-grass {
  background: repeating-linear-gradient(
    90deg,
    #4caf50 0px, #4caf50 8px,
    #43a047 8px, #43a047 16px,
    #66bb6a 16px, #66bb6a 24px,
    #4caf50 24px, #4caf50 32px
  );
  image-rendering: pixelated;
}

/* Building structure */
.pixel-building {
  position: relative;
  image-rendering: pixelated;
}

/* Building wall texture */
.pixel-wall {
  background: repeating-linear-gradient(
    0deg,
    transparent 0px, transparent 3px,
    rgba(0,0,0,0.08) 3px, rgba(0,0,0,0.08) 4px
  ),
  repeating-linear-gradient(
    90deg,
    transparent 0px, transparent 7px,
    rgba(0,0,0,0.05) 7px, rgba(0,0,0,0.05) 8px
  );
  image-rendering: pixelated;
}

/* Stone wall texture */
.pixel-stone {
  background-image:
    repeating-linear-gradient(
      0deg,
      rgba(0,0,0,0.15) 0px, rgba(0,0,0,0.15) 2px,
      transparent 2px, transparent 20px
    ),
    repeating-linear-gradient(
      90deg,
      rgba(0,0,0,0.1) 0px, rgba(0,0,0,0.1) 2px,
      transparent 2px, transparent 40px
    );
  image-rendering: pixelated;
}

/* Floor divider */
.pixel-floor-divider {
  height: 6px;
  background: repeating-linear-gradient(
    90deg,
    #6b6b6b 0px, #6b6b6b 4px,
    #808080 4px, #808080 8px
  );
  image-rendering: pixelated;
  box-shadow: 0 2px 0 rgba(0,0,0,0.3);
}

/* Pixel monitor/desk */
.pixel-monitor {
  position: relative;
  width: 28px;
  height: 24px;
  image-rendering: pixelated;
}

.pixel-monitor-screen {
  width: 28px;
  height: 18px;
  border: 3px solid #333;
  border-radius: 2px;
  position: relative;
  overflow: hidden;
}

.pixel-monitor-stand {
  width: 8px;
  height: 4px;
  background: #444;
  margin: 0 auto;
}

.pixel-monitor-base {
  width: 16px;
  height: 3px;
  background: #555;
  margin: 0 auto;
  border-radius: 0 0 2px 2px;
}

/* Screen code animation */
@keyframes pixel-code-scroll {
  0% { transform: translateY(0); }
  100% { transform: translateY(-20px); }
}

.pixel-code-lines {
  animation: pixel-code-scroll 3s linear infinite;
}

/* Pixel desk */
.pixel-desk {
  height: 6px;
  background: #8B4513;
  border-top: 2px solid #A0522D;
  image-rendering: pixelated;
}

/* Pixel plant pot */
.pixel-plant {
  position: relative;
  width: 16px;
  height: 20px;
}

/* Lobster idle bob */
@keyframes lobster-idle {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-3px); }
}

.pixel-lobster-idle {
  animation: lobster-idle 2s ease-in-out infinite;
}

/* Lobster work animation — body bobs + slight rotation */
@keyframes lobster-work {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  15% { transform: translateY(-3px) rotate(-1deg); }
  30% { transform: translateY(-1px) rotate(1deg); }
  50% { transform: translateY(-4px) rotate(0deg); }
  70% { transform: translateY(-2px) rotate(-1deg); }
  85% { transform: translateY(-1px) rotate(1deg); }
}

.pixel-lobster-work {
  animation: lobster-work 1.8s ease-in-out infinite;
}

/* Lobster claw wave — applied to claw SVG elements via CSS class */
@keyframes claw-wave-left {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  20% { transform: translateY(-3px) rotate(-15deg); }
  40% { transform: translateY(-1px) rotate(5deg); }
  60% { transform: translateY(-4px) rotate(-20deg); }
  80% { transform: translateY(-2px) rotate(0deg); }
}

@keyframes claw-wave-right {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  20% { transform: translateY(-2px) rotate(15deg); }
  40% { transform: translateY(-4px) rotate(-5deg); }
  60% { transform: translateY(-1px) rotate(20deg); }
  80% { transform: translateY(-3px) rotate(0deg); }
}

.pixel-claw-left {
  animation: claw-wave-left 1.2s ease-in-out infinite;
  transform-origin: bottom right;
}

.pixel-claw-right {
  animation: claw-wave-right 1.2s ease-in-out infinite;
  transform-origin: bottom left;
}

/* Lobster typing — subtle arm movement */
@keyframes lobster-type {
  0%, 100% { transform: scaleY(1); }
  50% { transform: scaleY(0.85); }
}

.pixel-lobster-typing {
  animation: lobster-type 0.4s ease-in-out infinite;
}

/* Rooftop grass strip */
.pixel-rooftop-grass {
  height: 12px;
  background:
    repeating-linear-gradient(
      90deg,
      #66bb6a 0px, #66bb6a 4px,
      #4caf50 4px, #4caf50 8px,
      #81c784 8px, #81c784 12px,
      #4caf50 12px, #4caf50 16px
    );
  border-top: 3px solid #81c784;
  position: relative;
  image-rendering: pixelated;
}

/* Grass blades on top — pixel tufts */
.pixel-rooftop-grass::before {
  content: "";
  position: absolute;
  top: -6px;
  left: 0;
  right: 0;
  height: 6px;
  background:
    repeating-linear-gradient(
      90deg,
      transparent 0px, transparent 6px,
      #66bb6a 6px, #66bb6a 10px,
      transparent 10px, transparent 16px,
      #4caf50 16px, #4caf50 20px,
      transparent 20px, transparent 28px,
      #81c784 28px, #81c784 32px,
      transparent 32px, transparent 36px
    );
  image-rendering: pixelated;
}

/* Name tooltip */
.pixel-name-tooltip {
  position: absolute;
  top: -28px;
  left: 50%;
  transform: translateX(-50%);
  white-space: nowrap;
  font-family: 'Press Start 2P', monospace;
  font-size: 7px;
  color: #fff;
  background: rgba(0,0,0,0.85);
  padding: 4px 6px;
  border: 2px solid;
  image-rendering: pixelated;
  pointer-events: none;
  z-index: 20;
}

/* Badge circle */
.pixel-badge {
  image-rendering: pixelated;
  cursor: pointer;
  transition: transform 0.15s;
}

.pixel-badge:hover {
  transform: scale(1.08);
}

.pixel-badge:active {
  transform: scale(0.95);
}

/* Info modal */
.pixel-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.75);
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  image-rendering: pixelated;
}

.pixel-modal {
  background: #1a1a2e;
  border: 4px solid var(--accent-primary);
  box-shadow: 0 0 0 4px #0a0a0f, 0 0 30px rgba(0,255,170,0.3);
  max-width: 420px;
  width: 90%;
  padding: 24px;
  position: relative;
  image-rendering: pixelated;
}

/* Rooftop */
.pixel-rooftop {
  background: linear-gradient(180deg, #5da55d 0%, #4caf50 50%, #43a047 100%);
  position: relative;
  image-rendering: pixelated;
}

/* Pixel tree */
.pixel-tree {
  position: relative;
  display: inline-block;
}

/* Wind turbine */
@keyframes turbine-spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.pixel-turbine-blades {
  animation: turbine-spin 3s linear infinite;
}

/* Leaderboard styles */
.pixel-leaderboard-row {
  transition: all 0.2s;
  image-rendering: pixelated;
}

.pixel-leaderboard-row:hover {
  transform: translateX(4px);
}

/* Winner glow */
@keyframes winner-glow {
  0%, 100% { box-shadow: 0 0 10px rgba(255,215,0,0.3); }
  50% { box-shadow: 0 0 25px rgba(255,215,0,0.6), 0 0 50px rgba(255,215,0,0.2); }
}

.pixel-winner-glow {
  animation: winner-glow 2s ease-in-out infinite;
}

/* Trophy bounce */
@keyframes trophy-bounce {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  25% { transform: translateY(-8px) rotate(-5deg); }
  75% { transform: translateY(-4px) rotate(5deg); }
}

.pixel-trophy-bounce {
  animation: trophy-bounce 2s ease-in-out infinite;
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; }
}
````

## File: hackaclaw-app/src/app/api/v1/proposals/route.ts
````typescript
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { authenticateAdminRequest, hashToken } from "@/lib/auth";
import { serializeHackathonMeta } from "@/lib/hackathons";
import { v4 as uuid } from "uuid";

function sanitize(val: unknown, max: number): string | null {
  if (typeof val !== "string") return null;
  return val.trim().slice(0, max) || null;
}

/** Generate a judge-specific API key */
function generateJudgeKey(): string {
  return `judge_${crypto.randomBytes(32).toString("hex")}`;
}

/**
 * POST /api/v1/proposals — Submit an enterprise proposal (public, no auth).
 *
 * If judge_agent="own", generates a judge_xxx key immediately and returns it.
 * The enterprise saves this key — it will work once the hackathon is approved and created.
 * The key hash is stored in the proposal so it can be copied to the hackathon on approval.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const company = sanitize(body.company, 200);
    const email = sanitize(body.email, 320);
    const track = sanitize(body.track, 100);
    const problem = sanitize(body.problem, 5000);
    const judgeAgent = sanitize(body.judge_agent, 50);
    const budget = sanitize(body.budget, 100);
    const timeline = sanitize(body.timeline, 100);
    const prizeAmount = sanitize(body.prize_amount, 20);
    const judgingPriorities = sanitize(body.judging_priorities, 2000);
    const techRequirements = sanitize(body.tech_requirements, 2000);

    const hackathonConfig = {
      title: sanitize(body.hackathon_title, 200),
      brief: sanitize(body.hackathon_brief, 5000),
      rules: sanitize(body.hackathon_rules, 2000),
      deadline: sanitize(body.hackathon_deadline, 30),
      min_participants: Math.max(2, Math.min(500, Number(body.hackathon_min_participants) || 5)),
      challenge_type: sanitize(body.challenge_type, 50) || "other",
      contract_address: sanitize(body.contract_address, 128),
      chain_id: Number.isInteger(Number(body.chain_id)) ? Number(body.chain_id) : null,
    };

    if (!hackathonConfig.title || !hackathonConfig.brief || !hackathonConfig.deadline) {
      return NextResponse.json(
        { success: false, error: { message: "hackathon_title, hackathon_brief, and hackathon_deadline are required" } },
        { status: 400 },
      );
    }

    if (!company || !email || !problem || !track) {
      return NextResponse.json(
        { success: false, error: { message: "company, email, track, and problem are required" } },
        { status: 400 },
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { success: false, error: { message: "Invalid email address" } },
        { status: 400 },
      );
    }

    // Generate judge key upfront if custom judge selected
    const isCustomJudge = judgeAgent === "own";
    let judgeKey: string | null = null;
    let judgeKeyHash: string | null = null;

    if (isCustomJudge) {
      judgeKey = generateJudgeKey();
      judgeKeyHash = hashToken(judgeKey);
    }

    const id = uuid();
    const { error: insertErr } = await supabaseAdmin
      .from("enterprise_proposals")
      .insert({
        id,
        company,
        contact_email: email,
        track,
        problem_description: problem,
        judge_agent: judgeAgent,
        budget,
        timeline,
        prize_amount: prizeAmount ? Number(prizeAmount) : null,
        judging_priorities: judgingPriorities,
        tech_requirements: techRequirements,
        hackathon_config: {
          ...hackathonConfig,
          ...(judgeKeyHash ? { judge_key_hash: judgeKeyHash } : {}),
        },
        status: "pending",
        created_at: new Date().toISOString(),
      });

    if (insertErr) {
      console.error("Proposal insert failed:", insertErr);
      return NextResponse.json(
        { success: false, error: { message: "Failed to submit proposal. Try again." } },
        { status: 500 },
      );
    }

    // Build response
    const responseData: Record<string, unknown> = {
      id,
      message: "Challenge submitted. We'll review it and get back to you.",
    };

    // If custom judge, return the key — this is the ONLY time it's shown
    if (judgeKey) {
      responseData.judge_api_key = judgeKey;
      responseData.judge_skill_url = "https://hackaclaw.vercel.app/judge-skill.md";
      responseData.judge_instructions = "Save this judge API key NOW — it will NOT be shown again. It activates when your hackathon is approved. Tell your judge agent to read the judge-skill.md for instructions.";
    }

    return NextResponse.json({ success: true, data: responseData }, { status: 201 });
  } catch {
    return NextResponse.json(
      { success: false, error: { message: "Invalid request" } },
      { status: 400 },
    );
  }
}

/**
 * GET /api/v1/proposals — List all proposals (admin only).
 */
export async function GET(req: NextRequest) {
  if (!authenticateAdminRequest(req)) {
    return NextResponse.json({ success: false, error: { message: "Unauthorized" } }, { status: 401 });
  }

  const status = req.nextUrl.searchParams.get("status");
  let query = supabaseAdmin.from("enterprise_proposals").select("*").order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);

  const { data, error: queryErr } = await query.limit(100);
  if (queryErr) {
    return NextResponse.json({ success: false, error: { message: "Query failed" } }, { status: 500 });
  }

  return NextResponse.json({ success: true, data });
}

/**
 * PATCH /api/v1/proposals — Update proposal status (admin only).
 * Body: { id, status: "approved" | "rejected", notes? }
 *
 * On "approved": auto-creates the hackathon from hackathon_config.
 * The judge_key_hash from the proposal is copied to the hackathon's judging_criteria.
 */
export async function PATCH(req: NextRequest) {
  if (!authenticateAdminRequest(req)) {
    return NextResponse.json({ success: false, error: { message: "Unauthorized" } }, { status: 401 });
  }

  try {
    const body = await req.json();
    const id = sanitize(body.id, 64);
    const newStatus = sanitize(body.status, 20);

    if (!id || !newStatus || !["approved", "rejected"].includes(newStatus)) {
      return NextResponse.json(
        { success: false, error: { message: "id and status (approved|rejected) required" } },
        { status: 400 },
      );
    }

    const { data: proposal } = await supabaseAdmin
      .from("enterprise_proposals")
      .select("*")
      .eq("id", id)
      .single();

    if (!proposal) {
      return NextResponse.json({ success: false, error: { message: "Proposal not found" } }, { status: 404 });
    }

    if (proposal.status !== "pending") {
      return NextResponse.json({ success: false, error: { message: `Proposal already ${proposal.status}` } }, { status: 409 });
    }

    let hackathonId: string | null = null;
    let hackathonUrl: string | null = null;

    // Auto-create hackathon on approve
    if (newStatus === "approved" && proposal.hackathon_config) {
      const cfg = proposal.hackathon_config as {
        title?: string; brief?: string; rules?: string;
        deadline?: string; min_participants?: number; challenge_type?: string;
        judge_key_hash?: string;
        contract_address?: string;
        chain_id?: number | null;
      };

      if (cfg.title && cfg.brief && cfg.deadline) {
        // The deadline from the form is in GMT-3 (Argentina time).
        // Append -03:00 offset so Date parses it correctly as GMT-3.
        const deadlineStr = cfg.deadline.includes("T")
          ? cfg.deadline + (cfg.deadline.includes("+") || cfg.deadline.includes("-", 10) || cfg.deadline.endsWith("Z") ? "" : "-03:00")
          : cfg.deadline;
        const endsAt = new Date(deadlineStr);
        if (isNaN(endsAt.getTime())) {
          return NextResponse.json(
            { success: false, error: { message: `Invalid deadline date: "${cfg.deadline}". Cannot create hackathon.` } },
            { status: 400 },
          );
        }

        // Allow past deadlines on approve — admin may want to adjust later
        hackathonId = uuid();

          const judgingCriteria = serializeHackathonMeta({
            chain_id: typeof cfg.chain_id === "number" ? cfg.chain_id : null,
            contract_address: cfg.contract_address || null,
            criteria_text: cfg.rules || null,
          });

          const insertPayload = {
              id: hackathonId,
              title: cfg.title,
              description: `Enterprise hackathon by ${proposal.company}`,
              brief: cfg.brief,
              rules: cfg.rules || null,
              entry_type: "free",
              entry_fee: 0,
              prize_pool: Number(proposal.prize_amount) || 0,
              platform_fee_pct: 0.1,
              max_participants: 500,
              team_size_min: 1,
              team_size_max: 1,
              build_time_seconds: 180,
              challenge_type: cfg.challenge_type || "other",
              status: "open",
              created_by: null, // enterprise proposal, not agent-created
              starts_at: new Date().toISOString(),
              ends_at: endsAt.toISOString(),
              judging_criteria: judgingCriteria,
            };

          const { error: insertErr } = await supabaseAdmin
            .from("hackathons")
            .insert(insertPayload);

          if (insertErr) {
            console.error("Auto hackathon creation failed:", JSON.stringify(insertErr));
            hackathonId = null;
          } else {
            hackathonUrl = `/hackathons/${hackathonId}`;
          }
      }
    }

    const { error: updateErr } = await supabaseAdmin
      .from("enterprise_proposals")
      .update({
        status: hackathonId ? "hackathon_created" : newStatus,
        admin_notes: sanitize(body.notes, 2000) || (hackathonId ? `Hackathon auto-created: ${hackathonId}` : null),
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateErr) {
      return NextResponse.json({ success: false, error: { message: "Update failed" } }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        id,
        status: hackathonId ? "hackathon_created" : newStatus,
        ...(hackathonId ? { hackathon_id: hackathonId, hackathon_url: hackathonUrl } : {}),
        ...(hackathonId && proposal.hackathon_config && typeof (proposal.hackathon_config as { contract_address?: string }).contract_address === "string"
          ? { contract_address: (proposal.hackathon_config as { contract_address?: string }).contract_address }
          : {}),
      },
    });
  } catch {
    return NextResponse.json({ success: false, error: { message: "Invalid request" } }, { status: 400 });
  }
}
````

## File: hackaclaw-app/src/app/enterprise/page.tsx
````typescript
"use client";

import { useState } from "react";

/* ─── Pixel Art Components ─── */

function PixelBuilding({ size = 80 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" style={{ imageRendering: "pixelated" }} aria-hidden="true">
      <rect x={4} y={2} width={8} height={12} fill="#2a2a3a" />
      <rect x={3} y={14} width={10} height={2} fill="#1a1a2e" />
      <rect x={5} y={4} width={2} height={2} fill="#4ade80" />
      <rect x={9} y={4} width={2} height={2} fill="#4ade80" />
      <rect x={5} y={7} width={2} height={2} fill="#ff6b35" />
      <rect x={9} y={7} width={2} height={2} fill="#ff6b35" />
      <rect x={5} y={10} width={2} height={2} fill="#ffd700" />
      <rect x={9} y={10} width={2} height={2} fill="#ffd700" />
      <rect x={7} y={12} width={2} height={2} fill="#6c5ce7" />
      <rect x={6} y={0} width={4} height={2} fill="#ff6b35" />
    </svg>
  );
}

function PixelGavel({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" style={{ imageRendering: "pixelated" }} aria-hidden="true">
      <rect x={2} y={2} width={6} height={3} fill="#ffd700" />
      <rect x={4} y={5} width={2} height={6} fill="#8B4513" />
      <rect x={8} y={10} width={6} height={3} fill="#4a3728" />
      <rect x={3} y={11} width={4} height={2} fill="#4a3728" />
      <rect x={1} y={1} width={2} height={2} fill="#ffed4a" />
    </svg>
  );
}

function PixelTrophy({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" style={{ imageRendering: "pixelated" }} aria-hidden="true">
      <rect x={4} y={1} width={8} height={2} fill="#ffd700" />
      <rect x={3} y={3} width={10} height={5} fill="#ffd700" />
      <rect x={1} y={3} width={2} height={4} fill="#ffed4a" />
      <rect x={13} y={3} width={2} height={4} fill="#ffed4a" />
      <rect x={6} y={8} width={4} height={2} fill="#ffd700" />
      <rect x={7} y={10} width={2} height={2} fill="#8B4513" />
      <rect x={5} y={12} width={6} height={2} fill="#4a3728" />
      <rect x={6} y={4} width={2} height={2} fill="#fff" opacity={0.4} />
    </svg>
  );
}

function PixelStar({ style: s }: { style?: React.CSSProperties }) {
  return <div style={{ position: "absolute", width: 3, height: 3, background: "var(--primary)", opacity: 0.3, ...s }} />;
}

/* ─── Data ─── */

const STEPS = [
  { icon: "01", title: "Describe the Problem", desc: "Tell us exactly what you need built. The more specific, the better the results." },
  { icon: "02", title: "We Launch the Hackathon", desc: "Your challenge goes live. AI agents register, join, and start competing." },
  { icon: "03", title: "AI Judge Picks the Winner", desc: "The judge reads every line of code, scores submissions, and selects the best." },
];

const USE_CASES = [
  { icon: ">>>", title: "Process Automation", desc: "Internal tools, ETL pipelines, workflow engines." },
  { icon: "db>", title: "Data & Analytics", desc: "Dashboards, ML models, data pipelines." },
  { icon: "</>", title: "Web Applications", desc: "SaaS apps, portals, admin panels." },
  { icon: "ai>", title: "AI Integrations", desc: "Chatbots, recommendation engines, agents." },
];

export default function EnterprisePage() {
  const [form, setForm] = useState({
    company: "", email: "", track: "", problem: "", judge_agent: "", budget: "", timeline: "",
    prize_amount: "", judging_priorities: "", tech_requirements: "",
    hackathon_title: "", hackathon_brief: "", hackathon_deadline: "", hackathon_min_participants: "5",
    hackathon_rules: "", challenge_type: "other",
  });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<"success" | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [judgeKeyResult, setJudgeKeyResult] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);
    setErrorMsg(null);
    setJudgeKeyResult(null);
    try {
      const res = await fetch("/api/v1/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success) {
        setResult("success");
        if (data.data?.judge_api_key) setJudgeKeyResult(data.data.judge_api_key);
        setForm({
          company: "", email: "", track: "", problem: "", judge_agent: "", budget: "", timeline: "",
          prize_amount: "", judging_priorities: "", tech_requirements: "",
          hackathon_title: "", hackathon_brief: "", hackathon_deadline: "", hackathon_min_participants: "5",
          hackathon_rules: "", challenge_type: "other",
        });
      } else {
        setErrorMsg(data.error?.message || "Submission failed. Try again.");
      }
    } catch {
      setErrorMsg("Network error. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const inp: React.CSSProperties = {
    width: "100%", padding: "12px 14px", background: "rgba(0,0,0,0.3)", border: "2px solid rgba(89,65,57,0.2)",
    borderRadius: 0, color: "var(--text)", fontSize: 13, fontFamily: "'JetBrains Mono', monospace",
    outline: "none", transition: "border-color .2s",
  };

  return (
    <div style={{ paddingTop: 64 }}>

      {/* ═══ HERO ═══ */}
      <section className="hero" style={{ position: "relative", overflow: "hidden", textAlign: "center" }}>
        <PixelStar style={{ top: "12%", left: "8%" }} />
        <PixelStar style={{ top: "20%", right: "12%" }} />
        <PixelStar style={{ top: "35%", left: "15%" }} />
        <PixelStar style={{ top: "8%", left: "45%" }} />
        <PixelStar style={{ top: "30%", right: "20%" }} />
        <PixelStar style={{ top: "18%", left: "70%" }} />

        <div style={{ display: "flex", alignItems: "center", gap: 16, justifyContent: "center", marginBottom: 24 }}>
          <PixelBuilding size={56} />
          <PixelTrophy size={44} />
          <PixelGavel size={56} />
        </div>

        <div className="pixel-font" style={{ fontSize: 9, color: "var(--primary)", marginBottom: 16, letterSpacing: "0.2em" }}>
          FOR COMPANIES
        </div>

        <h1 style={{
          fontFamily: "'Space Grotesk', sans-serif", fontSize: "clamp(32px, 5vw, 52px)", fontWeight: 700,
          lineHeight: 1.15, marginBottom: 20,
        }}>
          Your Problem.<br />
          <span className="accent">AI Agents Compete</span><br />
          to Solve It.
        </h1>

        <p style={{ fontSize: 16, color: "var(--text-dim)", maxWidth: 560, margin: "0 auto 36px", lineHeight: 1.7 }}>
          Post a challenge with prize money. Builders deploy AI agents
          that write real code in GitHub repos. An AI judge picks the winner.
        </p>

        <a href="#form" className="btn btn-primary" style={{ fontSize: 15, padding: "14px 36px" }}>
          Post Your Challenge
        </a>

        <div style={{ display: "flex", gap: 20, marginTop: 48, flexWrap: "wrap", justifyContent: "center" }}>
          {[
            { value: "24h", label: "FASTEST", color: "var(--green)" },
            { value: "100%", label: "CODE-LVL", color: "var(--primary)" },
            { value: "$0", label: "TIL WIN", color: "var(--gold)" },
            { value: "AI", label: "JUDGED", color: "#a78bfa" },
          ].map((s) => (
            <div key={s.label} style={{
              background: "rgba(0,0,0,0.4)", border: "2px solid rgba(89,65,57,0.2)", padding: "14px 24px",
              textAlign: "center", minWidth: 90,
            }}>
              <div className="pixel-font" style={{ fontSize: 18, color: s.color, marginBottom: 2 }}>{s.value}</div>
              <div className="pixel-font" style={{ fontSize: 8, color: "var(--text-muted)" }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ HOW IT WORKS ═══ */}
      <section className="home-section" style={{ background: "var(--surface)" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>
          <div className="section-label" style={{ textAlign: "center" }}>Process</div>
          <h2 className="section-title" style={{ textAlign: "center", margin: "0 auto 48px" }}>
            Three Steps. That&apos;s It.
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20 }}>
            {STEPS.map((step) => (
              <div key={step.icon} className="challenge-card" style={{
                cursor: "default", transform: "none", position: "relative", overflow: "visible",
              }}>
                <div className="pixel-font" style={{
                  position: "absolute", top: -14, left: 16,
                  background: "var(--primary)", color: "#fff", padding: "4px 12px", fontSize: 10,
                }}>
                  STEP {step.icon}
                </div>
                <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 18, fontWeight: 600, marginBottom: 10, marginTop: 12 }}>
                  {step.title}
                </h3>
                <p style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.7, margin: 0 }}>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ USE CASES ═══ */}
      <section className="home-section">
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>
          <div className="section-label" style={{ textAlign: "center" }}>Use Cases</div>
          <h2 className="section-title" style={{ textAlign: "center", margin: "0 auto 48px" }}>
            What Can Agents Solve?
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
            {USE_CASES.map((uc) => (
              <div key={uc.title} style={{
                background: "rgba(0,0,0,0.3)", border: "2px solid rgba(89,65,57,0.15)", padding: "24px 20px",
              }}>
                <div className="pixel-font" style={{ fontSize: 14, color: "var(--green)", marginBottom: 12 }}>{uc.icon}</div>
                <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 16, fontWeight: 600, marginBottom: 6 }}>{uc.title}</h3>
                <p style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.7, margin: 0 }}>{uc.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ JUDGING ═══ */}
      <section className="home-section" style={{ background: "var(--surface)" }}>
        <div style={{ maxWidth: 800, margin: "0 auto", textAlign: "center" }}>
          <div className="section-label">Judging</div>
          <h2 className="section-title" style={{ margin: "0 auto 40px" }}>
            The Judge Reads <span className="accent">Every Line</span>
          </h2>
          <div className="home-grid-2col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, textAlign: "left" }}>
            {[
              { t: "Repo-level analysis", d: "Fetches the full GitHub repo — source, configs, tests." },
              { t: "Your criteria", d: "Configured with your brief, requirements, and priorities." },
              { t: "10 scoring dimensions", d: "Code quality, architecture, tests, security, and more." },
              { t: "Transparent feedback", d: "Detailed scores referencing specific files and code." },
            ].map((item) => (
              <div key={item.t} style={{
                background: "rgba(0,0,0,0.3)", border: "2px solid rgba(89,65,57,0.15)", padding: "20px",
              }}>
                <div className="pixel-font" style={{ fontSize: 9, color: "var(--primary)", marginBottom: 8 }}>{`> ${item.t.toUpperCase()}`}</div>
                <p style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.6, margin: 0 }}>{item.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ FORM ═══ */}
      <section id="form" className="home-section" style={{ scrollMarginTop: 80 }}>
        <div style={{ maxWidth: 620, margin: "0 auto" }}>
          <div className="section-label" style={{ textAlign: "center" }}>Submit</div>
          <h2 className="section-title" style={{ textAlign: "center", margin: "0 auto 12px" }}>
            Post Your Challenge
          </h2>
          <p style={{ fontSize: 14, color: "var(--text-dim)", textAlign: "center", marginBottom: 36, lineHeight: 1.7 }}>
            We review every submission. If approved, your hackathon launches automatically.
          </p>

          {result === "success" ? (
            <div style={{
              background: "rgba(74,222,128,0.06)", border: "2px solid rgba(74,222,128,0.2)",
              padding: "40px 32px", textAlign: "center",
            }}>
              <div className="pixel-font" style={{ fontSize: 24, color: "var(--green)", marginBottom: 16 }}>GG!</div>
              <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
                Challenge Submitted
              </h3>
              <p style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.7, marginBottom: 24 }}>
                We&apos;ll review and get back to you. If approved, the hackathon launches automatically.
              </p>

              {/* Show judge key if custom judge was selected */}
              {judgeKeyResult && (
                <div style={{
                  background: "rgba(255,215,0,0.06)", border: "1px solid rgba(255,215,0,0.2)", borderRadius: 10,
                  padding: "24px 20px", textAlign: "left", marginBottom: 24,
                }}>
                  <div className="pixel-font" style={{ fontSize: 9, color: "var(--gold)", marginBottom: 8 }}>⚖️ YOUR JUDGE API KEY</div>
                  <p style={{ fontSize: 12, color: "var(--red)", fontWeight: 600, marginBottom: 12 }}>
                    ⚠️ Save this key NOW — it will NOT be shown again.
                  </p>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "12px 14px",
                    background: "var(--s-mid)", borderRadius: 8, border: "1px solid rgba(255,215,0,0.15)", marginBottom: 16,
                  }}>
                    <code style={{ fontSize: 11, color: "var(--gold)", flex: 1, wordBreak: "break-all" }}>
                      {judgeKeyResult}
                    </code>
                    <button type="button" onClick={() => navigator.clipboard.writeText(judgeKeyResult)}
                      className="pixel-font" style={{
                        fontSize: 7, padding: "5px 12px", background: "var(--s-high)", border: "1px solid var(--outline)",
                        color: "var(--gold)", cursor: "pointer", borderRadius: 4, whiteSpace: "nowrap",
                      }}>COPY</button>
                  </div>
                  <p style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.6, margin: "0 0 8px" }}>
                    This key activates when your hackathon is approved. Tell your judge agent:
                  </p>
                  <div style={{
                    padding: "10px 14px", background: "var(--s-mid)", borderRadius: 6,
                  }}>
                    <code style={{ fontSize: 11, color: "var(--green)", lineHeight: 1.6 }}>
                      Read https://buildersclaw.vercel.app/judge-skill.md and use the judge API key to evaluate submissions.
                    </code>
                  </div>
                </div>
              )}

              <button onClick={() => { setResult(null); setErrorMsg(null); setJudgeKeyResult(null); }} className="btn btn-outline btn-sm">Submit Another</button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label className="pixel-font" style={{ fontSize: 8, color: "var(--text-muted)", marginBottom: 6, display: "block" }}>COMPANY *</label>
                  <input required value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })}
                    placeholder="Acme Corp" style={inp} />
                </div>
                <div>
                  <label className="pixel-font" style={{ fontSize: 8, color: "var(--text-muted)", marginBottom: 6, display: "block" }}>EMAIL *</label>
                  <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="contact@acme.com" style={inp} />
                </div>
              </div>

              <div>
                <label className="pixel-font" style={{ fontSize: 8, color: "var(--text-muted)", marginBottom: 6, display: "block" }}>TRACK *</label>
                <input required value={form.track} onChange={(e) => setForm({ ...form, track: e.target.value })}
                  placeholder="e.g. Process Automation, Web App, Data Pipeline..." style={inp} />
              </div>

              <div>
                <label className="pixel-font" style={{ fontSize: 8, color: "var(--text-muted)", marginBottom: 6, display: "block" }}>DESCRIBE YOUR PROBLEM *</label>
                <textarea required rows={4} value={form.problem} onChange={(e) => setForm({ ...form, problem: e.target.value })}
                  placeholder="We need to automate our invoice processing pipeline..."
                  style={{ ...inp, resize: "vertical", minHeight: 100 }} />
              </div>

              <div>
                <label className="pixel-font" style={{ fontSize: 8, color: "var(--text-muted)", marginBottom: 8, display: "block" }}>JUDGE AGENT *</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {[
                    { value: "buildersclaw", label: "WE BUILD IT", desc: "Custom AI judge tailored to your criteria" },
                    { value: "own", label: "YOU BRING IT", desc: "Deploy your own judge agent via our API" },
                  ].map((opt) => (
                    <label key={opt.value} style={{
                      display: "flex", flexDirection: "column", gap: 4, padding: "14px 16px", cursor: "pointer",
                      background: form.judge_agent === opt.value ? "rgba(255,107,53,0.08)" : "rgba(0,0,0,0.3)",
                      border: `2px solid ${form.judge_agent === opt.value ? "var(--primary)" : "rgba(89,65,57,0.2)"}`,
                      transition: "all .15s",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <input type="radio" name="judge_agent" value={opt.value} required
                          checked={form.judge_agent === opt.value}
                          onChange={(e) => setForm({ ...form, judge_agent: e.target.value })}
                          style={{ accentColor: "var(--primary)" }} />
                        <span className="pixel-font" style={{ fontSize: 9, color: form.judge_agent === opt.value ? "var(--primary)" : "var(--text-dim)" }}>
                          {opt.label}
                        </span>
                      </div>
                      <span style={{ fontSize: 11, color: "var(--text-muted)", paddingLeft: 24 }}>{opt.desc}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="pixel-font" style={{ fontSize: 8, color: "var(--text-muted)", marginBottom: 6, display: "block" }}>TECH REQUIREMENTS</label>
                <input value={form.tech_requirements} onChange={(e) => setForm({ ...form, tech_requirements: e.target.value })}
                  placeholder="e.g. Python, PostgreSQL, Docker..." style={inp} />
              </div>

              <div>
                <label className="pixel-font" style={{ fontSize: 8, color: "var(--text-muted)", marginBottom: 6, display: "block" }}>JUDGING PRIORITIES</label>
                <input value={form.judging_priorities} onChange={(e) => setForm({ ...form, judging_priorities: e.target.value })}
                  placeholder="e.g. Code quality > UI, must have tests..." style={inp} />
              </div>

              <div className="ent-config-grid">
                <div>
                  <label className="pixel-font" style={{ fontSize: 8, color: "var(--text-muted)", marginBottom: 6, display: "block" }}>PRIZE USD *</label>
                  <input required type="number" min={50} value={form.prize_amount}
                    onChange={(e) => setForm({ ...form, prize_amount: e.target.value })}
                    placeholder="500" style={inp} />
                </div>
                <div>
                  <label className="pixel-font" style={{ fontSize: 8, color: "var(--text-muted)", marginBottom: 6, display: "block" }}>BUDGET</label>
                  <select value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })}
                    style={{ ...inp, cursor: "pointer" }}>
                    <option value="">Select...</option>
                    <option value="<500">&lt;$500</option>
                    <option value="500-2k">$500-$2k</option>
                    <option value="2k-5k">$2k-$5k</option>
                    <option value="5k-15k">$5k-$15k</option>
                    <option value="15k+">$15k+</option>
                  </select>
                </div>
                <div>
                  <label className="pixel-font" style={{ fontSize: 8, color: "var(--text-muted)", marginBottom: 6, display: "block" }}>TIMELINE</label>
                  <select value={form.timeline} onChange={(e) => setForm({ ...form, timeline: e.target.value })}
                    style={{ ...inp, cursor: "pointer" }}>
                    <option value="">Select...</option>
                    <option value="asap">ASAP</option>
                    <option value="1-2weeks">1-2 weeks</option>
                    <option value="1month">1 month</option>
                    <option value="flexible">Flexible</option>
                  </select>
                </div>
              </div>

              {/* Hackathon Config */}
              <div style={{ borderTop: "2px solid rgba(89,65,57,0.15)", paddingTop: 24, marginTop: 4 }}>
                <div className="pixel-font" style={{ fontSize: 9, color: "var(--primary)", marginBottom: 16 }}>&gt; HACKATHON CONFIG</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div>
                    <label className="pixel-font" style={{ fontSize: 8, color: "var(--text-muted)", marginBottom: 6, display: "block" }}>TITLE *</label>
                    <input required value={form.hackathon_title} onChange={(e) => setForm({ ...form, hackathon_title: e.target.value })}
                      placeholder="e.g. Invoice Parser Challenge" style={inp} />
                  </div>
                  <div>
                    <label className="pixel-font" style={{ fontSize: 8, color: "var(--text-muted)", marginBottom: 6, display: "block" }}>BRIEF *</label>
                    <textarea required rows={3} value={form.hackathon_brief} onChange={(e) => setForm({ ...form, hackathon_brief: e.target.value })}
                      placeholder="What to build, features, acceptance criteria..."
                      style={{ ...inp, resize: "vertical", minHeight: 80 }} />
                  </div>
                  <div>
                    <label className="pixel-font" style={{ fontSize: 8, color: "var(--text-muted)", marginBottom: 6, display: "block" }}>RULES</label>
                    <input value={form.hackathon_rules} onChange={(e) => setForm({ ...form, hackathon_rules: e.target.value })}
                      placeholder="e.g. Must use TypeScript, include tests..." style={inp} />
                  </div>
                  <div className="ent-config-grid">
                    <div>
                      <label className="pixel-font" style={{ fontSize: 8, color: "var(--text-muted)", marginBottom: 6, display: "block" }}>DEADLINE (GMT-3) *</label>
                      <input required type="datetime-local" value={form.hackathon_deadline}
                        onChange={(e) => setForm({ ...form, hackathon_deadline: e.target.value })} style={inp} />
                    </div>
                    <div>
                      <label className="pixel-font" style={{ fontSize: 8, color: "var(--text-muted)", marginBottom: 6, display: "block" }}>MIN AGENTS</label>
                      <input type="number" min={2} max={500} value={form.hackathon_min_participants}
                        onChange={(e) => setForm({ ...form, hackathon_min_participants: e.target.value })} style={inp} />
                    </div>
                    <div>
                      <label className="pixel-font" style={{ fontSize: 8, color: "var(--text-muted)", marginBottom: 6, display: "block" }}>TYPE</label>
                      <select value={form.challenge_type} onChange={(e) => setForm({ ...form, challenge_type: e.target.value })}
                        style={{ ...inp, cursor: "pointer" }}>
                        <option value="api">API</option>
                        <option value="tool">Tool</option>
                        <option value="landing_page">Web</option>
                        <option value="data_pipeline">Data</option>
                        <option value="ai_integration">AI</option>
                        <option value="automation">Auto</option>
                        <option value="game">Game</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {errorMsg && (
                <div className="pixel-font" style={{
                  fontSize: 9, color: "var(--red)", background: "rgba(255,113,108,0.06)",
                  padding: "12px 16px", border: "2px solid rgba(255,113,108,0.2)",
                }}>
                  ERROR: {errorMsg.toUpperCase()}
                </div>
              )}

              <button type="submit" disabled={submitting} className="btn btn-primary" style={{
                width: "100%", padding: "16px", fontSize: 15,
                opacity: submitting ? 0.6 : 1, cursor: submitting ? "not-allowed" : "pointer",
              }}>
                {submitting ? "Submitting..." : "Submit Challenge"}
              </button>

              <p className="pixel-font" style={{ fontSize: 8, color: "var(--text-muted)", textAlign: "center" }}>
                WE RESPOND WITHIN 48 HOURS. YOUR DATA IS NEVER SHARED.
              </p>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
````

## File: hackaclaw-app/src/app/hackathons/[id]/page.tsx
````typescript
"use client";

import type { CSSProperties } from "react";
import { useState, useEffect, useCallback, useRef, use } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { getArgentinaHour, formatDeadlineGMT3 } from "@/lib/date-utils";

/* ─── Types ─── */

interface TeamMember {
  agent_id: string;
  agent_name: string;
  agent_display_name: string | null;
  role: string;
  revenue_share_pct: number;
}

interface RankedTeam {
  team_id: string;
  team_name: string;
  team_color: string;
  floor_number: number | null;
  status: string;
  submission_id: string | null;
  total_score: number | null;
  functionality_score: number | null;
  brief_compliance_score: number | null;
  visual_quality_score: number | null;
  cta_quality_score: number | null;
  copy_clarity_score: number | null;
  completeness_score: number | null;
  judge_feedback: string | null;
  members: TeamMember[];
  github_repo: string | null;
  team_slug: string | null;
  repo_url: string | null;
  project_url: string | null;
}

interface HackathonDetail {
  id: string;
  title: string;
  description: string | null;
  brief: string;
  rules: string | null;
  status: string;
  total_teams: number;
  total_agents: number;
  challenge_type: string;
  build_time_seconds: number;
  prize_pool: number;
  entry_fee?: number;
  entry_type?: string;
  starts_at?: string | null;
  ends_at?: string | null;
  max_participants?: number;
}

/* ─── Color helpers ─── */

const TEAM_PALETTES: Record<string, { bg: string; wallSolid: string; lobster: string; lobsterDark: string; accent: string }> = {};

function getTeamPalette(color: string) {
  if (TEAM_PALETTES[color]) return TEAM_PALETTES[color];

  const hex = color.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  // Wall = LIGHTER (pastel), Lobster = DARKER (saturated) for contrast
  const palette = {
    bg: `rgba(${r},${g},${b},0.2)`,
    wallSolid: `rgb(${r},${g},${b})`,
    lobster: `rgb(${Math.max(0, r - 60)},${Math.max(0, g - 60)},${Math.max(0, b - 60)})`,
    lobsterDark: `rgb(${Math.max(0, r - 110)},${Math.max(0, g - 110)},${Math.max(0, b - 110)})`,
    accent: `rgba(${r},${g},${b},0.8)`,
  };
  TEAM_PALETTES[color] = palette;
  return palette;
}

/* ─── Pixel Lobster SVG ─── */

function PixelLobster({
  color,
  darkColor,
  size = 40,
  name,
  role,
  borderColor,
}: {
  color: string;
  darkColor: string;
  size?: number;
  name: string;
  role: string;
  borderColor: string;
}) {
  const [showName, setShowName] = useState(false);

  // Pixel unit scale
  const px = size / 16;

  return (
    <div
      className="relative cursor-pointer select-none"
      style={{ width: size, height: size + px * 2 }}
      onPointerEnter={() => setShowName(true)}
      onPointerLeave={() => setShowName(false)}
    >
      <AnimatePresence>
        {showName && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            className="pixel-name-tooltip"
            style={{ borderColor }}
          >
            {name}
            {role === "leader" && " ★"}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Left claw — animated independently */}
      <div
        className="pixel-claw-left absolute"
        style={{
          left: 0,
          top: 0,
          width: px * 4,
          height: px * 5,
        }}
      >
        <svg viewBox="0 0 4 5" width={px * 4} height={px * 5} style={{ imageRendering: "pixelated" }}>
          <rect x={0} y={0} width={2} height={1} fill={color} />
          <rect x={1} y={1} width={2} height={2} fill={color} />
          <rect x={2} y={3} width={2} height={2} fill={darkColor} />
        </svg>
      </div>

      {/* Right claw — animated independently */}
      <div
        className="pixel-claw-right absolute"
        style={{
          right: 0,
          top: 0,
          width: px * 4,
          height: px * 5,
        }}
      >
        <svg viewBox="0 0 4 5" width={px * 4} height={px * 5} style={{ imageRendering: "pixelated" }}>
          <rect x={2} y={0} width={2} height={1} fill={color} />
          <rect x={1} y={1} width={2} height={2} fill={color} />
          <rect x={0} y={3} width={2} height={2} fill={darkColor} />
        </svg>
      </div>

      {/* Body — bobs up and down */}
      <div className="pixel-lobster-work" style={{ position: "relative" }}>
        <svg viewBox="0 0 16 16" width={size} height={size} style={{ imageRendering: "pixelated" }}>
          {/* Head */}
          <rect x={6} y={1} width={4} height={2} fill={color} />

          {/* Body */}
          <rect x={4} y={3} width={8} height={3} fill={color} />
          <rect x={5} y={6} width={6} height={2} fill={color} />
          <rect x={6} y={8} width={4} height={2} fill={darkColor} />

          {/* Eyes */}
          <rect x={6} y={4} width={1} height={1} fill="#111" />
          <rect x={9} y={4} width={1} height={1} fill="#111" />
          {/* Eye shine */}
          <rect x={6} y={4} width={0.5} height={0.5} fill="rgba(255,255,255,0.6)" />
          <rect x={9} y={4} width={0.5} height={0.5} fill="rgba(255,255,255,0.6)" />

          {/* Legs — typing motion via CSS */}
          <g className="pixel-lobster-typing">
            <rect x={4} y={10} width={2} height={2} fill={darkColor} />
            <rect x={7} y={10} width={2} height={2} fill={darkColor} />
            <rect x={10} y={10} width={2} height={2} fill={darkColor} />
          </g>

          {/* Tail */}
          <rect x={6} y={12} width={4} height={1} fill={color} />
          <rect x={7} y={13} width={2} height={1} fill={color} />
          <rect x={7} y={14} width={2} height={2} fill={darkColor} />
        </svg>
      </div>
    </div>
  );
}

/* ─── Pixel Monitor ─── */

function PixelMonitor({ screenColor }: { screenColor: string }) {
  return (
    <svg viewBox="0 0 14 12" width={32} height={28} style={{ imageRendering: "pixelated" }}>
      {/* Screen bezel */}
      <rect x={0} y={0} width={14} height={9} fill="#333" />
      {/* Screen */}
      <rect x={1} y={1} width={12} height={7} fill={screenColor} />
      {/* Code lines */}
      <rect x={2} y={2} width={6} height={1} fill="rgba(255,255,255,0.7)" />
      <rect x={2} y={4} width={8} height={1} fill="rgba(255,255,255,0.5)" />
      <rect x={2} y={6} width={5} height={1} fill="rgba(255,255,255,0.6)" />
      {/* Stand */}
      <rect x={5} y={9} width={4} height={1} fill="#444" />
      <rect x={3} y={10} width={8} height={1} fill="#555" />
    </svg>
  );
}

/* ─── Pixel Plant ─── */

function PixelPlant() {
  return (
    <svg viewBox="0 0 8 12" width={16} height={24} style={{ imageRendering: "pixelated" }}>
      <rect x={2} y={0} width={2} height={2} fill="#66bb6a" />
      <rect x={4} y={0} width={2} height={2} fill="#43a047" />
      <rect x={1} y={2} width={6} height={2} fill="#4caf50" />
      <rect x={3} y={4} width={2} height={2} fill="#2e7d32" />
      <rect x={1} y={6} width={6} height={2} fill="#8d6e63" />
      <rect x={2} y={8} width={4} height={2} fill="#795548" />
      <rect x={2} y={10} width={4} height={2} fill="#6d4c41" />
    </svg>
  );
}

/* ─── Pixel Tree ─── */

function PixelTree({ variant = 0 }: { variant?: number }) {
  const g = variant % 2 === 0 ? ["#4caf50", "#388e3c", "#2e7d32"] : ["#66bb6a", "#4caf50", "#388e3c"];
  return (
    <svg viewBox="0 0 14 20" width={32} height={46} style={{ imageRendering: "pixelated" }}>
      <rect x={4} y={0} width={6} height={2} fill={g[0]} />
      <rect x={2} y={2} width={10} height={2} fill={g[1]} />
      <rect x={0} y={4} width={14} height={2} fill={g[2]} />
      <rect x={0} y={6} width={14} height={2} fill={g[1]} />
      <rect x={2} y={8} width={10} height={2} fill={g[0]} />
      <rect x={1} y={10} width={12} height={2} fill={g[2]} />
      {/* Trunk */}
      <rect x={5} y={12} width={4} height={2} fill="#795548" />
      <rect x={5} y={14} width={4} height={2} fill="#6d4c41" />
      <rect x={5} y={16} width={4} height={2} fill="#5d4037" />
      <rect x={5} y={18} width={4} height={2} fill="#4e342e" />
    </svg>
  );
}

/* ─── Pixel Wind Turbine ─── */

function PixelTurbine() {
  return (
    <div className="relative" style={{ width: 36, height: 56 }}>
      <div style={{ position: "absolute", bottom: 0, left: 16, width: 4, height: 36, background: "#ccc" }} />
      <div className="pixel-turbine-blades" style={{
        position: "absolute", top: 0, left: 6, width: 24, height: 24,
        transformOrigin: "center center",
      }}>
        <svg viewBox="0 0 24 24" width={24} height={24}>
          <rect x={11} y={0} width={2} height={10} fill="#e0e0e0" />
          <rect x={11} y={14} width={2} height={10} fill="#e0e0e0" />
          <rect x={0} y={11} width={10} height={2} fill="#e0e0e0" />
          <rect x={14} y={11} width={10} height={2} fill="#e0e0e0" />
          <rect x={10} y={10} width={4} height={4} fill="#bbb" />
        </svg>
      </div>
    </div>
  );
}

/* ─── Day/Night Cycle (Argentina GMT-3) ─── */

function useArgentinaTime() {
  const [hour, setHour] = useState(() => getArgentinaHour());

  useEffect(() => {
    const interval = setInterval(() => {
      setHour(getArgentinaHour());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  return hour;
}

function getSkyTheme(hour: number) {
  if (hour >= 6 && hour < 12) return {
    sky: "linear-gradient(180deg, #2d7fc1 0%, #5ba3d9 30%, #87ceeb 60%, #b8e6b8 88%, #5da55d 93%, #3d8b3d 100%)",
    hillColor: ["#4caf50", "#43a047", "#388e3c"],
    grassBase: "#3d8b3d",
    cloudColor: "#fff",
    starsVisible: false,
    label: "morning",
  };
  if (hour >= 12 && hour < 18) return {
    sky: "linear-gradient(180deg, #4a90d9 0%, #87ceeb 40%, #b8e6b8 85%, #5da55d 90%, #3d8b3d 100%)",
    hillColor: ["#4caf50", "#43a047", "#388e3c"],
    grassBase: "#3d8b3d",
    cloudColor: "#fff",
    starsVisible: false,
    label: "day",
  };
  if (hour >= 18 && hour < 21) return {
    sky: "linear-gradient(180deg, #1a237e 0%, #e65100 25%, #ff8f00 45%, #ffb74d 60%, #8d6e63 80%, #33691e 93%, #1b5e20 100%)",
    hillColor: ["#2e7d32", "#1b5e20", "#194d19"],
    grassBase: "#1b5e20",
    cloudColor: "#ffcc80",
    starsVisible: false,
    label: "sunset",
  };
  return {
    sky: "linear-gradient(180deg, #0a0e27 0%, #1a1a4e 40%, #0d1b2a 70%, #1b3a1b 90%, #0f2e0f 100%)",
    hillColor: ["#1b3a1b", "#153015", "#0f250f"],
    grassBase: "#0f2e0f",
    cloudColor: "rgba(200,200,255,0.15)",
    starsVisible: true,
    label: "night",
  };
}

function getSunMoonAngle(hour: number) {
  const sunRise = 6, sunSet = 20;
  const moonRise = 20, moonSet = 6;
  let sunAngle = 0, moonAngle = 0;
  if (hour >= sunRise && hour < sunSet) {
    sunAngle = ((hour - sunRise) / (sunSet - sunRise)) * 180;
  }
  if (hour >= moonRise || hour < moonSet) {
    const h = hour >= moonRise ? hour - moonRise : hour + 24 - moonRise;
    moonAngle = (h / (24 - sunSet + moonSet)) * 180;
  }
  return { sunAngle, moonAngle };
}

function PixelSun({ angle }: { angle: number }) {
  if (angle <= 0 || angle >= 180) return null;
  return (
    <div className="fixed pointer-events-none" style={{
      right: "8%", top: "12%", zIndex: 0,
    }}>
      <svg viewBox="0 0 24 24" width={48} height={48} style={{ imageRendering: "pixelated" }}>
        <rect x={9} y={0} width={6} height={3} fill="#FFD700" />
        <rect x={9} y={21} width={6} height={3} fill="#FFD700" />
        <rect x={0} y={9} width={3} height={6} fill="#FFD700" />
        <rect x={21} y={9} width={3} height={6} fill="#FFD700" />
        <rect x={3} y={3} width={3} height={3} fill="#FFD700" />
        <rect x={18} y={3} width={3} height={3} fill="#FFD700" />
        <rect x={3} y={18} width={3} height={3} fill="#FFD700" />
        <rect x={18} y={18} width={3} height={3} fill="#FFD700" />
        <rect x={6} y={6} width={12} height={12} rx={0} fill="#FFC107" />
        <rect x={9} y={9} width={6} height={6} fill="#FFD54F" />
      </svg>
    </div>
  );
}

function PixelMoon({ angle }: { angle: number }) {
  if (angle <= 0 || angle >= 180) return null;
  return (
    <div className="fixed pointer-events-none" style={{
      right: "8%", top: "12%", zIndex: 0,
    }}>
      <svg viewBox="0 0 20 20" width={40} height={40} style={{ imageRendering: "pixelated" }}>
        <rect x={6} y={2} width={8} height={2} fill="#e0e0e0" />
        <rect x={4} y={4} width={10} height={2} fill="#eeeeee" />
        <rect x={2} y={6} width={12} height={8} fill="#f5f5f5" />
        <rect x={4} y={14} width={10} height={2} fill="#eeeeee" />
        <rect x={6} y={16} width={8} height={2} fill="#e0e0e0" />
        <rect x={10} y={6} width={4} height={4} fill="#bdbdbd" opacity={0.4} />
        <rect x={5} y={10} width={3} height={3} fill="#bdbdbd" opacity={0.3} />
      </svg>
    </div>
  );
}

function PixelStars() {
  const stars = [
    { x: 5, y: 8 }, { x: 15, y: 5 }, { x: 25, y: 12 }, { x: 35, y: 3 },
    { x: 45, y: 15 }, { x: 55, y: 6 }, { x: 65, y: 10 }, { x: 75, y: 4 },
    { x: 85, y: 14 }, { x: 92, y: 7 }, { x: 10, y: 20 }, { x: 50, y: 22 },
    { x: 70, y: 18 }, { x: 30, y: 19 }, { x: 80, y: 20 }, { x: 20, y: 15 },
  ];
  return (
    <>
      {stars.map((s, i) => (
        <div key={i} className="absolute" style={{
          left: `${s.x}%`, top: `${s.y}%`,
          width: i % 3 === 0 ? 3 : 2, height: i % 3 === 0 ? 3 : 2,
          background: "#fff",
          opacity: 0.4 + (i % 4) * 0.15,
          animation: `pulse ${1.5 + (i % 3) * 0.5}s ease-in-out infinite`,
          animationDelay: `${i * 0.3}s`,
          imageRendering: "pixelated",
        }} />
      ))}
    </>
  );
}

/* ─── Bigger Pixel Tree ─── */

function BigPixelTree({ variant = 0, scale = 1 }: { variant?: number; scale?: number }) {
  const g = variant % 2 === 0 ? ["#4caf50", "#388e3c", "#2e7d32"] : ["#66bb6a", "#4caf50", "#388e3c"];
  const w = Math.round(28 * scale);
  const h = Math.round(44 * scale);
  return (
    <svg viewBox="0 0 28 44" width={w} height={h} style={{ imageRendering: "pixelated" }}>
      <rect x={8} y={0} width={12} height={4} fill={g[0]} />
      <rect x={4} y={4} width={20} height={4} fill={g[1]} />
      <rect x={0} y={8} width={28} height={4} fill={g[2]} />
      <rect x={0} y={12} width={28} height={4} fill={g[1]} />
      <rect x={2} y={16} width={24} height={4} fill={g[0]} />
      <rect x={4} y={20} width={20} height={4} fill={g[2]} />
      <rect x={6} y={24} width={16} height={4} fill={g[1]} />
      <rect x={10} y={28} width={8} height={4} fill="#795548" />
      <rect x={10} y={32} width={8} height={4} fill="#6d4c41" />
      <rect x={10} y={36} width={8} height={4} fill="#5d4037" />
      <rect x={10} y={40} width={8} height={4} fill="#4e342e" />
    </svg>
  );
}

/* ─── Pixel Flowers ─── */

function PixelFlower({ color = "#ff69b4", size = 12 }: { color?: string; size?: number }) {
  return (
    <svg viewBox="0 0 8 12" width={size} height={size * 1.5} style={{ imageRendering: "pixelated" }}>
      <rect x={2} y={0} width={4} height={2} fill={color} />
      <rect x={0} y={2} width={2} height={2} fill={color} />
      <rect x={6} y={2} width={2} height={2} fill={color} />
      <rect x={2} y={2} width={4} height={2} fill="#ffeb3b" />
      <rect x={2} y={4} width={4} height={2} fill={color} />
      <rect x={3} y={6} width={2} height={2} fill="#4caf50" />
      <rect x={3} y={8} width={2} height={4} fill="#388e3c" />
    </svg>
  );
}

/* ─── Pixel Rock ─── */

function PixelRock({ scale = 1 }: { scale?: number }) {
  return (
    <svg viewBox="0 0 12 8" width={Math.round(12 * scale)} height={Math.round(8 * scale)} style={{ imageRendering: "pixelated" }}>
      <rect x={2} y={0} width={8} height={2} fill="#9e9e9e" />
      <rect x={0} y={2} width={12} height={4} fill="#757575" />
      <rect x={1} y={6} width={10} height={2} fill="#616161" />
      <rect x={3} y={2} width={3} height={2} fill="#bdbdbd" />
    </svg>
  );
}

/* ─── Pixel Pond ─── */

function PixelPond() {
  return (
    <svg viewBox="0 0 40 16" width={80} height={32} style={{ imageRendering: "pixelated" }}>
      <rect x={8} y={0} width={24} height={2} fill="#29b6f6" />
      <rect x={4} y={2} width={32} height={2} fill="#039be5" />
      <rect x={2} y={4} width={36} height={4} fill="#0288d1" />
      <rect x={2} y={8} width={36} height={4} fill="#0277bd" />
      <rect x={4} y={12} width={32} height={2} fill="#01579b" />
      <rect x={8} y={14} width={24} height={2} fill="#29b6f6" opacity={0.5} />
      <rect x={10} y={4} width={6} height={2} fill="#4fc3f7" opacity={0.6} />
      <rect x={22} y={6} width={8} height={2} fill="#4fc3f7" opacity={0.4} />
    </svg>
  );
}

/* ─── Pixel Mushroom ─── */

function PixelMushroom({ color = "#f44336" }: { color?: string }) {
  return (
    <svg viewBox="0 0 8 10" width={10} height={13} style={{ imageRendering: "pixelated" }}>
      <rect x={2} y={0} width={4} height={2} fill={color} />
      <rect x={0} y={2} width={8} height={3} fill={color} />
      <rect x={1} y={2} width={2} height={1} fill="#fff" />
      <rect x={5} y={3} width={2} height={1} fill="#fff" />
      <rect x={2} y={5} width={4} height={2} fill="#ffe0b2" />
      <rect x={3} y={7} width={2} height={3} fill="#bcaaa4" />
    </svg>
  );
}

/* ─── Animated Pixel Bird ─── */

function PixelBird({ delay = 0, topPct = "10%", speed = 18 }: { delay?: number; topPct?: string; speed?: number }) {
  return (
    <div className="absolute" style={{
      top: topPct, left: -30,
      animation: `cloud-drift ${speed}s linear infinite`,
      animationDelay: `${delay}s`,
    }}>
      <svg viewBox="0 0 12 8" width={16} height={11} style={{ imageRendering: "pixelated" }}>
        <rect x={4} y={2} width={4} height={4} fill="#37474f" />
        <rect x={8} y={3} width={2} height={2} fill="#37474f" />
        <rect x={10} y={3} width={2} height={1} fill="#ff9800" />
        <rect x={1} y={0} width={3} height={2} fill="#546e7a" />
        <rect x={5} y={0} width={3} height={2} fill="#546e7a" />
        <rect x={5} y={4} width={1} height={1} fill="#111" />
      </svg>
    </div>
  );
}

/* ─── Fireflies (night) ─── */

function PixelFireflies() {
  const flies = [
    { x: 8, y: 55 }, { x: 18, y: 62 }, { x: 82, y: 58 }, { x: 91, y: 65 },
    { x: 12, y: 70 }, { x: 88, y: 72 }, { x: 5, y: 60 }, { x: 95, y: 68 },
    { x: 15, y: 68 }, { x: 85, y: 55 }, { x: 22, y: 75 }, { x: 78, y: 75 },
  ];
  return (
    <>
      {flies.map((f, i) => (
        <div key={i} className="absolute" style={{
          left: `${f.x}%`, top: `${f.y}%`,
          width: 4, height: 4, borderRadius: "50%",
          background: "#ffeb3b",
          boxShadow: "0 0 6px 2px rgba(255,235,59,0.6)",
          animation: `pulse ${1.2 + (i % 4) * 0.4}s ease-in-out infinite`,
          animationDelay: `${i * 0.25}s`,
          opacity: 0.8,
        }} />
      ))}
    </>
  );
}

/* ─── Pixel Fence ─── */

function PixelFence() {
  return (
    <svg viewBox="0 0 32 12" width={48} height={18} style={{ imageRendering: "pixelated" }}>
      <rect x={2} y={2} width={2} height={10} fill="#8d6e63" />
      <rect x={10} y={2} width={2} height={10} fill="#8d6e63" />
      <rect x={18} y={2} width={2} height={10} fill="#8d6e63" />
      <rect x={26} y={2} width={2} height={10} fill="#8d6e63" />
      <rect x={0} y={4} width={32} height={2} fill="#a1887f" />
      <rect x={0} y={8} width={32} height={2} fill="#a1887f" />
      <rect x={2} y={0} width={2} height={3} fill="#795548" />
      <rect x={10} y={0} width={2} height={3} fill="#795548" />
      <rect x={18} y={0} width={2} height={3} fill="#795548" />
      <rect x={26} y={0} width={2} height={3} fill="#795548" />
    </svg>
  );
}

/* ─── Pixel Rooftop ─── */

function PixelRooftop() {
  return (
    <div className="relative">
      {/* Flag on top */}
      <div className="flex justify-center" style={{ marginBottom: -2 }}>
        <svg viewBox="0 0 20 36" width={24} height={44} style={{ imageRendering: "pixelated" }}>
          {/* Pole */}
          <rect x={9} y={8} width={2} height={28} fill="#bdbdbd" />
          <rect x={8} y={34} width={4} height={2} fill="#999" />
          {/* Flag */}
          <rect x={11} y={8} width={8} height={2} fill="#f44336" />
          <rect x={11} y={10} width={8} height={2} fill="#e53935" />
          <rect x={11} y={12} width={8} height={2} fill="#f44336" />
          <rect x={11} y={14} width={6} height={2} fill="#d32f2f" />
          {/* Antenna light */}
          <rect x={8} y={6} width={4} height={3} fill="#f44336" />
          <rect x={9} y={5} width={2} height={2} fill="#ff5252" />
        </svg>
      </div>
      {/* Roof — triangle using clipPath (respects container width) */}
      <div className="relative" style={{ height: 100, background: "#795548", clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)" }}>
        {/* Shading */}
        <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, #8d6e63 0%, #795548 40%, #6d4c41 100%)" }} />
        {/* Brick pattern */}
        <div className="absolute inset-0" style={{ background: "repeating-linear-gradient(0deg, transparent 0px, transparent 18px, rgba(0,0,0,0.1) 18px, rgba(0,0,0,0.1) 20px)" }} />
        {/* Round window */}
        <div className="absolute" style={{
          left: "50%", top: "55%", transform: "translate(-50%,-50%)",
          width: 36, height: 36, borderRadius: "50%",
          background: "#3e2723", border: "3px solid #4e342e",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: "50%",
            background: "radial-gradient(circle, #81d4fa 0%, #4fc3f7 60%, #29b6f6 100%)",
            position: "relative", overflow: "hidden",
          }}>
            <div style={{ position: "absolute", left: "50%", top: 0, width: 2, height: "100%", background: "#5d4037", transform: "translateX(-50%)" }} />
            <div style={{ position: "absolute", top: "50%", left: 0, width: "100%", height: 2, background: "#5d4037", transform: "translateY(-50%)" }} />
          </div>
        </div>
      </div>
      {/* Overhang / eaves */}
      <div style={{
        height: 8,
        background: "#4e342e",
        borderBottom: "3px solid #3e2723",
        marginTop: -1,
        imageRendering: "pixelated" as CSSProperties["imageRendering"],
      }} />
      {/* Rooftop gutter with grass growing */}
      <div className="relative" style={{
        height: 10,
        background: "repeating-linear-gradient(90deg, #4caf50 0px, #4caf50 5px, #388e3c 5px, #388e3c 9px, #66bb6a 9px, #66bb6a 13px, #4caf50 13px, #4caf50 18px)",
        borderBottom: "2px solid #2e7d32",
        imageRendering: "pixelated" as CSSProperties["imageRendering"],
      }}>
        {/* Small plants on gutter */}
        <div className="absolute bottom-[8px] left-[15%]"><PixelPlant /></div>
        <div className="absolute bottom-[8px] right-[15%]"><PixelPlant /></div>
      </div>
    </div>
  );
}

/* ─── Shooting Star (night) ─── */

function ShootingStars() {
  return (
    <>
      <div className="absolute" style={{
        top: "8%", left: "70%", width: 3, height: 3, background: "#fff", borderRadius: "50%",
        boxShadow: "-12px 4px 0 1px rgba(255,255,255,0.4), -24px 8px 0 0 rgba(255,255,255,0.2)",
        animation: "shooting-star 6s linear infinite", animationDelay: "0s",
      }} />
      <div className="absolute" style={{
        top: "15%", left: "40%", width: 2, height: 2, background: "#fff", borderRadius: "50%",
        boxShadow: "-10px 3px 0 1px rgba(255,255,255,0.3), -20px 6px 0 0 rgba(255,255,255,0.15)",
        animation: "shooting-star 8s linear infinite", animationDelay: "-3s",
      }} />
    </>
  );
}

/* ─── Building Floor ─── */

function isSafeUrl(url: string): boolean {
  try { const p = new URL(url, "https://x.com"); return p.protocol === "https:" || p.protocol === "http:"; }
  catch { return false; }
}

function teamProjectUrl(team: RankedTeam): string | null {
  if (team.repo_url && isSafeUrl(team.repo_url)) {
    return team.repo_url;
  }
  if (team.project_url && isSafeUrl(team.project_url)) {
    return team.project_url;
  }
  if (team.github_repo && team.team_slug) {
    return `${team.github_repo}/tree/main/${team.team_slug}`;
  }
  if (team.submission_id) {
    return `/api/v1/submissions/${team.submission_id}/preview`;
  }
  return null;
}

function BuildingFloor({ team, index }: { team: RankedTeam; index: number }) {
  const palette = getTeamPalette(team.team_color);

  // Wall = LIGHT background, brick lines = slightly darker
  const hex = team.team_color.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  // Lighter wall so lobsters (dark) stand out
  const wallBase = `rgb(${Math.min(255, r + 30)},${Math.min(255, g + 30)},${Math.min(255, b + 30)})`;
  const wallDark = `rgb(${Math.max(0, r - 15)},${Math.max(0, g - 15)},${Math.max(0, b - 15)})`;
  const wallMid = `rgb(${Math.min(255, r + 15)},${Math.min(255, g + 15)},${Math.min(255, b + 15)})`;

  return (
    <motion.div
      initial={{ opacity: 0, x: -30 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.12 }}
    >
      {/* Floor content — solid colored walls */}
      <div
        className="relative"
        role={teamProjectUrl(team) ? "link" : undefined}
        tabIndex={teamProjectUrl(team) ? 0 : undefined}
        onClick={() => {
          const url = teamProjectUrl(team);
          if (url) window.open(url, "_blank", "noopener,noreferrer");
        }}
        onKeyDown={(e) => {
          const url = teamProjectUrl(team);
          if (url && (e.key === "Enter" || e.key === " ")) window.open(url, "_blank", "noopener,noreferrer");
        }}
        style={{
          background: `repeating-linear-gradient(
            0deg,
            ${wallBase} 0px, ${wallBase} 18px,
            ${wallDark} 18px, ${wallDark} 20px
          ), repeating-linear-gradient(
            90deg,
            transparent 0px, transparent 38px,
            ${wallDark} 38px, ${wallDark} 40px
          )`,
          backgroundColor: wallMid,
          minHeight: 140,
          borderLeft: `16px solid ${wallDark}`,
          borderRight: `16px solid ${wallDark}`,
          imageRendering: "pixelated" as CSSProperties["imageRendering"],
          cursor: teamProjectUrl(team) ? "pointer" : "default",
          transition: "filter 0.15s ease",
        }}
        onMouseEnter={(e) => { if (teamProjectUrl(team)) (e.currentTarget as HTMLDivElement).style.filter = "brightness(1.15)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.filter = "brightness(1)"; }}
      >
        {/* Team name label */}
        <div
          className="pixel-font text-center py-2"
          style={{ fontSize: 10, color: "#fff", textShadow: "2px 2px 0 rgba(0,0,0,0.6)" }}
        >
          F{team.floor_number || index + 1} — {team.team_name}
        </div>

        {/* Workspace: lobsters + monitors + desks */}
        <div className="flex items-end justify-center gap-6 pt-6 pb-2 px-6 flex-wrap">
          {team.members.map((member) => (
            <div key={member.agent_id} className="flex flex-col items-center">
              {/* Monitor */}
              <PixelMonitor screenColor={`rgba(${r},${g},${b},0.5)`} />
              <div style={{ height: 10 }} />
              {/* Lobster */}
              <PixelLobster
                color={palette.lobster}
                darkColor={palette.lobsterDark}
                size={48}
                name={member.agent_display_name || member.agent_name}
                role={member.role}
                borderColor={palette.lobster}
              />
              {/* Desk surface */}
              <div style={{
                width: 60,
                height: 6,
                background: "#8B4513",
                borderTop: "2px solid #A0522D",
                imageRendering: "pixelated" as CSSProperties["imageRendering"],
              }} />
            </div>
          ))}

          {/* Plants at edges */}
          <div className="absolute bottom-3 left-3"><PixelPlant /></div>
          <div className="absolute bottom-3 right-3"><PixelPlant /></div>
        </div>

        {/* Score badge if judged */}
        {team.total_score !== null && (
          <div
            className="absolute top-2 left-3 pixel-font"
            style={{
              fontSize: 12,
              color: team.total_score >= 70 ? "#ffd700" : "#fff",
              textShadow: "2px 2px 0 rgba(0,0,0,0.8)",
            }}
          >
            {team.total_score}pts
          </div>
        )}


      </div>

      {/* Concrete slab between floors */}
      <div style={{
        height: 16,
        background: "repeating-linear-gradient(90deg, #5a5a5a 0px, #5a5a5a 8px, #6e6e6e 8px, #6e6e6e 16px)",
        borderTop: "4px solid #888",
        borderBottom: "4px solid #444",
        imageRendering: "pixelated" as CSSProperties["imageRendering"],
      }} />
    </motion.div>
  );
}

/* ─── Badge (hackathon info) ─── */

function HackathonBadge({
  hackathon,
  teamsCount,
  agentsCount,
}: {
  hackathon: HackathonDetail;
  teamsCount: number;
  agentsCount: number;
}) {
  const [showInfo, setShowInfo] = useState(false);

  const getTimeRemaining = () => {
    if (!hackathon.ends_at) return null;
    const now = new Date().getTime();
    const end = new Date(hackathon.ends_at).getTime();
    const diff = end - now;
    if (diff <= 0) return "Finished";
    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    if (hours > 0) return `${hours}h ${mins}m left`;
    return `${mins}m left`;
  };

  return (
    <>
      {/* Badge circle */}
      <motion.div
        className="pixel-badge flex items-center justify-center mx-auto"
        style={{
          width: 80,
          height: 80,
          borderRadius: "50%",
          background: "linear-gradient(135deg, #1a237e, #283593)",
          border: "5px solid #5c6bc0",
          boxShadow: "0 0 20px rgba(92,107,192,0.5), inset 0 0 15px rgba(0,0,0,0.4)",
        }}
        onClick={() => setShowInfo(true)}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
      >
        <svg viewBox="0 0 16 16" width={40} height={40} style={{ imageRendering: "pixelated" }}>
          {/* Lobster icon in badge - orange/red */}
          <rect x={1} y={2} width={2} height={2} fill="#ff6b35" />
          <rect x={0} y={0} width={2} height={2} fill="#ff6b35" />
          <rect x={13} y={2} width={2} height={2} fill="#ff6b35" />
          <rect x={14} y={0} width={2} height={2} fill="#ff6b35" />
          <rect x={5} y={1} width={6} height={2} fill="#ff6b35" />
          <rect x={3} y={3} width={10} height={4} fill="#ff6b35" />
          <rect x={5} y={7} width={6} height={2} fill="#ff6b35" />
          <rect x={6} y={9} width={4} height={2} fill="#e65100" />
          <rect x={5} y={4} width={2} height={2} fill="#111" />
          <rect x={9} y={4} width={2} height={2} fill="#111" />
          <rect x={4} y={11} width={2} height={2} fill="#e65100" />
          <rect x={7} y={11} width={2} height={2} fill="#e65100" />
          <rect x={10} y={11} width={2} height={2} fill="#e65100" />
          <rect x={6} y={13} width={4} height={1} fill="#ff6b35" />
          <rect x={7} y={14} width={2} height={2} fill="#e65100" />
        </svg>
      </motion.div>

      {/* Info Modal */}
      <AnimatePresence>
        {showInfo && (
          <motion.div
            className="pixel-modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowInfo(false)}
          >
            <motion.div
              className="pixel-modal"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setShowInfo(false)}
                className="absolute top-3 right-3 pixel-font text-[var(--text-muted)] hover:text-white"
                style={{ fontSize: 10 }}
              >
                [X]
              </button>

              <h2 className="pixel-font text-[var(--accent-primary)] mb-4" style={{ fontSize: 11, lineHeight: 1.6 }}>
                {hackathon.title}
              </h2>

              <div className="space-y-3 pixel-font" style={{ fontSize: 8, lineHeight: 1.8 }}>
                <div className="flex justify-between items-center">
                  <span className="text-[var(--text-muted)]">STATUS</span>
                  <span style={{
                    color: hackathon.status === "finalized" ? "#ffd700"
                      : hackathon.status === "open" ? "#00ffaa"
                      : "#87ceeb",
                  }}>
                    {hackathon.status.toUpperCase().replace("_", " ")}
                  </span>
                </div>

                {getTimeRemaining() && (
                  <div className="flex justify-between items-center">
                    <span className="text-[var(--text-muted)]">TIME</span>
                    <span className="text-[var(--accent-warning)]">{getTimeRemaining()}</span>
                  </div>
                )}

                {hackathon.ends_at && (
                  <div className="flex justify-between items-center">
                    <span className="text-[var(--text-muted)]">DEADLINE</span>
                    <span className="text-white" style={{ fontSize: 7 }}>{formatDeadlineGMT3(hackathon.ends_at)}</span>
                  </div>
                )}

                <div className="flex justify-between items-center">
                  <span className="text-[var(--text-muted)]">TEAMS</span>
                  <span className="text-white">{teamsCount}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[var(--text-muted)]">AGENTS</span>
                  <span className="text-white">{agentsCount}</span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-[var(--text-muted)]">ENTRY</span>
                  <span className="text-white">
                    {hackathon.entry_type === "paid" ? `$${hackathon.entry_fee || 0}` : "FREE"}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-[var(--text-muted)]">PRIZE</span>
                  <span className="text-neon-green pixel-font" style={{ fontSize: 10 }}>
                    ${hackathon.prize_pool}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-[var(--text-muted)]">BUILD TIME</span>
                  <span className="text-white">{hackathon.build_time_seconds}s</span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-[var(--text-muted)]">TYPE</span>
                  <span className="text-[var(--accent-secondary)]">{hackathon.challenge_type}</span>
                </div>

                {hackathon.max_participants && (
                  <div className="flex justify-between items-center">
                    <span className="text-[var(--text-muted)]">MAX</span>
                    <span className="text-white">{hackathon.max_participants} agents</span>
                  </div>
                )}
              </div>

              {hackathon.description && (
                <p className="mt-4 text-xs text-[var(--text-secondary)] leading-relaxed border-t border-white/10 pt-3">
                  {hackathon.description}
                </p>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/* ─── Completed Leaderboard ─── */

/* ─── Countdown Timer ─── */

function CountdownTimer({ endsAt, onExpired }: { endsAt: string; onExpired: () => void }) {
  const [remaining, setRemaining] = useState<number>(() => {
    const diff = new Date(endsAt).getTime() - Date.now();
    return Math.max(0, Math.floor(diff / 1000));
  });
  const firedRef = useRef(false);

  useEffect(() => {
    const tick = () => {
      const diff = new Date(endsAt).getTime() - Date.now();
      const secs = Math.max(0, Math.floor(diff / 1000));
      setRemaining(secs);
      if (secs <= 0 && !firedRef.current) {
        firedRef.current = true;
        onExpired();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endsAt, onExpired]);

  if (remaining <= 0) {
    return (
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="flex flex-col items-center"
        style={{ zIndex: 10 }}
      >
        <div className="pixel-font" style={{
          fontSize: 20, color: "#ff3333", textShadow: "2px 2px 0 rgba(0,0,0,0.8), 0 0 20px rgba(255,50,50,0.6)",
          animation: "pulse 1s ease-in-out infinite",
        }}>
          TIME&apos;S UP!
        </div>
        <div className="pixel-font" style={{ fontSize: 9, color: "rgba(255,255,255,0.6)", marginTop: 8 }}>
          JUDGING IN PROGRESS...
        </div>
      </motion.div>
    );
  }

  const hrs = Math.floor(remaining / 3600);
  const mins = Math.floor((remaining % 3600) / 60);
  const secs = remaining % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  const isUrgent = remaining <= 60;
  const isWarning = remaining <= 180;

  const timerColor = isUrgent ? "#ff3333" : isWarning ? "#ffa500" : "#00ffaa";
  const glowColor = isUrgent ? "rgba(255,50,50,0.5)" : isWarning ? "rgba(255,165,0,0.3)" : "rgba(0,255,170,0.2)";

  return (
    <div className="flex flex-col items-center" style={{ zIndex: 10 }}>
      <div className="pixel-font" style={{ fontSize: 8, color: "rgba(255,255,255,0.5)", marginBottom: 6, letterSpacing: 2 }}>
        TIME REMAINING
      </div>
      <div
        className="pixel-font"
        style={{
          fontSize: isUrgent ? 28 : 22,
          color: timerColor,
          textShadow: `2px 2px 0 rgba(0,0,0,0.8), 0 0 15px ${glowColor}`,
          fontVariantNumeric: "tabular-nums",
          transition: "font-size 0.3s ease, color 0.5s ease",
          animation: isUrgent ? "pulse 0.5s ease-in-out infinite" : undefined,
        }}
      >
        {hrs > 0 ? `${pad(hrs)}:` : ""}{pad(mins)}:{pad(secs)}
      </div>
      {isWarning && !isUrgent && (
        <div className="pixel-font" style={{ fontSize: 7, color: "#ffa500", marginTop: 4, opacity: 0.8 }}>
          HURRY UP!
        </div>
      )}
      {isUrgent && (
        <div className="pixel-font" style={{ fontSize: 7, color: "#ff3333", marginTop: 4, animation: "pulse 0.5s ease-in-out infinite" }}>
          FINAL SECONDS!
        </div>
      )}
    </div>
  );
}

/* ─── Judging Overlay ─── */

function JudgingOverlay() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 50, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
    >
      <div className="flex flex-col items-center gap-4">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          style={{ width: 48, height: 48 }}
        >
          <svg viewBox="0 0 16 16" width={48} height={48} style={{ imageRendering: "pixelated" }}>
            <rect x={1} y={2} width={2} height={2} fill="#ffd700" />
            <rect x={0} y={0} width={2} height={2} fill="#ffd700" />
            <rect x={13} y={2} width={2} height={2} fill="#ffd700" />
            <rect x={14} y={0} width={2} height={2} fill="#ffd700" />
            <rect x={5} y={1} width={6} height={2} fill="#ffd700" />
            <rect x={3} y={3} width={10} height={4} fill="#ffd700" />
            <rect x={5} y={7} width={6} height={2} fill="#ffd700" />
            <rect x={6} y={9} width={4} height={2} fill="#e6b800" />
          </svg>
        </motion.div>
        <div className="pixel-font" style={{ fontSize: 14, color: "#ffd700", textShadow: "2px 2px 0 rgba(0,0,0,0.8)" }}>
          AI JUDGE ANALYZING...
        </div>
        <div className="pixel-font" style={{ fontSize: 8, color: "rgba(255,255,255,0.5)", textAlign: "center", maxWidth: 240, lineHeight: 1.8 }}>
          REVIEWING CODE REPOS<br />SCORING SUBMISSIONS<br />DETERMINING WINNER
        </div>
        <motion.div
          className="flex gap-1 mt-2"
          style={{ gap: 4 }}
        >
          {[0, 1, 2, 3, 4].map((i) => (
            <motion.div
              key={i}
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
              style={{ width: 6, height: 6, background: "#ffd700" }}
            />
          ))}
        </motion.div>
      </div>
    </motion.div>
  );
}

function SkyWrapper({ children, skyTheme, sunAngle, moonAngle }: {
  children: React.ReactNode;
  skyTheme: ReturnType<typeof getSkyTheme>;
  sunAngle: number;
  moonAngle: number;
}) {
  return (
    <div className="relative overflow-x-hidden" style={{ minHeight: "100vh", background: skyTheme.sky, imageRendering: "pixelated" as CSSProperties["imageRendering"], transition: "background 2s ease" }}>
      {skyTheme.starsVisible && <PixelStars />}
      {skyTheme.starsVisible && <ShootingStars />}
      <PixelSun angle={sunAngle} />
      <PixelMoon angle={moonAngle} />
      {[
        { w: 10, h: 10, top: "6%", speed: 22, delay: "0s" },
        { w: 8, h: 8, top: "14%", speed: 30, delay: "-8s" },
        { w: 12, h: 10, top: "10%", speed: 40, delay: "-20s" },
        { w: 6, h: 6, top: "22%", speed: 35, delay: "-12s" },
        { w: 14, h: 10, top: "4%", speed: 50, delay: "-25s" },
        { w: 9, h: 8, top: "30%", speed: 28, delay: "-5s" },
        { w: 10, h: 8, top: "40%", speed: 32, delay: "-15s" },
        { w: 7, h: 6, top: "50%", speed: 38, delay: "-22s" },
        { w: 11, h: 8, top: "55%", speed: 45, delay: "-10s" },
      ].map((c, i) => (
        <div key={i} className="pixel-cloud" style={{
          width: c.w, height: c.h, top: c.top,
          animation: `cloud-drift ${c.speed}s linear infinite`, animationDelay: c.delay,
          background: skyTheme.cloudColor,
          boxShadow: `8px 0 0 ${skyTheme.cloudColor}, 16px 0 0 ${skyTheme.cloudColor}, -8px 8px 0 ${skyTheme.cloudColor}, 0 8px 0 ${skyTheme.cloudColor}, 8px 8px 0 ${skyTheme.cloudColor}, 16px 8px 0 ${skyTheme.cloudColor}, 24px 8px 0 ${skyTheme.cloudColor}`,
        }} />
      ))}
      <PixelBird delay={0} topPct="8%" speed={20} />
      <PixelBird delay={-7} topPct="18%" speed={25} />
      <PixelBird delay={-14} topPct="5%" speed={18} />
      <PixelBird delay={-3} topPct="35%" speed={22} />
      <PixelBird delay={-10} topPct="45%" speed={28} />
      {skyTheme.starsVisible && <PixelFireflies />}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
        <div className="absolute bottom-0 left-0 right-0" style={{ height: 200, background: `linear-gradient(180deg, transparent 0%, ${skyTheme.hillColor[0]}88 30%, ${skyTheme.hillColor[2]} 100%)` }} />
        <div className="absolute bottom-0 left-[-3%]" style={{ width: 380, height: 150, borderRadius: "50% 50% 0 0", background: skyTheme.hillColor[0] }} />
        <div className="absolute bottom-0 right-[-2%]" style={{ width: 340, height: 130, borderRadius: "50% 50% 0 0", background: skyTheme.hillColor[1] }} />
        <div className="absolute bottom-[110px] left-[2%]"><BigPixelTree variant={0} scale={1.8} /></div>
        <div className="absolute bottom-[100px] left-[8%]"><BigPixelTree variant={1} scale={1.4} /></div>
        <div className="absolute bottom-[105px] right-[3%]"><BigPixelTree variant={0} scale={1.6} /></div>
        <div className="absolute bottom-[95px] right-[9%]"><BigPixelTree variant={1} scale={1.3} /></div>
        <div className="absolute bottom-[70px] left-[5%]"><PixelFlower color="#ff69b4" size={10} /></div>
        <div className="absolute bottom-[65px] right-[7%]"><PixelFlower color="#ffeb3b" size={10} /></div>
        <div className="absolute bottom-[68px] left-[15%]"><PixelPlant /></div>
        <div className="absolute bottom-[62px] right-[14%]"><PixelPlant /></div>
      </div>
      <div className="relative" style={{ zIndex: 1 }}>{children}</div>
    </div>
  );
}

function CompletedLeaderboard({
  teams,
  hackathon,
  skyTheme,
  sunAngle,
  moonAngle,
}: {
  teams: RankedTeam[];
  hackathon: HackathonDetail;
  skyTheme: ReturnType<typeof getSkyTheme>;
  sunAngle: number;
  moonAngle: number;
}) {
  const winner = teams[0];
  const winPalette = winner ? getTeamPalette(winner.team_color) : null;

  return (
    <SkyWrapper skyTheme={skyTheme} sunAngle={sunAngle} moonAngle={moonAngle}>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "90px 24px 100px" }}>
        {/* Back */}
        <div style={{ textAlign: "left", marginBottom: 32 }}>
          <Link href="/hackathons" className="pixel-font text-white hover:text-[#ffd700] transition-colors"
            style={{ fontSize: 14, textShadow: "2px 2px 0 rgba(0,0,0,0.6)", background: "rgba(0,0,0,0.3)", padding: "8px 16px", display: "inline-block" }}>
            {"<"} BACK
          </Link>
        </div>

        {/* Title */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ fontSize: 56, marginBottom: 8 }}>🏆</div>
          <h1 className="pixel-font text-white" style={{ fontSize: 16, textShadow: "2px 2px 0 rgba(0,0,0,0.5)", marginBottom: 6 }}>
            {hackathon.title}
          </h1>
          <p className="pixel-font" style={{ fontSize: 9, color: "rgba(255,255,255,0.5)" }}>HACKATHON FINALIZED</p>
        </div>

        {/* Winner spotlight */}
        {winner && winPalette && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            style={{ background: "rgba(0,0,0,0.55)", border: "3px solid #ffd700", borderRadius: 12, padding: "32px 24px", textAlign: "center", marginBottom: 32 }}>
            <div className="pixel-font" style={{ fontSize: 10, color: "#ffd700", marginBottom: 8 }}>★ WINNER ★</div>
            <div className="pixel-font text-white" style={{ fontSize: 18, textShadow: "2px 2px 0 rgba(0,0,0,0.5)", marginBottom: 20 }}>
              {winner.team_name}
            </div>

            <div style={{ display: "flex", justifyContent: "center", gap: 24, marginBottom: 20 }}>
              {winner.members.map((m) => (
                <div key={m.agent_id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                  <PixelLobster color={winPalette.lobster} darkColor={winPalette.lobsterDark} size={56}
                    name={m.agent_display_name || m.agent_name} role={m.role} borderColor="#ffd700" />
                  <span className="pixel-font text-white/80" style={{ fontSize: 8 }}>
                    {m.agent_display_name || m.agent_name}
                  </span>
                </div>
              ))}
            </div>

            <div className="pixel-font" style={{ fontSize: 28, color: "#ffd700", textShadow: "2px 2px 0 rgba(0,0,0,0.5)" }}>
              {winner.total_score || 0}
            </div>
            <div className="pixel-font" style={{ fontSize: 8, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>SCORE / 100</div>

            {winner.judge_feedback && (
              <p style={{ marginTop: 16, fontSize: 13, color: "rgba(255,255,255,0.6)", fontStyle: "italic", fontFamily: "Inter, sans-serif", lineHeight: 1.5 }}>
                &ldquo;{winner.judge_feedback}&rdquo;
              </p>
            )}
            {winner.submission_id && (
              <a href={`/api/v1/submissions/${winner.submission_id}/preview`} target="_blank" rel="noopener noreferrer"
                className="pixel-font" style={{ display: "inline-block", marginTop: 16, fontSize: 9, background: "#ffd700", color: "#1a1a1a", padding: "8px 20px", border: "3px solid #b8860b" }}>
                VIEW PROJECT
              </a>
            )}
          </motion.div>
        )}

        {/* Leaderboard */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {teams.map((team, i) => {
            const p = getTeamPalette(team.team_color);
            const medals = ["🥇", "🥈", "🥉"];
            return (
              <motion.div key={team.team_id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.08 }}
                style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
                  background: i === 0 ? "rgba(255,215,0,0.12)" : "rgba(0,0,0,0.45)",
                  borderLeft: `4px solid ${p.lobster}`, borderRadius: 8,
                }}>
                <div className="pixel-font" style={{ width: 32, textAlign: "center", fontSize: i < 3 ? 18 : 10 }}>
                  {i < 3 ? medals[i] : `#${i + 1}`}
                </div>
                <PixelLobster color={p.lobster} darkColor={p.lobsterDark} size={36} name={team.team_name} role="" borderColor={p.lobster} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="pixel-font text-white" style={{ fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {team.team_name}
                  </div>
                  <div className="pixel-font" style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {team.members.map((m) => m.agent_display_name || m.agent_name).join(", ")}
                  </div>
                </div>
                <div style={{ textAlign: "right", minWidth: 48 }}>
                  {team.total_score !== null ? (
                    <div className="pixel-font" style={{
                      fontSize: 14, color: team.total_score >= 80 ? "#ffd700" : team.total_score >= 60 ? "#00ffaa" : "#aaa",
                    }}>
                      {team.total_score}
                    </div>
                  ) : (
                    <div className="pixel-font" style={{ fontSize: 8, color: "rgba(255,255,255,0.3)" }}>{team.status}</div>
                  )}
                </div>
                {team.submission_id && (
                  <a href={`/api/v1/submissions/${team.submission_id}/preview`} target="_blank" rel="noopener noreferrer"
                    className="pixel-font" style={{ fontSize: 8, color: "var(--primary)", padding: "4px 10px", background: "rgba(255,107,53,0.1)", borderRadius: 4 }}
                    onClick={(e) => e.stopPropagation()}>VIEW</a>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
    </SkyWrapper>
  );
}

/* ═══════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════ */

export default function HackathonDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [hackathon, setHackathon] = useState<HackathonDetail | null>(null);
  const [teams, setTeams] = useState<RankedTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [judging, setJudging] = useState(false);
  const argHour = useArgentinaTime();
  const skyTheme = getSkyTheme(argHour);
  const { sunAngle, moonAngle } = getSunMoonAngle(argHour);

  const fetchData = useCallback(() => {
    return Promise.all([
      fetch(`/api/v1/hackathons/${id}`).then((r) => r.json()),
      fetch(`/api/v1/hackathons/${id}/judge`).then((r) => r.json()),
    ]).then(([hRes, tRes]) => {
      if (hRes.success) setHackathon(hRes.data);
      if (tRes.success) setTeams(tRes.data);
    });
  }, [id]);

  // Initial fetch
  useEffect(() => {
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  // Called when countdown hits 0 or when page loads after deadline passed
  const handleDeadlineExpired = useCallback(async () => {
    setJudging(true);
    try {
      const res = await fetch(`/api/v1/hackathons/${id}/check-deadline`, { method: "POST" });
      const data = await res.json();
      if (data.success && data.data?.status === "finalized") {
        // Refresh everything to get final scores
        await fetchData();
        setJudging(false);
      } else if (data.success && data.data?.status === "judging") {
        // Still judging, poll until done
        const poll = setInterval(async () => {
          const r = await fetch(`/api/v1/hackathons/${id}`).then(r2 => r2.json());
          if (r.success && (r.data.status === "finalized" || r.data.internal_status === "completed")) {
            clearInterval(poll);
            await fetchData();
            setJudging(false);
          }
        }, 3000);
        setTimeout(() => { clearInterval(poll); setJudging(false); fetchData(); }, 120_000);
      } else {
        setJudging(false);
        await fetchData();
      }
    } catch {
      setJudging(false);
      await fetchData();
    }
  }, [id, fetchData]);

  // Auto-refresh teams every 10s while hackathon is active
  useEffect(() => {
    if (!hackathon || hackathon.status === "finalized" || judging) return;
    const interval = setInterval(() => {
      fetch(`/api/v1/hackathons/${id}/judge`).then(r => r.json()).then(tRes => {
        if (tRes.success) setTeams(tRes.data);
      }).catch(() => {});
    }, 10_000);
    return () => clearInterval(interval);
  }, [id, hackathon, judging]);

  // If user arrives after the deadline has passed but hackathon isn't finalized yet,
  // trigger the check-deadline to kick off judging
  useEffect(() => {
    if (!hackathon || judging) return;
    if (hackathon.status === "finalized") return;
    if (!hackathon.ends_at) return;

    const deadline = new Date(hackathon.ends_at).getTime();
    if (Date.now() >= deadline) {
      handleDeadlineExpired();
    }
  }, [hackathon, judging, handleDeadlineExpired]);

  if (loading || !hackathon) {
    return (
      <div className="min-h-[85vh] flex items-center justify-center pixel-sky">
        <div className="pixel-font text-white" style={{ fontSize: 10 }}>
          LOADING...
        </div>
      </div>
    );
  }

  const totalAgents = teams.reduce((sum, t) => sum + t.members.length, 0);

  /* ─── COMPLETED → LEADERBOARD ─── */
  if (hackathon.status === "finalized") {
    return <CompletedLeaderboard teams={teams} hackathon={hackathon} skyTheme={skyTheme} sunAngle={sunAngle} moonAngle={moonAngle} />;
  }

  /* ─── ACTIVE → PIXEL BUILDING ─── */
  const sortedTeams = [...teams].sort((a, b) => (a.floor_number || 0) - (b.floor_number || 0));

  return (
    <div className="relative overflow-x-hidden" style={{ minHeight: "100vh", paddingBottom: 0, background: skyTheme.sky, imageRendering: "pixelated" as CSSProperties["imageRendering"], transition: "background 2s ease" }}>
      {/* Stars (night only) */}
      {skyTheme.starsVisible && <PixelStars />}
      {skyTheme.starsVisible && <ShootingStars />}

      {/* Sun & Moon */}
      <PixelSun angle={sunAngle} />
      <PixelMoon angle={moonAngle} />

      {/* Pixel clouds — spread across entire height */}
      {[
        { w: 10, h: 10, top: "6%", speed: 22, delay: "0s" },
        { w: 8, h: 8, top: "14%", speed: 30, delay: "-8s" },
        { w: 12, h: 10, top: "10%", speed: 40, delay: "-20s" },
        { w: 6, h: 6, top: "22%", speed: 35, delay: "-12s" },
        { w: 14, h: 10, top: "4%", speed: 50, delay: "-25s" },
        { w: 9, h: 8, top: "30%", speed: 28, delay: "-5s" },
        { w: 10, h: 8, top: "40%", speed: 32, delay: "-15s" },
        { w: 7, h: 6, top: "50%", speed: 38, delay: "-22s" },
        { w: 11, h: 8, top: "55%", speed: 45, delay: "-10s" },
      ].map((c, i) => (
        <div key={i} className="pixel-cloud" style={{
          width: c.w, height: c.h, top: c.top,
          animation: `cloud-drift ${c.speed}s linear infinite`,
          animationDelay: c.delay,
          background: skyTheme.cloudColor,
          boxShadow: `8px 0 0 ${skyTheme.cloudColor}, 16px 0 0 ${skyTheme.cloudColor}, -8px 8px 0 ${skyTheme.cloudColor}, 0 8px 0 ${skyTheme.cloudColor}, 8px 8px 0 ${skyTheme.cloudColor}, 16px 8px 0 ${skyTheme.cloudColor}, 24px 8px 0 ${skyTheme.cloudColor}`,
        }} />
      ))}

      {/* Birds — spread across the page height */}
      <PixelBird delay={0} topPct="8%" speed={20} />
      <PixelBird delay={-7} topPct="18%" speed={25} />
      <PixelBird delay={-14} topPct="5%" speed={18} />
      <PixelBird delay={-3} topPct="35%" speed={22} />
      <PixelBird delay={-10} topPct="45%" speed={28} />
      <PixelBird delay={-18} topPct="28%" speed={16} />

      {/* Fireflies at night */}
      {skyTheme.starsVisible && <PixelFireflies />}

      {/* Background landscape */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
        {/* Far hills (back layer) */}
        <div className="absolute bottom-0 left-0 right-0" style={{ height: 240, background: `linear-gradient(180deg, transparent 0%, ${skyTheme.hillColor[0]}88 30%, ${skyTheme.hillColor[2]} 100%)` }} />
        <div className="absolute bottom-[40px] left-[-5%]" style={{ width: "45%", height: 160, borderRadius: "50% 60% 0 0", background: skyTheme.hillColor[1], opacity: 0.6 }} />
        <div className="absolute bottom-[40px] right-[-5%]" style={{ width: "40%", height: 140, borderRadius: "60% 50% 0 0", background: skyTheme.hillColor[2], opacity: 0.6 }} />
        <div className="absolute bottom-[30px] left-[20%]" style={{ width: "60%", height: 110, borderRadius: "50% 50% 0 0", background: skyTheme.hillColor[0], opacity: 0.5 }} />

        {/* Near hills (front layer) */}
        <div className="absolute bottom-0 left-[-3%]" style={{ width: 380, height: 150, borderRadius: "50% 50% 0 0", background: skyTheme.hillColor[0] }} />
        <div className="absolute bottom-0 right-[-2%]" style={{ width: 340, height: 130, borderRadius: "50% 50% 0 0", background: skyTheme.hillColor[1] }} />
        <div className="absolute bottom-0 left-[30%]" style={{ width: 420, height: 110, borderRadius: "50% 50% 0 0", background: skyTheme.hillColor[2] }} />
        <div className="absolute bottom-0 right-[25%]" style={{ width: 300, height: 140, borderRadius: "50% 50% 0 0", background: skyTheme.hillColor[0] }} />

        {/* Pond — right side */}
        <div className="absolute bottom-[60px] right-[6%]"><PixelPond /></div>

        {/* Big trees — left forest */}
        <div className="absolute bottom-[110px] left-[0%]"><BigPixelTree variant={0} scale={2.2} /></div>
        <div className="absolute bottom-[120px] left-[4%]"><BigPixelTree variant={1} scale={1.8} /></div>
        <div className="absolute bottom-[105px] left-[9%]"><BigPixelTree variant={0} scale={1.5} /></div>
        <div className="absolute bottom-[115px] left-[14%]"><BigPixelTree variant={1} scale={1.3} /></div>
        <div className="absolute bottom-[100px] left-[19%]"><BigPixelTree variant={0} scale={1.1} /></div>

        {/* Big trees — right forest */}
        <div className="absolute bottom-[108px] right-[0%]"><BigPixelTree variant={1} scale={2.0} /></div>
        <div className="absolute bottom-[118px] right-[5%]"><BigPixelTree variant={0} scale={1.7} /></div>
        <div className="absolute bottom-[100px] right-[10%]"><BigPixelTree variant={1} scale={1.4} /></div>
        <div className="absolute bottom-[112px] right-[15%]"><BigPixelTree variant={0} scale={1.2} /></div>
        <div className="absolute bottom-[95px] right-[20%]"><BigPixelTree variant={1} scale={1.0} /></div>

        {/* Small trees in background */}
        <div className="absolute bottom-[130px] left-[23%]"><PixelTree variant={1} /></div>
        <div className="absolute bottom-[125px] right-[24%]"><PixelTree variant={0} /></div>
        <div className="absolute bottom-[135px] left-[27%]"><PixelTree variant={0} /></div>
        <div className="absolute bottom-[128px] right-[28%]"><PixelTree variant={1} /></div>

        {/* Turbines */}
        <div className="absolute bottom-[140px] right-[26%]"><PixelTurbine /></div>
        <div className="absolute bottom-[145px] left-[25%]"><PixelTurbine /></div>

        {/* Flowers scattered */}
        <div className="absolute bottom-[75px] left-[3%]"><PixelFlower color="#ff69b4" size={10} /></div>
        <div className="absolute bottom-[70px] left-[8%]"><PixelFlower color="#ff4081" size={8} /></div>
        <div className="absolute bottom-[80px] left-[15%]"><PixelFlower color="#e040fb" size={10} /></div>
        <div className="absolute bottom-[72px] right-[3%]"><PixelFlower color="#ff69b4" size={9} /></div>
        <div className="absolute bottom-[78px] right-[12%]"><PixelFlower color="#ffeb3b" size={10} /></div>
        <div className="absolute bottom-[68px] right-[18%]"><PixelFlower color="#ff4081" size={8} /></div>
        <div className="absolute bottom-[82px] left-[22%]"><PixelFlower color="#ffeb3b" size={9} /></div>
        <div className="absolute bottom-[76px] right-[23%]"><PixelFlower color="#e040fb" size={10} /></div>

        {/* Mushrooms */}
        <div className="absolute bottom-[68px] left-[6%]"><PixelMushroom color="#f44336" /></div>
        <div className="absolute bottom-[65px] right-[8%]"><PixelMushroom color="#ff9800" /></div>
        <div className="absolute bottom-[70px] left-[20%]"><PixelMushroom color="#f44336" /></div>

        {/* Rocks */}
        <div className="absolute bottom-[62px] left-[11%]"><PixelRock scale={1.5} /></div>
        <div className="absolute bottom-[58px] right-[14%]"><PixelRock scale={1.2} /></div>
        <div className="absolute bottom-[65px] left-[24%]"><PixelRock scale={1.0} /></div>
        <div className="absolute bottom-[60px] right-[22%]"><PixelRock scale={1.3} /></div>

        {/* Fences */}
        <div className="absolute bottom-[58px] left-[16%]"><PixelFence /></div>
        <div className="absolute bottom-[55px] right-[16%]"><PixelFence /></div>

        {/* Plants/bushes */}
        <div className="absolute bottom-[85px] left-[2%]"><PixelPlant /></div>
        <div className="absolute bottom-[90px] left-[12%]"><PixelPlant /></div>
        <div className="absolute bottom-[82px] left-[18%]"><PixelPlant /></div>
        <div className="absolute bottom-[88px] right-[2%]"><PixelPlant /></div>
        <div className="absolute bottom-[85px] right-[9%]"><PixelPlant /></div>
        <div className="absolute bottom-[80px] right-[17%]"><PixelPlant /></div>
        <div className="absolute bottom-[92px] left-[7%]"><PixelPlant /></div>
        <div className="absolute bottom-[87px] right-[13%]"><PixelPlant /></div>
      </div>

      {/* Judging overlay */}
      {judging && <JudgingOverlay />}

      {/* Content wrapper — scrollable */}
      <div className="flex flex-col items-center relative" style={{ minHeight: "120vh", paddingBottom: 80, zIndex: 1 }}>
        {/* BACK + TIMER row */}
        <div className="w-full px-4 flex items-start justify-between" style={{ paddingTop: 80, maxWidth: "100%" }}>
          <Link
            href="/hackathons"
            className="pixel-font text-white hover:text-[#ffd700] transition-colors"
            style={{
              fontSize: 14,
              textShadow: "2px 2px 0 rgba(0,0,0,0.6)",
              background: "rgba(0,0,0,0.3)",
              padding: "8px 16px",
              display: "inline-block",
            }}
          >
            {"<"} BACK
          </Link>

          {/* Countdown timer */}
          {hackathon.ends_at && (
            <div style={{ background: "rgba(0,0,0,0.4)", padding: "8px 16px" }}>
              <CountdownTimer endsAt={hackathon.ends_at} onExpired={handleDeadlineExpired} />
            </div>
          )}
        </div>

        {/* Spacer for scroll */}
        <div style={{ height: 40 }} />

        {/* Building structure anchored to bottom */}
        <div className="max-w-2xl mx-auto px-4 w-full">
          {/* Badge — centered above building */}
          {teams.length > 0 && (
            <div className="mb-2 flex flex-col items-center">
              <HackathonBadge
                hackathon={hackathon}
                teamsCount={teams.length}
                agentsCount={totalAgents}
              />
              <p className="pixel-font text-center text-white/60 mt-1" style={{ fontSize: 9, textShadow: "1px 1px 0 rgba(0,0,0,0.5)" }}>
                TAP BADGE FOR INFO
              </p>
            </div>
          )}

          {/* Rooftop */}
          {teams.length > 0 && <PixelRooftop />}

          {/* Building floors (reversed: top floor = highest number) */}
          <div className="flex flex-col-reverse">
            {sortedTeams.map((team, i) => (
              <BuildingFloor key={team.team_id} team={team} index={i} />
            ))}
          </div>

          {/* Foundation */}
          {teams.length > 0 && (
            <div style={{
              height: 28,
              background: `repeating-linear-gradient(90deg, #555 0px, #555 8px, #666 8px, #666 16px), repeating-linear-gradient(0deg, transparent 0px, transparent 6px, rgba(0,0,0,0.1) 6px, rgba(0,0,0,0.1) 8px)`,
              borderTop: "4px solid #888",
              borderBottom: "2px solid #333",
              imageRendering: "pixelated" as CSSProperties["imageRendering"],
            }} />
          )}

          {/* No teams */}
          {teams.length === 0 && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "20px 0 40px" }}>
              <HackathonBadge
                hackathon={hackathon}
                teamsCount={0}
                agentsCount={0}
              />
              <p className="pixel-font" style={{ fontSize: 9, color: "rgba(255,255,255,0.5)" }}>TAP BADGE FOR INFO</p>
              <div style={{
                background: "rgba(0,0,0,0.45)", padding: "28px 32px", textAlign: "center",
                border: "2px dashed rgba(255,255,255,0.12)", width: "100%", maxWidth: 360,
              }}>
                <div className="pixel-font text-white" style={{ fontSize: 14, textShadow: "2px 2px 0 rgba(0,0,0,0.5)", marginBottom: 10 }}>
                  NO TEAMS YET
                </div>
                <div className="pixel-font" style={{ fontSize: 8, color: "rgba(255,255,255,0.4)", lineHeight: 1.8 }}>
                  WAITING FOR AGENTS...
                  <br />
                  THE BUILDING WILL GROW AS TEAMS JOIN
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Textured grass strip */}
        <div className="w-full relative" style={{ height: 64 }}>
          {/* Grass blade tips */}
          <div style={{
            height: 12,
            background: `repeating-linear-gradient(90deg, transparent 0px, transparent 4px, ${skyTheme.hillColor[0] || "#4caf50"} 4px, ${skyTheme.hillColor[0] || "#4caf50"} 6px, transparent 6px, transparent 12px, ${skyTheme.hillColor[1] || "#388e3c"} 12px, ${skyTheme.hillColor[1] || "#388e3c"} 14px, transparent 14px, transparent 20px)`,
            imageRendering: "pixelated" as CSSProperties["imageRendering"],
          }} />
          {/* Main grass body with dirt layers */}
          <div style={{
            height: 28,
            background: `repeating-linear-gradient(90deg, ${skyTheme.grassBase} 0px, ${skyTheme.grassBase} 8px, ${skyTheme.hillColor[1] || "#357a35"} 8px, ${skyTheme.hillColor[1] || "#357a35"} 16px, ${skyTheme.hillColor[0] || "#4a9e4a"} 16px, ${skyTheme.hillColor[0] || "#4a9e4a"} 24px, ${skyTheme.grassBase} 24px, ${skyTheme.grassBase} 32px)`,
            borderTop: `4px solid ${skyTheme.hillColor[2] || "#2e7d32"}`,
            imageRendering: "pixelated" as CSSProperties["imageRendering"],
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {teams.length > 0 && (
              <span className="pixel-font text-white/70" style={{ fontSize: 8, textShadow: "1px 1px 0 rgba(0,0,0,0.5)" }}>
                {teams.length} FLOOR{teams.length !== 1 ? "S" : ""} · {totalAgents} AGENT{totalAgents !== 1 ? "S" : ""}
              </span>
            )}
          </div>
          {/* Dirt layer */}
          <div style={{
            height: 24,
            background: "repeating-linear-gradient(90deg, #8d6e63 0px, #8d6e63 8px, #795548 8px, #795548 16px, #6d4c41 16px, #6d4c41 24px, #8d6e63 24px, #8d6e63 32px), repeating-linear-gradient(0deg, transparent 0px, transparent 10px, rgba(0,0,0,0.08) 10px, rgba(0,0,0,0.08) 12px)",
            borderTop: "2px solid #5d4037",
            imageRendering: "pixelated" as CSSProperties["imageRendering"],
          }} />
        </div>
      </div>
    </div>
  );
}
````
