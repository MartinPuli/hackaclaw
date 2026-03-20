import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { v4 as uuid } from "uuid";
import { GoogleGenAI } from "@google/genai";

const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function POST(req: NextRequest) {
  const { submission_id } = await req.json();
  if (!submission_id) {
    return NextResponse.json({ error: "submission_id required" }, { status: 400 });
  }

  const db = getDb();

  const submission = db
    .prepare(
      `SELECT s.*, c.brief 
       FROM submissions s 
       JOIN challenges c ON s.challenge_id = c.id 
       WHERE s.id = ?`
    )
    .get(submission_id) as Record<string, string> | undefined;

  if (!submission) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }

  if (!submission.html_content) {
    return NextResponse.json({ error: "No HTML content to judge" }, { status: 400 });
  }

  // Update status to judging
  db.prepare("UPDATE submissions SET status = 'judging' WHERE id = ?").run(submission_id);

  try {
    const judgePrompt = buildJudgePrompt(submission.brief, submission.html_content);

    const response = await genai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: judgePrompt,
      config: {
        systemInstruction: JUDGE_SYSTEM_PROMPT,
        maxOutputTokens: 4000,
        temperature: 0.3,
      },
    });

    const text = response?.text || "";
    const scores = parseJudgeResponse(text);

    if (!scores) {
      throw new Error("Failed to parse judge scores");
    }

    const evalId = uuid();
    const totalScore = Math.round(
      (scores.functionality +
        scores.brief_compliance +
        scores.visual_quality +
        scores.cta_quality +
        scores.copy_clarity +
        scores.completeness) / 6
    );

    db.prepare(
      `INSERT INTO evaluations (id, submission_id, functionality_score, brief_compliance_score, visual_quality_score, cta_quality_score, copy_clarity_score, completeness_score, total_score, judge_feedback)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      evalId,
      submission_id,
      scores.functionality,
      scores.brief_compliance,
      scores.visual_quality,
      scores.cta_quality,
      scores.copy_clarity,
      scores.completeness,
      totalScore,
      scores.feedback
    );

    db.prepare("UPDATE submissions SET status = 'judged' WHERE id = ?").run(submission_id);

    return NextResponse.json({
      status: "judged",
      evaluation_id: evalId,
      total_score: totalScore,
      scores,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    db.prepare("UPDATE submissions SET status = 'completed' WHERE id = ?").run(submission_id);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const JUDGE_SYSTEM_PROMPT = `You are the AI Judge for a hackathon competition. You evaluate landing pages built by AI agents with STRICT, FAIR, and CONSISTENT criteria.

You must be:
- OBJECTIVE: Score based on evidence, not vibes
- STRICT: A score of 100 should be nearly impossible. Average work gets 50-65.
- FAIR: Apply the same standards to every submission
- DETAILED: Explain your reasoning for each score

Score each criterion from 0 to 100:
- 0-30: Major failures or missing elements
- 31-50: Below average, significant issues  
- 51-65: Average, meets basic requirements
- 66-80: Good, above average quality
- 81-90: Excellent, professional quality
- 91-100: Exceptional, competition-winning quality

You MUST respond in this EXACT JSON format and nothing else:
{
  "functionality": <score>,
  "brief_compliance": <score>,
  "visual_quality": <score>,
  "cta_quality": <score>,
  "copy_clarity": <score>,
  "completeness": <score>,
  "feedback": "<2-3 sentence overall assessment>"
}`;

function buildJudgePrompt(brief: string, htmlContent: string): string {
  return `JUDGE THIS SUBMISSION.

ORIGINAL BRIEF:
${brief}

SUBMITTED HTML (evaluate this):
${htmlContent.substring(0, 12000)}

Evaluate the submission against ALL criteria. Respond ONLY with the JSON scores object.`;
}

interface JudgeScores {
  functionality: number;
  brief_compliance: number;
  visual_quality: number;
  cta_quality: number;
  copy_clarity: number;
  completeness: number;
  feedback: string;
}

function parseJudgeResponse(text: string): JudgeScores | null {
  try {
    // Try to extract JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      functionality: clampScore(parsed.functionality),
      brief_compliance: clampScore(parsed.brief_compliance),
      visual_quality: clampScore(parsed.visual_quality),
      cta_quality: clampScore(parsed.cta_quality),
      copy_clarity: clampScore(parsed.copy_clarity),
      completeness: clampScore(parsed.completeness),
      feedback: parsed.feedback || "No feedback provided.",
    };
  } catch {
    return null;
  }
}

function clampScore(score: unknown): number {
  const n = Number(score);
  if (isNaN(n)) return 50;
  return Math.max(0, Math.min(100, Math.round(n)));
}
