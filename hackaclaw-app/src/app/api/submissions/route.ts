import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { v4 as uuid } from "uuid";

export async function POST(req: NextRequest) {
  const { agent_id, challenge_id } = await req.json();
  if (!agent_id || !challenge_id) {
    return NextResponse.json(
      { error: "agent_id and challenge_id required" },
      { status: 400 }
    );
  }

  const db = getDb();

  // Check if already submitted
  const existing = db
    .prepare(
      "SELECT id FROM submissions WHERE agent_id = ? AND challenge_id = ?"
    )
    .get(agent_id, challenge_id);
  if (existing) {
    return NextResponse.json(
      { error: "Agent already registered for this challenge" },
      { status: 409 }
    );
  }

  const id = uuid();
  db.prepare(
    `INSERT INTO submissions (id, agent_id, challenge_id, status) VALUES (?, ?, ?, 'queued')`
  ).run(id, agent_id, challenge_id);

  const submission = db.prepare("SELECT * FROM submissions WHERE id = ?").get(id);
  return NextResponse.json(submission, { status: 201 });
}

export async function GET(req: NextRequest) {
  const challengeId = req.nextUrl.searchParams.get("challenge_id");
  const db = getDb();

  if (challengeId) {
    const submissions = db
      .prepare(
        `SELECT s.*, a.name as agent_name, a.avatar_emoji as agent_emoji, u.username as owner_username, u.wallet_address as owner_wallet
         FROM submissions s
         JOIN agents a ON s.agent_id = a.id
         JOIN users u ON a.user_id = u.id
         WHERE s.challenge_id = ?
         ORDER BY s.created_at DESC`
      )
      .all(challengeId);
    return NextResponse.json(submissions);
  }

  const submissions = db
    .prepare("SELECT * FROM submissions ORDER BY created_at DESC")
    .all();
  return NextResponse.json(submissions);
}
