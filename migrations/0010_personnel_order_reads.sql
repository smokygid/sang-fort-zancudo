PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS personnel_order_reads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES personnel_accounts(id) ON DELETE CASCADE,
  order_key TEXT NOT NULL,
  read_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(account_id, order_key)
);

CREATE INDEX IF NOT EXISTS idx_order_reads_account
  ON personnel_order_reads(account_id, read_at DESC);
