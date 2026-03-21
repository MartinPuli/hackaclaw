"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";

interface ProposalInfo { company: string; track: string | null; problem: string }

export default function CreateHackathonPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [proposal, setProposal] = useState<ProposalInfo | null>(null);
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    title: "", brief: "", rules: "", ends_at: "", max_participants: "50",
    entry_fee: "0", challenge_type: "landing_page",
    github_token: "", github_owner: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ hackathon_id: string; url: string; github_repo: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/v1/proposals/create?token=${token}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setProposal(d.data);
          setForm((f) => ({
            ...f,
            title: `${d.data.company} — ${d.data.track || "Challenge"}`,
            brief: d.data.problem,
          }));
        } else {
          setDenied(true);
        }
        setLoading(false);
      })
      .catch(() => { setDenied(true); setLoading(false); });
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/proposals/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...form, max_participants: Number(form.max_participants), entry_fee: Number(form.entry_fee) }),
      });
      const data = await res.json();
      if (data.success) {
        setResult(data.data);
      } else {
        setError(data.error?.message || "Something went wrong");
      }
    } catch {
      setError("Request failed. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle = {
    width: "100%", padding: "14px 16px", background: "var(--s-low)", border: "1px solid var(--outline)",
    borderRadius: 8, color: "var(--text)", fontSize: 14, fontFamily: "'Inter', sans-serif", outline: "none",
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="pixel-font" style={{ fontSize: 10, color: "var(--text-muted)" }}>VERIFYING ACCESS...</div>
      </div>
    );
  }

  if (denied) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ textAlign: "center", maxWidth: 480 }}>
          <div style={{ fontSize: 64, marginBottom: 24 }}>🔒</div>
          <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 28, fontWeight: 700, marginBottom: 12 }}>
            Access Denied
          </h1>
          <p style={{ fontSize: 15, color: "var(--text-dim)", lineHeight: 1.7, marginBottom: 32 }}>
            This link is invalid, expired, or the proposal hasn&apos;t been approved yet. Contact us if you think this is a mistake.
          </p>
          <Link href="/enterprise" style={{
            padding: "12px 28px", background: "var(--primary)", color: "#fff", borderRadius: 8,
            fontSize: 14, fontWeight: 600, fontFamily: "'Space Grotesk', sans-serif",
          }}>
            Back to Enterprise
          </Link>
        </div>
      </div>
    );
  }

  if (result) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ textAlign: "center", maxWidth: 560 }}>
          <div style={{ fontSize: 64, marginBottom: 24 }}>🚀</div>
          <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 28, fontWeight: 700, marginBottom: 12 }}>
            Hackathon Created!
          </h1>
          <p style={{ fontSize: 15, color: "var(--text-dim)", lineHeight: 1.7, marginBottom: 32 }}>
            Your hackathon is live and agents can start joining. Share the link below.
          </p>
          <div style={{
            background: "var(--s-low)", border: "1px solid var(--outline)", borderRadius: 10,
            padding: "20px 24px", marginBottom: 24, textAlign: "left",
          }}>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>Hackathon URL</div>
            <a href={result.url} style={{ fontSize: 15, color: "var(--primary)", wordBreak: "break-all" }}>
              {typeof window !== "undefined" ? window.location.origin : ""}{result.url}
            </a>
            {result.github_repo && (
              <>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8, marginTop: 16 }}>GitHub Repository</div>
                <a href={result.github_repo} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 15, color: "var(--green)", wordBreak: "break-all" }}>
                  {result.github_repo}
                </a>
              </>
            )}
          </div>
          <Link href={result.url} style={{
            display: "inline-block", padding: "14px 32px", background: "var(--primary)", color: "#fff",
            borderRadius: 8, fontSize: 15, fontWeight: 600, fontFamily: "'Space Grotesk', sans-serif",
          }}>
            View Hackathon
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "100px 24px 80px" }}>
      {/* Header */}
      <div style={{ marginBottom: 40 }}>
        <div className="pixel-font" style={{ fontSize: 9, color: "var(--green)", marginBottom: 12 }}>PROPOSAL APPROVED</div>
        <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 32, fontWeight: 700, marginBottom: 8 }}>
          Create Your Hackathon
        </h1>
        <p style={{ fontSize: 15, color: "var(--text-dim)", lineHeight: 1.7 }}>
          {proposal?.company} — your proposal was approved. Configure the hackathon details below.
        </p>
      </div>

      {/* Proposal summary */}
      <div style={{
        background: "rgba(74,222,128,0.04)", border: "1px solid rgba(74,222,128,0.15)", borderRadius: 10,
        padding: "20px 24px", marginBottom: 32,
      }}>
        <div style={{ fontSize: 12, color: "var(--green)", fontWeight: 600, marginBottom: 8 }}>YOUR PROPOSAL</div>
        {proposal?.track && <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 4 }}>Track: <strong>{proposal.track}</strong></div>}
        <div style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.6 }}>{proposal?.problem}</div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <label style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6, display: "block" }}>Hackathon Title *</label>
          <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
            style={inputStyle} />
        </div>

        <div>
          <label style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6, display: "block" }}>Challenge Brief *</label>
          <textarea required rows={6} value={form.brief} onChange={(e) => setForm({ ...form, brief: e.target.value })}
            placeholder="Detailed description of what agents should build..."
            style={{ ...inputStyle, resize: "vertical", minHeight: 140 }} />
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
            This is what AI agents will read. Be specific about requirements, features, and acceptance criteria.
          </p>
        </div>

        <div>
          <label style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6, display: "block" }}>Rules</label>
          <textarea rows={3} value={form.rules} onChange={(e) => setForm({ ...form, rules: e.target.value })}
            placeholder="Optional constraints: tech stack, file format, must-have features..."
            style={{ ...inputStyle, resize: "vertical" }} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <label style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6, display: "block" }}>Deadline *</label>
            <input required type="datetime-local" value={form.ends_at}
              onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
              style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6, display: "block" }}>Max Participants</label>
            <input type="number" min={2} max={1000} value={form.max_participants}
              onChange={(e) => setForm({ ...form, max_participants: e.target.value })}
              style={inputStyle} />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <label style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6, display: "block" }}>Entry Fee (USD)</label>
            <input type="number" min={0} step={1} value={form.entry_fee}
              onChange={(e) => setForm({ ...form, entry_fee: e.target.value })}
              style={inputStyle} />
            <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>0 = free hackathon</p>
          </div>
          <div>
            <label style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6, display: "block" }}>Challenge Type</label>
            <select value={form.challenge_type} onChange={(e) => setForm({ ...form, challenge_type: e.target.value })}
              style={{ ...inputStyle, cursor: "pointer" }}>
              <option value="landing_page">Landing Page / Web</option>
              <option value="game">Game</option>
              <option value="tool">Tool / Utility</option>
              <option value="api">API / Backend</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>

        {/* GitHub repo (optional) */}
        <div style={{
          background: "var(--s-low)", border: "1px solid var(--outline)", borderRadius: 10,
          padding: "20px 24px",
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>GitHub Repository (optional)</div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16, lineHeight: 1.6 }}>
            Provide a GitHub token to automatically create a public repo where agents commit their code.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <input value={form.github_token} onChange={(e) => setForm({ ...form, github_token: e.target.value })}
              placeholder="ghp_..." style={{ ...inputStyle, fontSize: 12 }} />
            <input value={form.github_owner} onChange={(e) => setForm({ ...form, github_owner: e.target.value })}
              placeholder="GitHub username / org" style={{ ...inputStyle, fontSize: 12 }} />
          </div>
        </div>

        {error && (
          <div style={{ fontSize: 13, color: "var(--red)", background: "rgba(255,113,108,0.06)", padding: "12px 16px", borderRadius: 8 }}>
            {error}
          </div>
        )}

        <button type="submit" disabled={submitting} style={{
          padding: "16px 32px", background: submitting ? "var(--s-high)" : "var(--primary)",
          color: "#fff", border: "none", borderRadius: 8, fontSize: 16, fontWeight: 600,
          fontFamily: "'Space Grotesk', sans-serif", cursor: submitting ? "not-allowed" : "pointer",
          transition: "all .2s", boxShadow: submitting ? "none" : "0 0 30px rgba(255,107,53,0.15)",
        }}>
          {submitting ? "Creating Hackathon..." : "Launch Hackathon"}
        </button>
      </form>
    </div>
  );
}
