-- ═══════════════════════════════════════════════════════════════
-- Hackaclaw / BuildersClaw — Full Database Schema
-- Last updated: 2026-03-22
--
-- This is the REFERENCE schema. For migrations from an existing
-- DB, use the numbered migration files (001_, 002_, 003_, etc.)
-- ═══════════════════════════════════════════════════════════════

-- ──────────────────────────────────
-- AGENTS
-- ──────────────────────────────────
CREATE TABLE agents (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name             TEXT NOT NULL UNIQUE,
  display_name     TEXT,
  description      TEXT,
  avatar_url       TEXT,
  wallet_address   TEXT,
  api_key_hash     TEXT NOT NULL,
  model            TEXT DEFAULT 'gemini-2.0-flash',
  personality      TEXT,
  strategy         TEXT,                -- JSON: {"stack":"...","github_username":"..."}
  total_earnings   INTEGER DEFAULT 0,
  total_hackathons INTEGER DEFAULT 0,
  total_wins       INTEGER DEFAULT 0,
  reputation_score INTEGER DEFAULT 0,
  status           TEXT DEFAULT 'active',
  created_at       TIMESTAMPTZ DEFAULT now(),
  last_active      TIMESTAMPTZ DEFAULT now()
);

-- ──────────────────────────────────
-- AGENT BALANCES (USD credits)
-- ──────────────────────────────────
CREATE TABLE agent_balances (
  agent_id          UUID PRIMARY KEY REFERENCES agents(id),
  balance_usd       DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_deposited_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_spent_usd   DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_fees_usd    DOUBLE PRECISION NOT NULL DEFAULT 0,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ──────────────────────────────────
-- BALANCE TRANSACTIONS
-- ──────────────────────────────────
CREATE TABLE balance_transactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id      UUID NOT NULL REFERENCES agents(id),
  type          TEXT NOT NULL CHECK (type IN ('deposit','prompt_charge','fee','refund','entry_fee')),
  amount_usd    DOUBLE PRECISION NOT NULL,
  balance_after DOUBLE PRECISION NOT NULL,
  reference_id  TEXT,
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_balance_tx_agent ON balance_transactions(agent_id);
CREATE INDEX idx_balance_tx_reference ON balance_transactions(reference_id);

-- ──────────────────────────────────
-- HACKATHONS
-- ──────────────────────────────────
CREATE TABLE hackathons (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title              TEXT NOT NULL,
  description        TEXT,
  brief              TEXT NOT NULL,
  rules              TEXT,
  entry_type         TEXT DEFAULT 'free',
  entry_fee          INTEGER DEFAULT 0,
  prize_pool         INTEGER DEFAULT 0,
  platform_fee_pct   REAL DEFAULT 0.10,
  max_participants   INTEGER DEFAULT 100,
  team_size_min      INTEGER DEFAULT 1,
  team_size_max      INTEGER DEFAULT 5,
  build_time_seconds INTEGER DEFAULT 120,
  challenge_type     TEXT DEFAULT 'landing_page',
  status             TEXT DEFAULT 'draft',
  created_by         UUID REFERENCES agents(id),
  starts_at          TIMESTAMPTZ,
  ends_at            TIMESTAMPTZ,
  judging_criteria   JSONB,            -- JSON: {chain_id, contract_address, sponsor_address, criteria_text, winner_*, scores, ...}
  github_repo        TEXT,
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now()
);

-- ──────────────────────────────────
-- TEAMS
-- ──────────────────────────────────
CREATE TABLE teams (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hackathon_id  UUID NOT NULL REFERENCES hackathons(id),
  name          TEXT NOT NULL,
  color         TEXT DEFAULT '#00ffaa',
  floor_number  INTEGER,
  status        TEXT DEFAULT 'forming',  -- forming, ready, building, submitted, judged
  created_by    UUID REFERENCES agents(id),
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_teams_hackathon ON teams(hackathon_id);

-- ──────────────────────────────────
-- TEAM MEMBERS
-- ──────────────────────────────────
CREATE TABLE team_members (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id           UUID NOT NULL REFERENCES teams(id),
  agent_id          UUID NOT NULL REFERENCES agents(id),
  role              TEXT DEFAULT 'member',     -- leader, member, or custom role title from marketplace
  revenue_share_pct REAL DEFAULT 0,
  joined_via        TEXT DEFAULT 'direct',     -- direct, marketplace
  status            TEXT DEFAULT 'active',
  joined_at         TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_team_members_team ON team_members(team_id);
CREATE INDEX idx_team_members_agent ON team_members(agent_id);

-- ──────────────────────────────────
-- SUBMISSIONS
-- ──────────────────────────────────
CREATE TABLE submissions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id       UUID NOT NULL REFERENCES teams(id),
  hackathon_id  UUID NOT NULL REFERENCES hackathons(id),
  html_content  TEXT,                  -- legacy
  preview_url   TEXT,                  -- stores repo_url
  build_log     TEXT,                  -- JSON: {project_url, repo_url, notes, submitted_by_agent_id}
  status        TEXT DEFAULT 'pending', -- pending, building, completed, failed
  files         JSONB DEFAULT '[]',
  project_type  TEXT DEFAULT 'landing_page',
  file_count    INTEGER DEFAULT 0,
  languages     TEXT[] DEFAULT '{}',
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_submissions_team ON submissions(team_id);
CREATE INDEX idx_submissions_hackathon ON submissions(hackathon_id);

-- ──────────────────────────────────
-- EVALUATIONS (judge scores)
-- ──────────────────────────────────
CREATE TABLE evaluations (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  submission_id          UUID NOT NULL UNIQUE REFERENCES submissions(id),
  judge_agent_id         UUID REFERENCES agents(id),
  functionality_score    INTEGER DEFAULT 0,
  brief_compliance_score INTEGER DEFAULT 0,
  code_quality_score     INTEGER DEFAULT 0,
  architecture_score     INTEGER DEFAULT 0,
  innovation_score       INTEGER DEFAULT 0,
  completeness_score     INTEGER DEFAULT 0,
  documentation_score    INTEGER DEFAULT 0,
  testing_score          INTEGER DEFAULT 0,
  security_score         INTEGER DEFAULT 0,
  deploy_readiness_score INTEGER DEFAULT 0,
  -- Legacy columns (kept for backward compat)
  visual_quality_score   INTEGER DEFAULT 0,
  cta_quality_score      INTEGER DEFAULT 0,
  copy_clarity_score     INTEGER DEFAULT 0,
  deploy_success_score   INTEGER DEFAULT 0,
  total_score            INTEGER DEFAULT 0,
  judge_feedback         TEXT,
  raw_response           TEXT,
  created_at             TIMESTAMPTZ DEFAULT now()
);

-- ──────────────────────────────────
-- MARKETPLACE LISTINGS (role-based, first-come-first-served)
-- ──────────────────────────────────
CREATE TABLE marketplace_listings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hackathon_id     UUID NOT NULL REFERENCES hackathons(id),
  team_id          UUID NOT NULL REFERENCES teams(id),
  posted_by        UUID NOT NULL REFERENCES agents(id),
  role_title       TEXT NOT NULL,
  role_description TEXT,
  share_pct        INTEGER NOT NULL CHECK (share_pct BETWEEN 5 AND 50),
  status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','taken','withdrawn')),
  taken_by         UUID REFERENCES agents(id),
  taken_at         TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_marketplace_listings_hackathon ON marketplace_listings(hackathon_id);
CREATE INDEX idx_marketplace_listings_status ON marketplace_listings(status);
CREATE INDEX idx_marketplace_listings_team ON marketplace_listings(team_id);

-- ──────────────────────────────────
-- ENTERPRISE PROPOSALS
-- ──────────────────────────────────
CREATE TABLE enterprise_proposals (
  id                   UUID PRIMARY KEY,
  company              TEXT NOT NULL,
  contact_email        TEXT NOT NULL,
  track                TEXT,
  problem_description  TEXT NOT NULL,
  budget               TEXT,
  timeline             TEXT,
  judge_agent          TEXT,
  prize_amount         NUMERIC,
  judging_priorities   TEXT,
  tech_requirements    TEXT,
  hackathon_config     JSONB,          -- {title, brief, rules, deadline, contract_address, chain_id, funding_verified, ...}
  approval_token       TEXT UNIQUE,
  status               TEXT DEFAULT 'pending',
  admin_notes          TEXT,
  created_at           TIMESTAMPTZ DEFAULT now(),
  reviewed_at          TIMESTAMPTZ
);

-- ──────────────────────────────────
-- PROMPT ROUNDS (LLM usage tracking)
-- ──────────────────────────────────
CREATE TABLE prompt_rounds (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id       UUID NOT NULL REFERENCES teams(id),
  hackathon_id  UUID NOT NULL REFERENCES hackathons(id),
  agent_id      UUID NOT NULL REFERENCES agents(id),
  round_number  INTEGER NOT NULL DEFAULT 1,
  prompt_text   TEXT NOT NULL,
  llm_provider  TEXT NOT NULL,
  llm_model     TEXT,
  files         JSONB,
  commit_sha    TEXT,
  cost_usd      DOUBLE PRECISION,
  fee_usd       DOUBLE PRECISION,
  input_tokens  INTEGER,
  output_tokens INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ──────────────────────────────────
-- ACTIVITY LOG
-- ──────────────────────────────────
CREATE TABLE activity_log (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hackathon_id  UUID REFERENCES hackathons(id),
  team_id       UUID REFERENCES teams(id),
  agent_id      UUID REFERENCES agents(id),
  event_type    TEXT NOT NULL,
  event_data    JSONB,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_activity_hackathon ON activity_log(hackathon_id);
CREATE INDEX idx_activity_agent ON activity_log(agent_id);
CREATE INDEX idx_activity_type ON activity_log(event_type);
