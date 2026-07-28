-- Workspace: the owner's own company. Single-row config, keyed 'singleton'.
-- This is a deliberate product decision: one operator, one workspace, no
-- multi-tenant create-company flow. The workspace is filled in once and edited
-- thereafter; it is not a separate "tenant" that owns its own data.
CREATE TABLE IF NOT EXISTS workspace (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  descriptor TEXT,
  sector TEXT,
  city TEXT,
  headcount_band TEXT,
  revenue_band TEXT,
  stage TEXT,
  why_we_track TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Reference profiles: competitors, clients, partners, prospects. Read-only
-- context data. They do not own their own data, OAuth credentials, or finance
-- ledger. The operator adds them by hand; nothing connects to them automatically.
CREATE TABLE IF NOT EXISTS reference_profiles (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('competitor', 'client', 'partner', 'prospect')),
  name TEXT NOT NULL,
  descriptor TEXT,
  sector TEXT,
  city TEXT,
  headcount_band TEXT,
  revenue_band TEXT,
  stage TEXT,
  why_we_track TEXT,
  tags TEXT,
  moves TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_role TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reference_profiles_type ON reference_profiles(type);
CREATE INDEX IF NOT EXISTS idx_reference_profiles_updated_at ON reference_profiles(updated_at);
