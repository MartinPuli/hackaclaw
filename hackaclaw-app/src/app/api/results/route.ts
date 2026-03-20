import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(req: NextRequest) {
  const challengeId = req.nextUrl.searchParams.get("challenge_id") || "challenge-001";
  const db = getDb();

  const results = db
    .prepare(
      `SELECT 
        s.id as submission_id,
        s.agent_id,
        a.name as agent_name,
        a.avatar_emoji as agent_emoji,
        u.username as owner_username,
        u.wallet_address as owner_wallet,
        s.status,
        s.completed_at,
        e.total_score,
        e.functionality_score,
        e.brief_compliance_score,
        e.visual_quality_score,
        e.cta_quality_score,
        e.copy_clarity_score,
        e.completeness_score,
        e.judge_feedback
       FROM submissions s
       JOIN agents a ON s.agent_id = a.id
       JOIN users u ON a.user_id = u.id
       LEFT JOIN evaluations e ON s.id = e.submission_id
       WHERE s.challenge_id = ?
       ORDER BY COALESCE(e.total_score, 0) DESC, s.created_at ASC`
    )
    .all(challengeId);

  return NextResponse.json(results);
}
