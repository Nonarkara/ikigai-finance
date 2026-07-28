CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  type TEXT NOT NULL,
  telegram_file_id TEXT,
  file_key TEXT,
  mime_type TEXT,
  file_size INTEGER,
  sha256 TEXT,
  vendor TEXT,
  amount REAL,
  currency TEXT,
  receipt_date TEXT,
  category TEXT,
  confidence REAL,
  booking_reference TEXT,
  raw_text TEXT,
  claim_json TEXT,
  error TEXT,
  reviewed_at TEXT,
  reviewed_by TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_documents_status_created ON documents(status, created_at);
