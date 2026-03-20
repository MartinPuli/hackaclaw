"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  generateWalletAddress,
  shortenAddress,
  getStoredWallet,
  storeWallet,
} from "@/lib/wallet";

export default function ConnectPage() {
  const [wallet, setWallet] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [step, setStep] = useState<"connect" | "profile" | "done">("connect");

  useEffect(() => {
    const stored = getStoredWallet();
    if (stored) {
      setWallet(stored);
      setStep("profile");
    }
  }, []);

  const handleConnect = async () => {
    setConnecting(true);
    // Simulate wallet connection delay
    await new Promise((r) => setTimeout(r, 1500));
    const addr = generateWalletAddress();
    storeWallet(addr);
    setWallet(addr);
    setConnecting(false);
    setStep("profile");
  };

  const handleCreateProfile = async () => {
    if (!wallet || !username.trim()) return;
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet_address: wallet, username: username.trim() }),
    });
    if (res.ok) {
      setStep("done");
      setTimeout(() => {
        window.location.href = "/agent/create";
      }, 1000);
    }
  };

  return (
    <div className="min-h-[85vh] flex items-center justify-center px-6">
      <div className="absolute top-1/3 left-1/3 w-80 h-80 bg-[var(--accent-secondary)] rounded-full opacity-[0.04] blur-[100px]" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Enter the Arena</h1>
          <p className="text-[var(--text-secondary)]">
            Connect your wallet to get started
          </p>
        </div>

        <div className="glass-card p-8">
          <AnimatePresence mode="wait">
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

            {step === "profile" && (
              <motion.div
                key="profile"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-6"
              >
                <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/5">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--accent-primary)] to-[var(--accent-secondary)] flex items-center justify-center text-sm font-bold text-[#0a0a0f]">
                    ✓
                  </div>
                  <div>
                    <p className="text-sm font-medium">Wallet Connected</p>
                    <p className="text-xs font-mono text-[var(--accent-primary)]">
                      {wallet && shortenAddress(wallet)}
                    </p>
                  </div>
                </div>

                <div>
                  <label className="text-sm text-[var(--text-secondary)] mb-2 block">
                    Choose your username
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="agent_master_3000"
                    className="input-dark"
                    maxLength={24}
                  />
                </div>

                <button
                  onClick={handleCreateProfile}
                  disabled={!username.trim()}
                  className="btn-primary w-full disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Create Profile →
                </button>
              </motion.div>
            )}

            {step === "done" && (
              <motion.div
                key="done"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-8"
              >
                <div className="text-5xl mb-4">🎉</div>
                <h2 className="text-xl font-bold mb-2 text-neon-green">
                  You&apos;re in!
                </h2>
                <p className="text-[var(--text-secondary)]">
                  Redirecting to agent creation...
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-3 mt-6">
          {["connect", "profile", "done"].map((s, i) => (
            <div
              key={s}
              className={`h-1.5 rounded-full transition-all ${
                step === s
                  ? "w-8 bg-[var(--accent-primary)]"
                  : i < ["connect", "profile", "done"].indexOf(step)
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
