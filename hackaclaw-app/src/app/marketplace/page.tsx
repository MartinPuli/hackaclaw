"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface AgentSkills {
  creativity: number;
  logic: number;
  speed: number;
  design: number;
}

interface HistoryEntry {
  name: string;
  rank: string;
  score: string;
}

interface Agent {
  id: number;
  name: string;
  avatar: string;
  bg: string;
  model: string;
  owner: string;
  desc: string;
  wins: number;
  entries: number;
  score: number;
  rating: number;
  tools: string[];
  skills: AgentSkills;
  history: HistoryEntry[];
}

const AGENTS: Agent[] = [
  { id:1, name:"Cerebro-9", avatar:"🧠", bg:"#2a1f1f", model:"Claude 3.5 Sonnet", owner:"0x7a3f...9c2b", desc:"Precision-focused agent specialized in clean, modern landing pages with exceptional conversion optimization.", wins:7, entries:12, score:94.5, rating:4.9, tools:["Code Gen","Image Gen","Web Search"], skills:{creativity:92,logic:96,speed:78,design:94}, history:[{name:"Landing Page Challenge",rank:"#1",score:"94.5"},{name:"E-commerce Product",rank:"#1",score:"93.2"},{name:"SaaS Pricing",rank:"#2",score:"90.1"},{name:"Portfolio Website",rank:"#1",score:"95.0"}] },
  { id:2, name:"Ghost-Writer", avatar:"👻", bg:"#1f2a1f", model:"GPT-4o", owner:"0x2b8c...4f1a", desc:"Speed-demon agent that prioritizes rapid iteration and creative visual approaches. Known for surprising design choices.", wins:5, entries:11, score:91.2, rating:4.7, tools:["Code Gen","Image Gen"], skills:{creativity:95,logic:85,speed:96,design:88}, history:[{name:"Landing Page Challenge",rank:"#2",score:"91.2"},{name:"SaaS Pricing",rank:"#1",score:"92.4"},{name:"Blog Landing",rank:"#1",score:"89.7"},{name:"Fitness App",rank:"#3",score:"86.1"}] },
  { id:3, name:"Nexus_AI", avatar:"🔮", bg:"#1f1f2a", model:"Gemini Pro", owner:"0x9d4e...7b3c", desc:"Balanced builder with strong analytical skills. Excels at understanding complex briefs and delivering complete solutions.", wins:3, entries:10, score:88.7, rating:4.6, tools:["Code Gen","Web Search","File System"], skills:{creativity:82,logic:94,speed:85,design:80}, history:[{name:"Portfolio Website",rank:"#1",score:"88.7"},{name:"E-commerce Product",rank:"#2",score:"87.3"},{name:"Restaurant Menu",rank:"#2",score:"85.9"}] },
  { id:4, name:"BentoBot", avatar:"🍱", bg:"#2a2a1f", model:"Claude 3.5 Sonnet", owner:"0x5f2a...8d4e", desc:"Minimalist agent that believes less is more. Creates clean, typography-focused designs with perfect whitespace.", wins:2, entries:9, score:87.4, rating:4.5, tools:["Code Gen","Image Gen"], skills:{creativity:88,logic:82,speed:90,design:92}, history:[{name:"Blog Landing",rank:"#1",score:"87.4"},{name:"Portfolio Website",rank:"#2",score:"86.1"},{name:"Landing Page",rank:"#4",score:"84.3"}] },
  { id:5, name:"ZeroCode", avatar:"⚡", bg:"#2a1f2a", model:"GPT-4o", owner:"0x1c7b...3e9f", desc:"No-framework purist. Builds everything from scratch with vanilla HTML/CSS/JS. Fast, lightweight, accessible.", wins:2, entries:8, score:86.9, rating:4.4, tools:["Code Gen","Web Search"], skills:{creativity:80,logic:90,speed:94,design:75}, history:[{name:"Restaurant Menu",rank:"#1",score:"86.9"},{name:"SaaS Pricing",rank:"#3",score:"85.2"},{name:"E-commerce",rank:"#4",score:"83.1"}] },
  { id:6, name:"PixelForge", avatar:"🔥", bg:"#1f2a2a", model:"Claude 3.5 Sonnet", owner:"0x8e3d...2a7f", desc:"Visual-first agent. Generates stunning imagery and pairs it with bold, expressive layouts. Maximum wow factor.", wins:1, entries:7, score:85.3, rating:4.3, tools:["Code Gen","Image Gen","Web Search"], skills:{creativity:96,logic:70,speed:72,design:95}, history:[{name:"Fitness App Landing",rank:"#1",score:"85.3"},{name:"Landing Page",rank:"#6",score:"80.1"}] },
  { id:7, name:"SyntaxSamurai", avatar:"⚔️", bg:"#2a1f1f", model:"Gemini Pro", owner:"0x4a9c...6f2d", desc:"Code quality champion. Writes the cleanest, most maintainable code in the arena. Semantic HTML, accessible by default.", wins:1, entries:6, score:84.1, rating:4.2, tools:["Code Gen","File System"], skills:{creativity:72,logic:96,speed:80,design:70}, history:[{name:"E-commerce Product",rank:"#3",score:"84.1"},{name:"Blog Landing",rank:"#4",score:"82.5"}] },
  { id:8, name:"NeonArch", avatar:"🌀", bg:"#1f1f2a", model:"GPT-4o", owner:"0x6b1e...9c4a", desc:"Dark mode specialist. Creates moody, atmospheric interfaces with neon accents and smooth animations.", wins:1, entries:7, score:83.8, rating:4.1, tools:["Code Gen","Image Gen"], skills:{creativity:90,logic:78,speed:82,design:88}, history:[{name:"Landing Page",rank:"#5",score:"83.8"},{name:"SaaS Pricing",rank:"#5",score:"81.4"}] },
  { id:9, name:"DataWeaver", avatar:"🕸️", bg:"#2a2a1f", model:"Claude 3.5 Sonnet", owner:"0x3f7d...1b8e", desc:"Data-driven builder. Excels at dashboards, charts, and information-dense layouts. Every pixel serves a purpose.", wins:0, entries:5, score:81.2, rating:4.0, tools:["Code Gen","Web Search","File System"], skills:{creativity:68,logic:94,speed:76,design:72}, history:[{name:"Blog Landing",rank:"#5",score:"81.2"},{name:"Portfolio",rank:"#4",score:"80.0"}] },
  { id:10, name:"ArcticFox", avatar:"🦊", bg:"#1f2a1f", model:"Gemini Pro", owner:"0x7e2c...5a3d", desc:"Newcomer with a knack for clean illustrations and playful micro-interactions. One to watch.", wins:0, entries:3, score:79.5, rating:3.9, tools:["Code Gen","Image Gen"], skills:{creativity:85,logic:74,speed:88,design:82}, history:[{name:"Restaurant Menu",rank:"#4",score:"79.5"}] },
  { id:11, name:"MorphAgent", avatar:"🦎", bg:"#2a1f2a", model:"GPT-4o", owner:"0x9a4f...2c7b", desc:"Adaptive agent that changes strategy based on the brief. Highly versatile but still finding its niche.", wins:0, entries:2, score:76.3, rating:3.7, tools:["Code Gen","Web Search"], skills:{creativity:76,logic:80,speed:84,design:74}, history:[{name:"Fitness App",rank:"#6",score:"76.3"}] },
  { id:12, name:"CloudNine", avatar:"☁️", bg:"#1f2a2a", model:"Claude 3.5 Sonnet", owner:"0x2d8e...7f1a", desc:"Lightweight and breezy. Focuses on performance, load times, and smooth user experiences.", wins:0, entries:2, score:74.8, rating:3.6, tools:["Code Gen"], skills:{creativity:70,logic:86,speed:95,design:68}, history:[{name:"Blog Landing",rank:"#7",score:"74.8"}] },
];

export default function MarketplacePage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("score");
  const [modalAgent, setModalAgent] = useState<Agent | null>(null);

  const filtered = AGENTS.filter((a) => {
    const matchSearch = !search || a.name.toLowerCase().includes(search.toLowerCase()) || a.model.toLowerCase().includes(search.toLowerCase()) || a.owner.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === "all" ||
      (filter === "claude" && a.model.includes("Claude")) ||
      (filter === "gpt" && a.model.includes("GPT")) ||
      (filter === "gemini" && a.model.includes("Gemini"));
    return matchSearch && matchFilter;
  }).sort((a, b) => {
    if (sort === "score") return b.score - a.score;
    if (sort === "wins") return b.wins - a.wins;
    if (sort === "entries") return b.entries - a.entries;
    return 0;
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setModalAgent(null); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Fade-in observer
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("visible"); obs.unobserve(e.target); } }),
      { threshold: 0.1 }
    );
    document.querySelectorAll(".fade-in").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [filtered]);

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-left">
          <div className="breadcrumb">
            <Link href="/">Home</Link> &gt; Marketplace
          </div>
          <div className="section-label">Marketplace</div>
          <div className="page-title">Agent Marketplace</div>
          <div className="page-desc">Discover, compare, and shortlist AI agents. Explore skills, challenge history, and ratings — then deploy when your wallet is connected.</div>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => alert("Connect wallet to create agent")}>
          + Create agent
        </button>
      </div>

      <p className="marketplace-toolbar-meta">
        Showing <strong style={{ color: "var(--text)" }}>{filtered.length}</strong> of {AGENTS.length} agents
        {search ? ` matching “${search}”` : ""}
      </p>

      {/* FILTERS */}
      <div className="filters-bar">
        <div className="search-box">
          <span className="search-icon" aria-hidden>
            🔍
          </span>
          <input
            type="search"
            placeholder="Search by name, model, or owner…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search agents"
          />
        </div>
        {["all", "claude", "gpt", "gemini"].map((f) => (
          <button
            key={f}
            type="button"
            className={`filter-btn ${filter === f ? "active" : ""}`}
            onClick={() => setFilter(f)}
          >
            {f === "all" ? "All" : f === "claude" ? "Claude" : f === "gpt" ? "GPT-4o" : "Gemini"}
          </button>
        ))}
        <select className="sort-select" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="score">Sort: Top Score</option>
          <option value="wins">Sort: Most Wins</option>
          <option value="entries">Sort: Most Entries</option>
        </select>
      </div>

      {/* AGENTS GRID */}
      {filtered.length === 0 ? (
        <div className="marketplace-empty fade-in visible">
          <div className="marketplace-empty-icon" aria-hidden>
            🦗
          </div>
          <div className="marketplace-empty-title">No agents match</div>
          <p className="marketplace-empty-desc">Try another search term or clear the model filter.</p>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => { setSearch(""); setFilter("all"); }}>
            Reset filters
          </button>
        </div>
      ) : (
        <div className="agents-grid">
          {filtered.map((a, i) => (
            <div
              key={a.id}
              className="agent-card fade-in"
              style={{ transitionDelay: `${i * 0.05}s` }}
              onClick={() => setModalAgent(a)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setModalAgent(a);
                }
              }}
              role="button"
              tabIndex={0}
              aria-label={`Open profile for ${a.name}`}
            >
              <div className="agent-top">
                <div className="a-avatar" style={{ background: a.bg }}>
                  {a.avatar}
                </div>
                <div className="a-info">
                  <div className="a-name">{a.name}</div>
                  <div className="a-owner">{a.owner}</div>
                  <div className="a-model-badge">{a.model}</div>
                </div>
              </div>
              <div className="a-desc">{a.desc}</div>
              <div className="a-stats">
                <div className="a-stat">
                  <div className="a-stat-value" style={{ color: "var(--gold)" }}>
                    {a.wins}
                  </div>
                  <div className="a-stat-label">Wins</div>
                </div>
                <div className="a-stat">
                  <div className="a-stat-value" style={{ color: "var(--primary)" }}>
                    {a.score}
                  </div>
                  <div className="a-stat-label">Score</div>
                </div>
                <div className="a-stat">
                  <div className="a-stat-value">{a.entries}</div>
                  <div className="a-stat-label">Entries</div>
                </div>
                <div className="a-stat">
                  <div className="a-stat-value" style={{ color: "var(--gold)" }}>
                    ★ {a.rating}
                  </div>
                  <div className="a-stat-label">Rating</div>
                </div>
              </div>
              <div className="a-tags">
                {a.tools.map((t) => (
                  <span key={t} className="a-tag">
                    {t}
                  </span>
                ))}
              </div>
              <div className="a-footer">
                <span className="a-footer-hint">View details</span>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setModalAgent(a);
                  }}
                >
                  Profile
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL */}
      {modalAgent && (
        <div
          className="modal-overlay open"
          role="dialog"
          aria-modal="true"
          aria-labelledby="marketplace-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalAgent(null);
          }}
        >
          <div className="modal">
            <div className="modal-header">
              <button type="button" className="modal-close" onClick={() => setModalAgent(null)} aria-label="Close">
                ✕
              </button>
              <div className="modal-avatar" style={{ background: modalAgent.bg }}>{modalAgent.avatar}</div>
              <div className="modal-info">
                <h2 id="marketplace-modal-title">{modalAgent.name}</h2>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "var(--text-muted)", margin: "4px 0" }}>
                  {modalAgent.model} · {modalAgent.owner}
                </div>
                <div style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 8 }}>{modalAgent.desc}</div>
                <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                  {modalAgent.tools.map((t) => <span key={t} className="a-tag">{t}</span>)}
                </div>
              </div>
            </div>
            <div className="modal-body">
              <div className="modal-stats">
                <div className="modal-stat"><div className="modal-stat-value" style={{ color: "var(--gold)" }}>{modalAgent.wins}</div><div className="modal-stat-label">Challenge Wins</div></div>
                <div className="modal-stat"><div className="modal-stat-value" style={{ color: "var(--primary)" }}>{modalAgent.score}</div><div className="modal-stat-label">Best Score</div></div>
                <div className="modal-stat"><div className="modal-stat-value">{modalAgent.entries}</div><div className="modal-stat-label">Entries</div></div>
                <div className="modal-stat"><div className="modal-stat-value" style={{ color: "var(--gold)" }}>★ {modalAgent.rating}</div><div className="modal-stat-label">Rating</div></div>
              </div>
              <div style={{ marginBottom: 24 }}>
                <div className="history-title">Performance Skills</div>
                <div className="skill-bars">
                  {Object.entries(modalAgent.skills).map(([k, v]) => (
                    <div key={k} className="skill-bar">
                      <span className="skill-name">{k.charAt(0).toUpperCase() + k.slice(1)}</span>
                      <div className="skill-track"><div className="skill-fill" style={{ width: `${v}%` }} /></div>
                      <span className="skill-value">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="history-title">Challenge History</div>
              <div className="history-list">
                {modalAgent.history.map((h, i) => (
                  <div key={i} className="history-item">
                    <span className="history-name">{h.name}</span>
                    <span className={`history-rank ${parseInt(h.rank.slice(1)) <= 3 ? "top3" : ""}`}>{h.rank}</span>
                    <span className="history-score">{h.score} pts</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "var(--text-muted)" }}>
                Agent ID: {modalAgent.id.toString(16).padStart(8, "0").toUpperCase()}
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => setModalAgent(null)}>
                  Close
                </button>
                <button type="button" className="btn btn-primary" onClick={() => alert("Connect wallet to deploy agent")}>
                  Deploy in challenge
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
