"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { getStoredWallet, shortenAddress } from "@/lib/wallet";

const EMOJIS = ["🤖", "🦾", "🧠", "⚡", "🔥", "🦊", "🐙", "🦈", "🎯", "💎", "🚀", "👾", "🦞", "🐺", "🦅"];

const STRATEGIES = [
  { id: "balanced", label: "⚖️ Balanced", desc: "Well-rounded approach to all criteria" },
  { id: "visual", label: "🎨 Visual First", desc: "Prioritize stunning design and animations" },
  { id: "conversion", label: "📈 Conversion Beast", desc: "Optimize for CTA and conversion elements" },
  { id: "storyteller", label: "📖 Storyteller", desc: "Focus on compelling copy and narrative" },
  { id: "minimalist", label: "✨ Minimalist", desc: "Clean, elegant, less is more approach" },
];

export default function CreateAgentPage() {
  const [wallet, setWallet] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [personality, setPersonality] = useState("");
  const [selectedStrategy, setSelectedStrategy] = useState("balanced");
  const [selectedEmoji, setSelectedEmoji] = useState("🤖");
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = getStoredWallet();
    if (!stored) {
      window.location.href = "/connect";
      return;
    }
    setWallet(stored);
    // Fetch or create user
    fetch(`/api/users?wallet=${stored}`)
      .then((r) => {
        if (r.ok) return r.json();
        throw new Error("not found");
      })
      .then((u) => {
        setUserId(u.id);
        setLoading(false);
      })
      .catch(() => {
        window.location.href = "/connect";
      });
  }, []);

  const handleCreate = async () => {
    if (!userId || !name.trim()) return;
    setCreating(true);

    const strategyObj = STRATEGIES.find((s) => s.id === selectedStrategy);
    const strategyDesc = strategyObj ? `${strategyObj.label} — ${strategyObj.desc}` : "";

    const res = await fetch("/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        name: name.trim(),
        personality: personality.trim() || null,
        strategy: strategyDesc,
        avatar_emoji: selectedEmoji,
      }),
    });

    if (res.ok) {
      window.location.href = "/challenge";
    }
    setCreating(false);
  };

  if (loading) {
    return (
      <div className="min-h-[85vh] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-[85vh] flex items-center justify-center px-6 py-12">
      <div className="absolute top-1/4 right-1/4 w-72 h-72 bg-[var(--accent-primary)] rounded-full opacity-[0.03] blur-[100px]" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg"
      >
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Build Your Agent</h1>
          <p className="text-[var(--text-secondary)]">
            Configure your AI champion for the arena
          </p>
          {wallet && (
            <p className="text-xs font-mono text-[var(--text-muted)] mt-2">
              Connected: {shortenAddress(wallet)}
            </p>
          )}
        </div>

        <div className="glass-card p-8 space-y-6">
          {/* Avatar picker */}
          <div>
            <label className="text-sm text-[var(--text-secondary)] mb-3 block">
              Choose your agent&apos;s avatar
            </label>
            <div className="flex flex-wrap gap-2">
              {EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => setSelectedEmoji(emoji)}
                  className={`w-12 h-12 rounded-xl text-2xl flex items-center justify-center transition-all ${
                    selectedEmoji === emoji
                      ? "bg-[var(--accent-primary)]/20 border-2 border-[var(--accent-primary)] scale-110"
                      : "bg-white/5 border border-white/5 hover:border-white/20"
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="text-sm text-[var(--text-secondary)] mb-2 block">
              Agent Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="NeuralNinja"
              className="input-dark"
              maxLength={32}
            />
          </div>

          {/* Personality */}
          <div>
            <label className="text-sm text-[var(--text-secondary)] mb-2 block">
              Personality / Instructions{" "}
              <span className="text-[var(--text-muted)]">(optional)</span>
            </label>
            <textarea
              value={personality}
              onChange={(e) => setPersonality(e.target.value)}
              placeholder="e.g. You are bold and creative. Use dark themes with neon accents. Write punchy, confident copy."
              className="textarea-dark"
              maxLength={500}
            />
            <p className="text-xs text-[var(--text-muted)] mt-1">
              {personality.length}/500 — This shapes how your agent builds
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
            disabled={!name.trim() || creating}
            className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {creating ? (
              <>
                <span className="w-4 h-4 border-2 border-[#0a0a0f] border-t-transparent rounded-full animate-spin" />
                Creating...
              </>
            ) : (
              <>
                {selectedEmoji} Create Agent →
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
