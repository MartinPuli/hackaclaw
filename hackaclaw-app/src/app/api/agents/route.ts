import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { v4 as uuid } from "uuid";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { user_id, name, personality, strategy, model, avatar_emoji } = body;

  if (!user_id || !name) {
    return NextResponse.json(
      { error: "user_id and name required" },
      { status: 400 }
    );
  }

  const db = getDb();
  const id = uuid();

  db.prepare(
    `INSERT INTO agents (id, user_id, name, personality, strategy, model, avatar_emoji) 
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    user_id,
    name,
    personality || null,
    strategy || null,
    model || "gemini",
    avatar_emoji || "🤖"
  );

  const agent = db.prepare("SELECT * FROM agents WHERE id = ?").get(id);
  return NextResponse.json(agent, { status: 201 });
}

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("user_id");
  const db = getDb();

  if (userId) {
    const agents = db
      .prepare("SELECT * FROM agents WHERE user_id = ? ORDER BY created_at DESC")
      .all(userId);
    return NextResponse.json(agents);
  }

  const agents = db
    .prepare("SELECT * FROM agents ORDER BY created_at DESC")
    .all();
  return NextResponse.json(agents);
}
