import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { v4 as uuid } from "uuid";
import { createHackathonRepo, setGitHubOverrides, slugify } from "@/lib/github";
import { sanitizeString } from "@/lib/hackathons";

function ok(data: unknown, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}
function err(message: string, status = 400) {
  return NextResponse.json({ success: false, error: { message } }, { status });
}

/**
 * GET /api/v1/proposals/create?token=xxx — Fetch proposal info for the create form.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token")?.trim();
  if (!token || token.length < 32) return err("Invalid token", 401);

  const { data: proposal } = await supabaseAdmin
    .from("enterprise_proposals")
    .select("id, company, track, problem_description, status, approval_token")
    .eq("approval_token", token)
    .single();

  if (!proposal) return err("Invalid or expired token", 401);
  if (proposal.status !== "approved") return err("This proposal is no longer active", 403);

  return ok({
    company: proposal.company,
    track: proposal.track,
    problem: proposal.problem_description,
  });
}

/**
 * POST /api/v1/proposals/create — Create a hackathon from an approved proposal.
 * Body: { token, title, brief, ends_at, max_participants?, github_token?, github_owner? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const token = (typeof body.token === "string") ? body.token.trim() : "";
    if (!token || token.length < 32) return err("Invalid token", 401);

    const { data: proposal } = await supabaseAdmin
      .from("enterprise_proposals")
      .select("*")
      .eq("approval_token", token)
      .single();

    if (!proposal) return err("Invalid or expired token", 401);
    if (proposal.status !== "approved") return err("This proposal has already been used or is not approved", 403);

    const title = sanitizeString(body.title, 200);
    const brief = sanitizeString(body.brief, 5000);
    const endsAt = body.ends_at ? new Date(body.ends_at) : null;

    if (!title || !brief) return err("title and brief are required");
    if (!endsAt || isNaN(endsAt.getTime()) || endsAt.getTime() <= Date.now()) {
      return err("ends_at must be a valid future date (ISO 8601)");
    }

    const maxPart = Math.max(2, Math.min(1000, Number(body.max_participants) || 50));
    const entryFee = Math.max(0, Number(body.entry_fee) || 0);
    const id = uuid();

    const { error: insertErr } = await supabaseAdmin
      .from("hackathons")
      .insert({
        id,
        title,
        description: sanitizeString(body.description, 1000) || `Enterprise hackathon by ${proposal.company}`,
        brief,
        rules: sanitizeString(body.rules, 2000),
        entry_type: entryFee > 0 ? "paid" : "free",
        entry_fee: entryFee,
        prize_pool: 0,
        platform_fee_pct: 0.1,
        max_participants: maxPart,
        team_size_min: 1,
        team_size_max: 1,
        build_time_seconds: Math.max(30, Math.min(600, Number(body.build_time_seconds) || 180)),
        challenge_type: sanitizeString(body.challenge_type, 50) || "landing_page",
        status: "open",
        created_by: proposal.id,
        starts_at: new Date().toISOString(),
        ends_at: endsAt.toISOString(),
      })
      .select("*")
      .single();

    if (insertErr) return err("Failed to create hackathon", 500);

    // Create GitHub repo if token provided
    const ghToken = sanitizeString(body.github_token, 256) || process.env.GITHUB_TOKEN;
    const ghOwner = sanitizeString(body.github_owner, 64) || undefined;
    let repoUrl: string | null = null;

    if (ghToken) {
      try {
        setGitHubOverrides(ghToken, ghOwner);
        const { repoUrl: url } = await createHackathonRepo(slugify(title), brief, title);
        repoUrl = url;
        await supabaseAdmin.from("hackathons").update({ github_repo: url }).eq("id", id);
      } catch (e) {
        console.error("GitHub repo creation failed:", e);
      } finally {
        setGitHubOverrides();
      }
    }

    // Mark proposal as used
    await supabaseAdmin
      .from("enterprise_proposals")
      .update({ status: "hackathon_created", admin_notes: `Hackathon created: ${id}` })
      .eq("id", proposal.id);

    return ok({
      hackathon_id: id,
      title,
      status: "open",
      ends_at: endsAt.toISOString(),
      github_repo: repoUrl,
      url: `/hackathons/${id}`,
      message: "Hackathon created successfully!",
    }, 201);
  } catch {
    return err("Invalid request", 400);
  }
}
