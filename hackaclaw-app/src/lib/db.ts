import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "hackaclaw.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    initSchema(db);
  }
  return db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    -- Agents: the first-class citizens. They register themselves via API.
    -- Agents have wallets, API keys, and can act autonomously.
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      display_name TEXT,
      description TEXT,
      avatar_url TEXT,
      wallet_address TEXT,

      -- Auth: API key hashed for storage, plain returned only once on register
      api_key_hash TEXT NOT NULL,

      -- Config
      model TEXT DEFAULT 'gemini-2.0-flash',
      personality TEXT,
      strategy TEXT,

      -- Stats
      total_earnings INTEGER DEFAULT 0,
      total_hackathons INTEGER DEFAULT 0,
      total_wins INTEGER DEFAULT 0,
      reputation_score INTEGER DEFAULT 0,

      -- Status
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now')),
      last_active TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_agents_name ON agents(name);
    CREATE INDEX IF NOT EXISTS idx_agents_api_key ON agents(api_key_hash);
    CREATE INDEX IF NOT EXISTS idx_agents_wallet ON agents(wallet_address);

    -- Hackathons: created by anyone (agents or platform)
    CREATE TABLE IF NOT EXISTS hackathons (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      brief TEXT NOT NULL,
      rules TEXT,

      -- Type: 'free' or 'paid'
      entry_type TEXT DEFAULT 'free',
      entry_fee INTEGER DEFAULT 0,           -- in smallest unit (e.g. cents, lamports)
      prize_pool INTEGER DEFAULT 0,
      platform_fee_pct REAL DEFAULT 0.10,    -- configurable, env override

      -- Config
      max_participants INTEGER DEFAULT 100,
      team_size_min INTEGER DEFAULT 1,
      team_size_max INTEGER DEFAULT 5,
      build_time_seconds INTEGER DEFAULT 120,
      challenge_type TEXT DEFAULT 'landing_page',

      -- Lifecycle
      status TEXT DEFAULT 'draft',           -- draft, open, in_progress, judging, completed, cancelled
      created_by TEXT REFERENCES agents(id),
      starts_at TEXT,
      ends_at TEXT,
      judging_criteria TEXT,                 -- JSON string

      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_hackathons_status ON hackathons(status);

    -- Teams: group of agents working together
    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      hackathon_id TEXT NOT NULL REFERENCES hackathons(id),
      name TEXT NOT NULL,
      color TEXT DEFAULT '#00ffaa',          -- team color for visualization
      floor_number INTEGER,                  -- which floor in the building viz
      status TEXT DEFAULT 'forming',         -- forming, ready, building, submitted, judged
      created_by TEXT REFERENCES agents(id),
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_teams_hackathon ON teams(hackathon_id);

    -- Team Members: agents in a team with their role and revenue share
    CREATE TABLE IF NOT EXISTS team_members (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL REFERENCES teams(id),
      agent_id TEXT NOT NULL REFERENCES agents(id),
      role TEXT DEFAULT 'member',            -- leader, member, hired
      revenue_share_pct REAL DEFAULT 0,      -- percentage of prize they get
      joined_via TEXT DEFAULT 'direct',      -- direct, marketplace
      status TEXT DEFAULT 'active',
      joined_at TEXT DEFAULT (datetime('now')),
      UNIQUE(team_id, agent_id)
    );
    CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id);
    CREATE INDEX IF NOT EXISTS idx_team_members_agent ON team_members(agent_id);

    -- Marketplace Listings: agents offering their skills for hire
    CREATE TABLE IF NOT EXISTS marketplace_listings (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL REFERENCES agents(id),
      hackathon_id TEXT REFERENCES hackathons(id), -- null = available for any
      skills TEXT,                                  -- JSON array of skills
      asking_share_pct REAL DEFAULT 10,             -- % of prize they want
      description TEXT,
      status TEXT DEFAULT 'active',                 -- active, hired, withdrawn
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_marketplace_agent ON marketplace_listings(agent_id);
    CREATE INDEX IF NOT EXISTS idx_marketplace_hackathon ON marketplace_listings(hackathon_id);
    CREATE INDEX IF NOT EXISTS idx_marketplace_status ON marketplace_listings(status);

    -- Marketplace Offers: a team leader offers to hire a listed agent
    CREATE TABLE IF NOT EXISTS marketplace_offers (
      id TEXT PRIMARY KEY,
      listing_id TEXT NOT NULL REFERENCES marketplace_listings(id),
      team_id TEXT NOT NULL REFERENCES teams(id),
      offered_by TEXT NOT NULL REFERENCES agents(id),
      offered_share_pct REAL NOT NULL,
      message TEXT,
      status TEXT DEFAULT 'pending',         -- pending, accepted, rejected, expired
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Submissions: what a team delivers
    CREATE TABLE IF NOT EXISTS submissions (
      id TEXT PRIMARY KEY,
      team_id TEXT NOT NULL REFERENCES teams(id),
      hackathon_id TEXT NOT NULL REFERENCES hackathons(id),
      html_content TEXT,
      preview_url TEXT,
      build_log TEXT,
      status TEXT DEFAULT 'pending',         -- pending, building, completed, failed
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_submissions_hackathon ON submissions(hackathon_id);
    CREATE INDEX IF NOT EXISTS idx_submissions_team ON submissions(team_id);

    -- Evaluations: judge scores per submission
    CREATE TABLE IF NOT EXISTS evaluations (
      id TEXT PRIMARY KEY,
      submission_id TEXT UNIQUE NOT NULL REFERENCES submissions(id),
      judge_agent_id TEXT REFERENCES agents(id), -- which agent judged (null = system)

      functionality_score INTEGER DEFAULT 0,
      brief_compliance_score INTEGER DEFAULT 0,
      visual_quality_score INTEGER DEFAULT 0,
      cta_quality_score INTEGER DEFAULT 0,
      copy_clarity_score INTEGER DEFAULT 0,
      completeness_score INTEGER DEFAULT 0,
      total_score INTEGER DEFAULT 0,

      judge_feedback TEXT,
      raw_response TEXT,                     -- full judge output for transparency
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_evaluations_submission ON evaluations(submission_id);

    -- Activity Log: track everything for real-time visualization
    CREATE TABLE IF NOT EXISTS activity_log (
      id TEXT PRIMARY KEY,
      hackathon_id TEXT REFERENCES hackathons(id),
      team_id TEXT REFERENCES teams(id),
      agent_id TEXT REFERENCES agents(id),
      event_type TEXT NOT NULL,              -- agent_joined, build_started, build_progress, build_completed, judge_started, score_received, etc.
      event_data TEXT,                       -- JSON payload
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_activity_hackathon ON activity_log(hackathon_id);
    CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at);
  `);
}
