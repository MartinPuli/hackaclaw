import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { GoogleGenAI } from "@google/genai";

const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function POST(req: NextRequest) {
  const { submission_id } = await req.json();
  if (!submission_id) {
    return NextResponse.json({ error: "submission_id required" }, { status: 400 });
  }

  const db = getDb();

  // Get submission + agent + challenge
  const submission = db
    .prepare(
      `SELECT s.*, a.name as agent_name, a.personality, a.strategy, c.brief, c.title as challenge_title
       FROM submissions s
       JOIN agents a ON s.agent_id = a.id
       JOIN challenges c ON s.challenge_id = c.id
       WHERE s.id = ?`
    )
    .get(submission_id) as Record<string, string> | undefined;

  if (!submission) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }

  // Update status to building
  db.prepare(
    "UPDATE submissions SET status = 'building', started_at = datetime('now') WHERE id = ?"
  ).run(submission_id);

  try {
    const systemPrompt = buildSystemPrompt(
      submission.agent_name,
      submission.personality || "",
      submission.strategy || ""
    );

    const userPrompt = buildUserPrompt(submission.brief);

    const response = await genai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        maxOutputTokens: 16000,
        temperature: 0.8,
      },
    });

    const text = response?.text || "";

    // Extract HTML from the response
    const htmlContent = extractHTML(text);

    if (!htmlContent) {
      db.prepare(
        "UPDATE submissions SET status = 'failed', build_log = ?, completed_at = datetime('now') WHERE id = ?"
      ).run("Failed to generate valid HTML output", submission_id);
      return NextResponse.json({ error: "Agent failed to produce HTML" }, { status: 500 });
    }

    // Save the result
    db.prepare(
      `UPDATE submissions SET status = 'completed', html_content = ?, build_log = ?, completed_at = datetime('now') WHERE id = ?`
    ).run(htmlContent, `Agent ${submission.agent_name} successfully built the landing page.`, submission_id);

    return NextResponse.json({
      status: "completed",
      submission_id,
      html_length: htmlContent.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    db.prepare(
      "UPDATE submissions SET status = 'failed', build_log = ?, completed_at = datetime('now') WHERE id = ?"
    ).run(`Build error: ${message}`, submission_id);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function buildSystemPrompt(agentName: string, personality: string, strategy: string): string {
  return `You are "${agentName}", an AI agent competing in a hackathon challenge.

${personality ? `YOUR PERSONALITY: ${personality}` : ""}
${strategy ? `YOUR STRATEGY: ${strategy}` : ""}

You are a world-class web developer and designer. Your goal is to WIN this competition by building the BEST landing page possible.

CRITICAL RULES:
- Output ONLY a single, complete, self-contained HTML file
- ALL CSS must be inline in a <style> tag
- ALL JavaScript must be inline in a <script> tag
- NO external dependencies, CDNs, or imports (except Google Fonts via @import in CSS)
- The page MUST be responsive (mobile + desktop)
- The page MUST be visually stunning and professional
- Include smooth animations and micro-interactions
- Use a cohesive, modern color palette
- Make the CTA impossible to ignore

You are competing against other agents. Make this your BEST work. Your reputation is on the line.`;
}

function buildUserPrompt(brief: string): string {
  return `BUILD THIS NOW. Here is your challenge brief:

---
${brief}
---

Respond with ONLY the complete HTML file. No explanations, no markdown, no commentary. Just the raw HTML starting with <!DOCTYPE html> and ending with </html>.`;
}

function extractHTML(text: string): string | null {
  // Try to find HTML content in the response
  // First try: look for ```html blocks
  const codeBlockMatch = text.match(/```html\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  // Second try: look for <!DOCTYPE html> to </html>
  const htmlMatch = text.match(/(<!DOCTYPE html[\s\S]*<\/html>)/i);
  if (htmlMatch) {
    return htmlMatch[1].trim();
  }

  // Third try: look for <html> to </html>
  const htmlMatch2 = text.match(/(<html[\s\S]*<\/html>)/i);
  if (htmlMatch2) {
    return htmlMatch2[1].trim();
  }

  // If the entire response looks like HTML
  if (text.trim().startsWith("<!DOCTYPE") || text.trim().startsWith("<html")) {
    return text.trim();
  }

  return null;
}
