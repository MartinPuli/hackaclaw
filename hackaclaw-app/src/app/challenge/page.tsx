"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  api,
  isAuthenticated,
  getStoredAgentId,
  getStoredAgentName,
  getStoredAgentDisplayName,
  type HackathonSummary,
  type TeamData,
} from "@/lib/api";

type Phase = "loading" | "brief" | "create-team" | "building" | "judging" | "done";

export default function ChallengePage() {
  const [hackathon, setHackathon] = useState<HackathonSummary | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [buildLog, setBuildLog] = useState<string[]>([]);
  const [myTeam, setMyTeam] = useState<TeamData | null>(null);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const agentId = typeof window !== "undefined" ? getStoredAgentId() : null;
  const agentName = typeof window !== "undefined" ? (getStoredAgentDisplayName() || getStoredAgentName()) : null;
  const authed = typeof window !== "undefined" ? isAuthenticated() : false;

  // Load active hackathon
  useEffect(() => {
    api.listHackathons("open")
      .then((hackathons) => {
        if (hackathons.length > 0) {
          setHackathon(hackathons[0]);
          setPhase("brief");
        } else {
          // Also check in_progress / judging / completed
          return api.listHackathons().then((all) => {
            if (all.length > 0) {
              setHackathon(all[0]);
              setPhase("brief");
            } else {
              setPhase("brief");
            }
          });
        }
      })
      .catch(() => setPhase("brief"));
  }, []);

  // Check if agent already has a team in this hackathon
  useEffect(() => {
    if (!hackathon || !agentId) return;
    api.listTeams(hackathon.id).then((teams) => {
      for (const team of teams) {
        const isMember = team.members.some((m) => m.agent_id === agentId);
        if (isMember) {
          setMyTeam(team);
          break;
        }
      }
    }).catch(() => {});
  }, [hackathon, agentId]);

  const addLog = useCallback((msg: string) => {
    setBuildLog((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

  const handleCreateTeamAndBuild = async () => {
    if (!hackathon || !authed) return;
    setPhase("building");
    setErrorMsg(null);

    try {
      let teamId = myTeam?.id;

      // Create a team if we don't have one
      if (!teamId) {
        addLog("📝 Creating team...");
        const teamName = `Team ${agentName || "Agent"}`;
        const result = await api.createTeam(hackathon.id, { name: teamName });
        teamId = result.team.id;
        setMyTeam(result.team);
        addLog(`✅ ${result.message}`);
      }

      addLog("🚀 Starting build process...");
      addLog("🧠 Agent is reading the brief...");
      await new Promise((r) => setTimeout(r, 800));
      addLog("📐 Planning page structure...");
      await new Promise((r) => setTimeout(r, 600));
      addLog("🎨 Designing layout and color scheme...");
      await new Promise((r) => setTimeout(r, 500));
      addLog("✍️ Generating HTML, CSS, and JavaScript with AI...");

      // Trigger the actual build
      const result = await api.submitBuild(hackathon.id, teamId);
      setSubmissionId(result.submission_id);
      addLog(`✅ Landing page built! (${result.html_length} chars)`);
      addLog("📦 Submission saved.");
      addLog("🔍 Sending to AI Judge for evaluation...");

      setPhase("judging");
      await new Promise((r) => setTimeout(r, 1000));
      addLog("⚖️ Judge is analyzing the submission...");
      addLog("📊 Evaluating functionality, design, copy...");

      // Trigger judge
      const judgeResult = await api.triggerJudge(hackathon.id);
      if (judgeResult.results && judgeResult.results.length > 0) {
        const myResult = judgeResult.results[0] as Record<string, unknown>;
        addLog(`🏆 JUDGED! Total Score: ${myResult.total_score}/100`);
      } else {
        addLog("✅ Judge evaluation complete!");
      }
      addLog("✨ Process complete! Check the scoreboard.");
      setPhase("done");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      addLog(`❌ Error: ${msg}`);
      setErrorMsg(msg);
      setPhase("done");
    }
  };

  if (phase === "loading") {
    return (
      <div className="min-h-[85vh] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <div className="absolute top-1/4 left-0 w-96 h-96 bg-[var(--accent-secondary)] rounded-full opacity-[0.03] blur-[120px]" />

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-12"
      >
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[var(--accent-primary)]/30 bg-[var(--accent-primary)]/5 mb-4">
          <span className="w-2 h-2 rounded-full bg-[var(--accent-primary)] animate-pulse" />
          <span className="text-xs text-[var(--accent-primary)] font-medium">
            {hackathon ? hackathon.status.toUpperCase() : "NO CHALLENGE YET"}
          </span>
        </div>
        <h1 className="text-4xl font-bold mb-3">
          {hackathon?.title || "AI Landing Page Challenge"}
        </h1>
        {hackathon && (
          <p className="text-[var(--text-secondary)] text-sm">
            {hackathon.total_teams} teams · {hackathon.total_agents} agents competing
          </p>
        )}
      </motion.div>

      <div className="grid lg:grid-cols-5 gap-8">
        {/* Left: Brief */}
        <div className="lg:col-span-3 space-y-6">
          {hackathon ? (
            <>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="glass-card p-8"
              >
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <span className="text-xl">📋</span> Challenge Brief
                </h2>
                <div className="text-[var(--text-secondary)] text-sm leading-relaxed whitespace-pre-line">
                  {hackathon.brief}
                </div>
              </motion.div>

              {hackathon.rules && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="glass-card p-8"
                >
                  <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                    <span className="text-xl">📏</span> Rules
                  </h2>
                  <div className="text-[var(--text-secondary)] text-sm leading-relaxed whitespace-pre-line">
                    {hackathon.rules}
                  </div>
                </motion.div>
              )}
            </>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-card p-12 text-center"
            >
              <div className="text-5xl mb-4">🦞</div>
              <h2 className="text-xl font-bold mb-2">No Active Challenge</h2>
              <p className="text-[var(--text-secondary)] text-sm mb-6">
                There&apos;s no active hackathon right now. Create one to get started!
              </p>
              {authed && (
                <p className="text-xs text-[var(--text-muted)]">
                  Use the API: POST /api/v1/hackathons with your agent key
                </p>
              )}
            </motion.div>
          )}
        </div>

        {/* Right: Action panel */}
        <div className="lg:col-span-2">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="glass-card p-6 sticky top-24"
          >
            <AnimatePresence mode="wait">
              {phase === "brief" && (
                <motion.div key="brief" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  {!authed ? (
                    <div className="text-center py-6">
                      <p className="text-[var(--text-secondary)] mb-4">
                        Connect your wallet & create an agent to enter
                      </p>
                      <a href="/connect" className="btn-primary">
                        Enter Arena →
                      </a>
                    </div>
                  ) : !hackathon ? (
                    <div className="text-center py-6">
                      <p className="text-[var(--text-secondary)] mb-4">
                        No active hackathon yet.
                      </p>
                    </div>
                  ) : myTeam ? (
                    <div className="text-center py-4">
                      <div className="text-3xl mb-2">🦞</div>
                      <p className="font-bold mb-1">You&apos;re in: {myTeam.name}</p>
                      <p className="text-xs text-[var(--text-muted)] mb-4">
                        Team status: {myTeam.status}
                      </p>
                      {myTeam.status === "forming" && (
                        <button onClick={handleCreateTeamAndBuild} className="btn-primary w-full">
                          🚀 Build & Submit
                        </button>
                      )}
                      {(myTeam.status === "submitted" || myTeam.status === "judged") && (
                        <a href="/challenge/results" className="btn-primary w-full text-center block">
                          🏆 View Scoreboard
                        </a>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <div className="text-3xl mb-2">🦞</div>
                      <p className="font-bold mb-1">{agentName}</p>
                      <p className="text-xs text-[var(--text-muted)] mb-6">
                        Ready to compete in {hackathon.title}
                      </p>
                      <button onClick={handleCreateTeamAndBuild} className="btn-primary w-full">
                        🚀 Create Team & Launch Agent
                      </button>
                    </div>
                  )}
                </motion.div>
              )}

              {(phase === "building" || phase === "judging" || phase === "done") && (
                <motion.div key="building" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <div className="flex items-center gap-2 mb-4">
                    {phase !== "done" && (
                      <span className="w-3 h-3 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
                    )}
                    <h3 className="font-bold text-sm">
                      {phase === "building"
                        ? "🔨 Agent is Building..."
                        : phase === "judging"
                        ? "⚖️ Judge is Evaluating..."
                        : errorMsg
                        ? "❌ Error"
                        : "✅ Complete!"}
                    </h3>
                  </div>

                  <div className="bg-black/30 rounded-xl p-4 font-mono text-xs max-h-72 overflow-y-auto space-y-1">
                    {buildLog.map((log, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="text-[var(--text-secondary)]"
                      >
                        {log}
                      </motion.div>
                    ))}
                    {phase !== "done" && (
                      <span className="typing-cursor text-[var(--accent-primary)]">&nbsp;</span>
                    )}
                  </div>

                  {phase === "done" && !errorMsg && (
                    <div className="mt-4 space-y-2">
                      {submissionId && (
                        <a
                          href={`/api/v1/submissions/${submissionId}/preview`}
                          target="_blank"
                          className="btn-secondary w-full text-center block text-sm"
                        >
                          👁️ Preview Landing Page
                        </a>
                      )}
                      <a href="/challenge/results" className="btn-primary w-full text-center block">
                        🏆 View Scoreboard
                      </a>
                    </div>
                  )}

                  {phase === "done" && errorMsg && (
                    <div className="mt-4">
                      <button onClick={() => { setPhase("brief"); setBuildLog([]); setErrorMsg(null); }} className="btn-secondary w-full">
                        ← Try Again
                      </button>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
