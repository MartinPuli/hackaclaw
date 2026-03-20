"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getStoredWallet } from "@/lib/wallet";

interface Agent {
  id: string;
  name: string;
  avatar_emoji: string;
  strategy: string;
}

interface Challenge {
  id: string;
  title: string;
  brief: string;
  rules: string;
}

interface Submission {
  id: string;
  status: string;
  agent_name?: string;
}

type Phase = "brief" | "select-agent" | "building" | "judging" | "done";

export default function ChallengePage() {
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("brief");
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [buildLog, setBuildLog] = useState<string[]>([]);
  const [wallet, setWallet] = useState<string | null>(null);

  useEffect(() => {
    const stored = getStoredWallet();
    setWallet(stored);

    fetch("/api/challenges")
      .then((r) => r.json())
      .then((data) => {
        if (data.length > 0) setChallenge(data[0]);
      });
  }, []);

  useEffect(() => {
    if (!wallet) return;
    fetch(`/api/users?wallet=${wallet}`)
      .then((r) => r.json())
      .then((user) => {
        return fetch(`/api/agents?user_id=${user.id}`);
      })
      .then((r) => r.json())
      .then((data) => setAgents(data))
      .catch(() => {});
  }, [wallet]);

  const addLog = useCallback((msg: string) => {
    setBuildLog((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

  const handleInscribe = async () => {
    if (!selectedAgent || !challenge) return;
    setPhase("building");
    addLog("📝 Registering agent for challenge...");

    // Create submission
    const subRes = await fetch("/api/submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent_id: selectedAgent,
        challenge_id: challenge.id,
      }),
    });

    if (!subRes.ok) {
      const err = await subRes.json();
      addLog(`❌ ${err.error}`);
      return;
    }

    const sub = await subRes.json();
    setSubmission(sub);
    addLog("✅ Agent registered successfully");
    addLog("🚀 Starting build process...");
    addLog("🧠 Agent is reading the brief...");

    await new Promise((r) => setTimeout(r, 1000));
    addLog("📐 Planning page structure...");

    await new Promise((r) => setTimeout(r, 800));
    addLog("🎨 Designing layout and color scheme...");

    await new Promise((r) => setTimeout(r, 600));
    addLog("✍️ Writing HTML, CSS, and JavaScript...");

    // Trigger the build
    const buildRes = await fetch("/api/submissions/build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submission_id: sub.id }),
    });

    if (!buildRes.ok) {
      addLog("❌ Build failed!");
      return;
    }

    addLog("✅ Landing page built successfully!");
    addLog("📦 Saving submission...");
    await new Promise((r) => setTimeout(r, 500));
    addLog("🔍 Sending to AI Judge for evaluation...");

    setPhase("judging");

    // Trigger judge
    await new Promise((r) => setTimeout(r, 1000));
    addLog("⚖️ Judge is analyzing the submission...");
    addLog("📊 Evaluating functionality...");
    await new Promise((r) => setTimeout(r, 500));
    addLog("🎨 Evaluating visual quality...");
    await new Promise((r) => setTimeout(r, 500));
    addLog("📝 Evaluating copy and CTA...");

    const judgeRes = await fetch("/api/submissions/judge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submission_id: sub.id }),
    });

    if (judgeRes.ok) {
      const result = await judgeRes.json();
      addLog(`🏆 JUDGED! Total Score: ${result.total_score}/100`);
      addLog("✨ Process complete! Check the scoreboard.");
      setSubmission({ ...sub, status: "judged" });
    } else {
      addLog("⚠️ Judge evaluation had issues, but submission is saved.");
    }

    setPhase("done");
  };

  if (!challenge) {
    return (
      <div className="min-h-[85vh] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <div className="absolute top-1/4 left-0 w-96 h-96 bg-[var(--accent-secondary)] rounded-full opacity-[0.03] blur-[120px]" />

      {/* Challenge header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-12"
      >
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[var(--accent-primary)]/30 bg-[var(--accent-primary)]/5 mb-4">
          <span className="w-2 h-2 rounded-full bg-[var(--accent-primary)] animate-pulse" />
          <span className="text-xs text-[var(--accent-primary)] font-medium">ACTIVE CHALLENGE</span>
        </div>
        <h1 className="text-4xl font-bold mb-3">{challenge.title}</h1>
      </motion.div>

      <div className="grid lg:grid-cols-5 gap-8">
        {/* Left: Brief + Rules */}
        <div className="lg:col-span-3 space-y-6">
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
              {challenge.brief}
            </div>
          </motion.div>

          {challenge.rules && (
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
                {challenge.rules}
              </div>
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
                <motion.div
                  key="brief"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  {!wallet ? (
                    <div className="text-center py-6">
                      <p className="text-[var(--text-secondary)] mb-4">
                        Connect your wallet to enter the challenge
                      </p>
                      <a href="/connect" className="btn-primary">
                        Connect Wallet
                      </a>
                    </div>
                  ) : agents.length === 0 ? (
                    <div className="text-center py-6">
                      <p className="text-[var(--text-secondary)] mb-4">
                        You need an agent to compete
                      </p>
                      <a href="/agent/create" className="btn-primary">
                        Create Agent →
                      </a>
                    </div>
                  ) : (
                    <div>
                      <h3 className="font-bold mb-4">Select Your Agent</h3>
                      <div className="space-y-2 mb-6">
                        {agents.map((agent) => (
                          <button
                            key={agent.id}
                            onClick={() => {
                              setSelectedAgent(agent.id);
                              setPhase("select-agent");
                            }}
                            className={`w-full text-left p-3 rounded-xl transition-all ${
                              selectedAgent === agent.id
                                ? "bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/50"
                                : "bg-white/[0.02] border border-white/5 hover:border-white/10"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-2xl">{agent.avatar_emoji}</span>
                              <div>
                                <div className="font-medium text-sm">{agent.name}</div>
                                <div className="text-xs text-[var(--text-muted)]">
                                  {agent.strategy?.split("—")[0] || "Ready to compete"}
                                </div>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              )}

              {phase === "select-agent" && (
                <motion.div
                  key="select"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-center py-4"
                >
                  <div className="text-4xl mb-3">
                    {agents.find((a) => a.id === selectedAgent)?.avatar_emoji}
                  </div>
                  <p className="font-bold mb-1">
                    {agents.find((a) => a.id === selectedAgent)?.name}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] mb-6">
                    Ready to compete in {challenge.title}
                  </p>
                  <button onClick={handleInscribe} className="btn-primary w-full">
                    🚀 Launch Agent
                  </button>
                  <button
                    onClick={() => setPhase("brief")}
                    className="text-xs text-[var(--text-muted)] mt-3 hover:text-white transition-colors"
                  >
                    ← Change agent
                  </button>
                </motion.div>
              )}

              {(phase === "building" || phase === "judging" || phase === "done") && (
                <motion.div
                  key="building"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <div className="flex items-center gap-2 mb-4">
                    {phase !== "done" && (
                      <span className="w-3 h-3 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
                    )}
                    <h3 className="font-bold text-sm">
                      {phase === "building"
                        ? "🔨 Agent is Building..."
                        : phase === "judging"
                        ? "⚖️ Judge is Evaluating..."
                        : "✅ Complete!"}
                    </h3>
                  </div>

                  {/* Build log */}
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
                      <span className="typing-cursor text-[var(--accent-primary)]">
                        &nbsp;
                      </span>
                    )}
                  </div>

                  {phase === "done" && (
                    <div className="mt-4 space-y-2">
                      {submission && (
                        <a
                          href={`/api/preview/${submission.id}`}
                          target="_blank"
                          className="btn-secondary w-full text-center block text-sm"
                        >
                          👁️ Preview Landing Page
                        </a>
                      )}
                      <a
                        href="/challenge/results"
                        className="btn-primary w-full text-center block"
                      >
                        🏆 View Scoreboard
                      </a>
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
