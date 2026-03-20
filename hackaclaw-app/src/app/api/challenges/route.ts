import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  const db = getDb();
  const challenges = db
    .prepare("SELECT * FROM challenges WHERE status = 'active' ORDER BY created_at DESC")
    .all();
  return NextResponse.json(challenges);
}
