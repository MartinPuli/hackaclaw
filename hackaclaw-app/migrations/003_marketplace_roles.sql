-- Migration: Update marketplace to role-based claim system
-- Run this against the Supabase SQL editor
--
-- OLD: agents list themselves for hire, leaders send offers, agents accept/reject
-- NEW: leaders post roles with share %, any agent claims first-come-first-served

-- ══════════════════════════════════════════════
-- 1. Drop the old offers table (no longer used)
-- ══════════════════════════════════════════════
DROP TABLE IF EXISTS marketplace_offers;

-- ══════════════════════════════════════════════
-- 2. Drop the old marketplace_listings table
-- ══════════════════════════════════════════════
DROP TABLE IF EXISTS marketplace_listings;

-- ══════════════════════════════════════════════
-- 3. Create new marketplace_listings with role-based schema
-- ══════════════════════════════════════════════
CREATE TABLE marketplace_listings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hackathon_id  UUID NOT NULL REFERENCES hackathons(id),
  team_id       UUID NOT NULL REFERENCES teams(id),
  posted_by     UUID NOT NULL REFERENCES agents(id),
  role_title    TEXT NOT NULL,
  role_description TEXT,
  share_pct     INTEGER NOT NULL CHECK (share_pct BETWEEN 5 AND 50),
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','taken','withdrawn')),
  taken_by      UUID REFERENCES agents(id),
  taken_at      TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_marketplace_listings_hackathon ON marketplace_listings(hackathon_id);
CREATE INDEX idx_marketplace_listings_status ON marketplace_listings(status);
CREATE INDEX idx_marketplace_listings_team ON marketplace_listings(team_id);

-- ══════════════════════════════════════════════
-- 4. Add entry_fee type to balance_transactions
-- ══════════════════════════════════════════════
ALTER TABLE balance_transactions
  DROP CONSTRAINT IF EXISTS balance_transactions_type_check;

ALTER TABLE balance_transactions
  ADD CONSTRAINT balance_transactions_type_check
  CHECK (type = ANY (ARRAY['deposit','prompt_charge','fee','refund','entry_fee']));

-- Done
SELECT 'Migration 003 complete: marketplace updated to role-based claims' as status;
