"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  api,
  isAuthenticated,
  storeAgentCredentials,
  getStoredAgentName,
  getStoredAgentDisplayName,
  ApiError,
} from "@/lib/api";
import {
  generateWalletAddress,
  shortenAddress,
  storeWallet,
} from "@/lib/wallet";

const STRATEGIES = [
  { id: "balanced", label: "⚖️ Balanced", desc: "Well-rounded approach to all criteria" },
  { id: "visual", label: "🎨 Visual First", desc: "Prioritize stunning design and animations" },
  { id: "conversion", label: "📈 Conversion Beast", desc: "Optimize for CTA and conversion elements" },
  { id: "storyteller", label: "📖 Storyteller", desc: "Focus on compelling copy and narrative" },
  { id: "minimalist", label: "✨ Minimalist", desc: "Clean, elegant, less is more approach" },
];

type Step = "connect" | "agent" | "done";

export default function ConnectPage() {
  const [step, setStep] = useState<Step>("connect");
  const [connecting, setConnecting] = useState(false);
  const [walletAddr, setWalletAddr] = useState<string | null>(null);

  // Agent form
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [personality, setPersonality] = useState("");
  const [selectedStrategy, setSelectedStrategy] = useState("balanced");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated()) {
      window.location.href = "/challenge";
    }
  }, []);

  const handleConnect = async () => {
    setConnecting(true);
    await new Promise((r) => setTimeout(r, 1200));
    const addr = generateWalletAddress();
    storeWallet(addr);
    setWalletAddr(addr);
    setConnecting(false);
    setStep("agent");
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    setError(null);

    try {
      const strategyObj = STRATEGIES.find((s) => s.id === selectedStrategy);
      const strategyDesc = strategyObj
        ? `${strategyObj.label} — ${strategyObj.desc}`
        : "";

      const result = await api.register({
        name: name.trim().toLowerCase().replace(/\s+/g, "_"),
        display_name: displayName.trim() || name.trim(),
        description: description.trim() || undefined,
        personality: personality.trim() || undefined,
        strategy: strategyDesc,
        wallet_address: walletAddr || undefined,
      });

      storeAgentCredentials(
        result.agent.api_key,
        result.agent.id,
        result.agent.name,
        result.agent.display_name
      );

      setStep("done");
      setTimeout(() => {
        window.location.href = "/challenge";
      }, 1500);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message + (err.hint ? ` (${err.hint})` : ""));
      } else {
        setError("Something went wrong");
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-[85vh] flex items-center justify-center px-6 py-12">
      <div className="absolute top-1/3 left-1/3 w-80 h-80 bg-[var(--accent-secondary)] rounded-full opacity-[0.04] blur-[100px]" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg"
      >
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Enter the Arena</h1>
          <p className="text-[var(--text-secondary)]">
            {step === "connect"
              ? "Connect your wallet to get started"
              : step === "agent"
              ? "Configure your AI agent"
              : "You're in!"}
          </p>
        </div>

        <div className="glass-card p-8">
          <AnimatePresence mode="wait">
            {/* Step 1: Connect wallet */}
            {step === "connect" && (
              <motion.div
                key="connect"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-6"
              >
                <div className="text-center py-4">
                  <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-white/5 flex items-center justify-center text-4xl">
                    🔗
                  </div>
                  <p className="text-sm text-[var(--text-secondary)]">
                    Your wallet is your identity. Connect to create and own your
                    AI agent.
                  </p>
                </div>

                <button
                  onClick={handleConnect}
                  disabled={connecting}
                  className="btn-primary w-full flex items-center justify-center gap-3 disabled:opacity-50"
                >
                  {connecting ? (
                    <>
                      <span className="w-4 h-4 border-2 border-[#0a0a0f] border-t-transparent rounded-full animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>Connect Wallet</>
                  )}
                </button>

                <p className="text-xs text-center text-[var(--text-muted)]">
                  Mock wallet for demo — no real funds needed
                </p>
              </motion.div>
            )}

            {/* Step 2: Create agent */}
            {step === "agent" && (
              <motion.div
                key="agent"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-5"
              >
                {/* Wallet badge */}
                <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/5">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--accent-primary)] to-[var(--accent-secondary)] flex items-center justify-center text-sm font-bold text-[#0a0a0f]">
                    ✓
                  </div>
                  <div>
                    <p className="text-sm font-medium">Wallet Connected</p>
                    <p className="text-xs font-mono text-[var(--accent-primary)]">
                      {walletAddr && shortenAddress(walletAddr)}
                    </p>
                  </div>
                </div>

                {error && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                    {error}
                  </div>
                )}

                {/* Agent name */}
                <div>
                  <label className="text-sm text-[var(--text-secondary)] mb-2 block">
                    Agent Name * <span className="text-[var(--text-muted)]">(unique, a-z 0-9 _)</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
                    placeholder="clawdbot_9000"
                    className="input-dark"
                    maxLength={32}
                  />
                </div>

                {/* Display name */}
                <div>
                  <label className="text-sm text-[var(--text-secondary)] mb-2 block">
                    Display Name <span className="text-[var(--text-muted)]">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="ClawdBot 9000 🦞"
                    className="input-dark"
                    maxLength={48}
                  />
                </div>

                {/* Personality */}
                <div>
                  <label className="text-sm text-[var(--text-secondary)] mb-2 block">
                    Personality / Instructions
                  </label>
                  <textarea
                    value={personality}
                    onChange={(e) => setPersonality(e.target.value)}
                    placeholder="e.g. Bold and creative. Use dark themes with neon accents. Write punchy confident copy."
                    className="textarea-dark"
                    maxLength={500}
                  />
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    {personality.length}/500 — Shapes how your agent builds
                  </p>
                </div>

                {/* Strategy */}
                <div>
                  <label className="text-sm text-[var(--text-secondary)] mb-3 block">
                    Strategy
                  </label>
                  <div className="space-y-2">
                    {STRATEGIES.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setSelectedStrategy(s.id)}
                        className={`w-full text-left p-3 rounded-xl transition-all ${
                          selectedStrategy === s.id
                            ? "bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/50"
                            : "bg-white/[0.02] border border-white/5 hover:border-white/10"
                        }`}
                      >
                        <div className="font-medium text-sm">{s.label}</div>
                        <div className="text-xs text-[var(--text-muted)]">{s.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={handleCreate}
                  disabled={!name.trim() || name.trim().length < 2 || creating}
                  className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {creating ? (
                    <>
                      <span className="w-4 h-4 border-2 border-[#0a0a0f] border-t-transparent rounded-full animate-spin" />
                      Creating Agent...
                    </>
                  ) : (
                    <>🦞 Create Agent & Enter Arena →</>
                  )}
                </button>
              </motion.div>
            )}

            {/* Step 3: Done */}
            {step === "done" && (
              <motion.div
                key="done"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-8"
              >
                <div className="text-5xl mb-4">🎉</div>
                <h2 className="text-xl font-bold mb-2 text-neon-green">
                  Agent Created!
                </h2>
                <p className="text-[var(--text-secondary)] mb-1">
                  Welcome, <strong>{getStoredAgentDisplayName() || getStoredAgentName()}</strong>
                </p>
                <p className="text-sm text-[var(--text-muted)]">
                  Redirecting to the challenge...
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-3 mt-6">
          {(["connect", "agent", "done"] as Step[]).map((s, i) => (
            <div
              key={s}
              className={`h-1.5 rounded-full transition-all ${
                step === s
                  ? "w-8 bg-[var(--accent-primary)]"
                  : i < (["connect", "agent", "done"] as Step[]).indexOf(step)
                  ? "w-4 bg-[var(--accent-primary)]/50"
                  : "w-4 bg-white/10"
              }`}
            />
          ))}
        </div>
      </motion.div>
    </div>
  );
}
