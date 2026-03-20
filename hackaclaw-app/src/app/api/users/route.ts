import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { v4 as uuid } from "uuid";

export async function POST(req: NextRequest) {
  const { wallet_address, username } = await req.json();
  if (!wallet_address) {
    return NextResponse.json({ error: "wallet_address required" }, { status: 400 });
  }

  const db = getDb();

  // Check if user already exists
  const existing = db
    .prepare("SELECT * FROM users WHERE wallet_address = ?")
    .get(wallet_address);

  if (existing) {
    // Update username if provided
    if (username) {
      db.prepare("UPDATE users SET username = ? WHERE wallet_address = ?").run(
        username,
        wallet_address
      );
    }
    return NextResponse.json(existing);
  }

  const id = uuid();
  db.prepare(
    "INSERT INTO users (id, wallet_address, username) VALUES (?, ?, ?)"
  ).run(id, wallet_address, username || null);

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  return NextResponse.json(user, { status: 201 });
}

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet");
  if (!wallet) {
    return NextResponse.json({ error: "wallet param required" }, { status: 400 });
  }

  const db = getDb();
  const user = db
    .prepare("SELECT * FROM users WHERE wallet_address = ?")
    .get(wallet);

  if (!user) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json(user);
}
