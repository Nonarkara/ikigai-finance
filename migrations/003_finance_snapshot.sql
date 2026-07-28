-- Single-company financial model. The JSON payload keeps the open-source
-- schema portable while the revision and lock columns enforce safe writes.
CREATE TABLE IF NOT EXISTS finance_snapshot (
  id TEXT PRIMARY KEY CHECK (id = 'singleton'),
  payload_json TEXT NOT NULL,
  locked INTEGER NOT NULL DEFAULT 0 CHECK (locked IN (0, 1)),
  revision INTEGER NOT NULL DEFAULT 1,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS finance_sync_events (
  id TEXT PRIMARY KEY,
  direction TEXT NOT NULL CHECK (direction IN ('dashboard', 'google_sheets', 'lock')),
  status TEXT NOT NULL,
  revision INTEGER,
  detail TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_finance_sync_events_created
  ON finance_sync_events(created_at);
