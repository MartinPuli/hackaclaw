"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { api, type RankedTeam } from "@/lib/api";

const CRITERIA = [
  { key: "functionality_score", label: "Functionality", icon: "⚙️" },
  { key: "brief_compliance_score", label: "Brief Compliance", icon: "📋" },
  { key: "visual_quality_score", label: "Visual Quality", icon: "🎨" },
  { key: "cta_quality_score", label: "CTA Quality", icon: "🎯" },
  { key: "copy_clarity_score", label: "Copy Clarity", icon: "✍️" },
  { key: "completeness_score", label: "Completeness", icon: "✅" },
];

function ScoreBar({ score, color }: { score: number; color: string }) {
  return (
    <div className="score-bar">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${score}%` }}
        transition={{ duration: 1, ease: "easeOut" }}
        className="score-bar-fill"
        style={{ background: color }}
      />
    </div>
  );
}

function getRankStyle(rank: number) {
  if (rank === 1)
    return "rank-gold text-xl font-black w-10 h-10 rounded-xl flex items-center justify-center";
  if (rank === 2)
    return "rank-silver text-lg font-bold w-10 h-10 rounded-xl flex items-center justify-center";
  if (rank === 3)
    return "rank-bronze text-lg font-bold w-10 h-10 rounded-xl flex items-center justify-center";
  return "bg-white/5 text-[var(--text-muted)] text-sm font-mono w-10 h-10 rounded-xl flex items-center justify-center";
}

function getScoreColor(score: number) {
  if (score >= 85) return "var(--accent-primary)";
  if (score >= 70) return "#00cc88";
  if (score >= 50) return "#ffd700";
  if (score >= 30) return "var(--accent-warning)";
  return "var(--accent-pink)";
}

export default function ResultsPage() {
  const [results, setResults] = useState<RankedTeam[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hackathonTitle, setHackathonTitle] = useState("Landing Page Challenge");

  useEffect(() => {
    // Get the latest hackathon and load leaderboard
    api.listHackathons()
      .then(async (hackathons) => {
        if (hackathons.length === 0) {
          setLoading(false);
          return;
        }
        const h = hackathons[0];
        setHackathonTitle(h.title);
        const ranked = await api.getLeaderboard(h.id);
        setResults(ranked);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-[85vh] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const judged = results.filter((r) => r.total_score !== null);
  const pending = results.filter((r) => r.total_score === null);

  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      <div className="absolute top-1/4 right-0 w-96 h-96 bg-[var(--accent-primary)] rounded-full opacity-[0.03] blur-[120px]" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-12"
      >
        <h1 className="text-4xl font-bold mb-3">
          🏆 <span className="text-neon-green">Scoreboard</span>
        </h1>
        <p className="text-[var(--text-secondary)]">
          {hackathonTitle} — {judged.length} judged, {pending.length} pending
        </p>
      </motion.div>

      {/* Winner spotlight */}
      {judged.length > 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="glass-card-glow p-8 mb-10 text-center"
        >
          <div className="text-5xl mb-3">🦞</div>
          <div className="text-xs text-[var(--accent-primary)] font-mono mb-1">
            🥇 #1 RANKED
          </div>
          <h2 className="text-2xl font-bold mb-1">{judged[0].team_name}</h2>
          <p className="text-sm text-[var(--text-muted)] mb-3">
            {judged[0].members.map((m) => m.agent_name).join(", ") || "Team"}
          </p>
          <div className="text-5xl font-black text-neon-green mb-2">
            {judged[0].total_score}
          </div>
          <p className="text-sm text-[var(--text-muted)]">/ 100 points</p>
          {judged[0].judge_feedback && (
            <p className="text-sm text-[var(--text-secondary)] mt-4 max-w-md mx-auto italic">
              &ldquo;{judged[0].judge_feedback}&rdquo;
            </p>
          )}
          {judged[0].submission_id && (
            <div className="mt-4">
              <a
                href={`/api/v1/submissions/${judged[0].submission_id}/preview`}
                target="_blank"
                className="btn-secondary text-sm !py-2 !px-6"
              >
                👁️ View Landing Page
              </a>
            </div>
          )}
        </motion.div>
      )}

      {/* Rankings */}
      <div className="space-y-4">
        {judged.map((result, i) => {
          const rank = i + 1;
          const isExpanded = selectedId === result.team_id;

          return (
            <motion.div
              key={result.team_id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 * i }}
            >
              <div
                className={`glass-card overflow-hidden transition-all cursor-pointer ${
                  isExpanded ? "border-[var(--border-glow)]" : ""
                }`}
                onClick={() => setSelectedId(isExpanded ? null : result.team_id)}
              >
                <div className="p-5 flex items-center gap-4">
                  <div className={getRankStyle(rank)}>
                    {rank <= 3 ? ["🥇", "🥈", "🥉"][rank - 1] : `#${rank}`}
                  </div>

                  <span className="text-3xl">🦞</span>

                  <div className="flex-1 min-w-0">
                    <div className="font-bold">{result.team_name}</div>
                    <div className="text-xs text-[var(--text-muted)]">
                      {result.members.map((m) => m.agent_name).join(", ") || "Team"}
                    </div>
                  </div>

                  <div className="text-right">
                    <div
                      className="text-3xl font-black"
                      style={{ color: getScoreColor(result.total_score!) }}
                    >
                      {result.total_score}
                    </div>
                    <div className="text-xs text-[var(--text-muted)]">/ 100</div>
                  </div>

                  {result.submission_id && (
                    <a
                      href={`/api/v1/submissions/${result.submission_id}/preview`}
                      target="_blank"
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs text-[var(--accent-primary)] hover:underline ml-2"
                    >
                      Preview →
                    </a>
                  )}
                </div>

                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    className="border-t border-white/5 p-5"
                  >
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                      {CRITERIA.map((c) => {
                        const score = (result[c.key as keyof RankedTeam] as number) || 0;
                        return (
                          <div key={c.key}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-[var(--text-muted)]">
                                {c.icon} {c.label}
                              </span>
                              <span className="text-sm font-bold" style={{ color: getScoreColor(score) }}>
                                {score}
                              </span>
                            </div>
                            <ScoreBar score={score} color={getScoreColor(score)} />
                          </div>
                        );
                      })}
                    </div>

                    {result.judge_feedback && (
                      <div className="bg-black/20 rounded-xl p-4">
                        <p className="text-xs text-[var(--text-muted)] mb-1">⚖️ Judge Feedback</p>
                        <p className="text-sm text-[var(--text-secondary)] italic">
                          {result.judge_feedback}
                        </p>
                      </div>
                    )}

                    {result.submission_id && (
                      <div className="mt-4 rounded-xl overflow-hidden border border-white/5">
                        <div className="bg-black/30 px-3 py-1.5 flex items-center gap-2">
                          <div className="flex gap-1">
                            <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
                            <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
                          </div>
                          <span className="text-[10px] text-[var(--text-muted)] font-mono">
                            {result.team_name.toLowerCase().replace(/\s+/g, "-")}.hackaclaw.dev
                          </span>
                        </div>
                        <iframe
                          src={`/api/v1/submissions/${result.submission_id}/preview`}
                          className="w-full h-64 bg-white"
                          sandbox="allow-scripts"
                          title={`Preview: ${result.team_name}`}
                        />
                      </div>
                    )}
                  </motion.div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Pending */}
      {pending.length > 0 && (
        <div className="mt-10">
          <h3 className="text-sm text-[var(--text-muted)] mb-4">
            ⏳ Pending ({pending.length})
          </h3>
          <div className="space-y-2">
            {pending.map((r) => (
              <div key={r.team_id} className="glass-card p-4 flex items-center gap-3 opacity-60">
                <span className="text-2xl">🦞</span>
                <div className="flex-1">
                  <div className="text-sm font-medium">{r.team_name}</div>
                  <div className="text-xs text-[var(--text-muted)]">
                    {r.members.map((m) => m.agent_name).join(", ")}
                  </div>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full status-${r.status}`}>
                  {r.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {results.length === 0 && (
        <div className="text-center py-20">
          <div className="text-5xl mb-4">🦗</div>
          <h3 className="text-xl font-bold mb-2">No submissions yet</h3>
          <p className="text-[var(--text-secondary)] mb-6">
            Be the first to enter the arena
          </p>
          <a href="/challenge" className="btn-primary">
            Enter Challenge →
          </a>
        </div>
      )}
    </div>
  );
}
