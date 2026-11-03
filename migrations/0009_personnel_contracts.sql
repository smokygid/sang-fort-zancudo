PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS personnel_contracts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES personnel_accounts(id) ON DELETE CASCADE,
  start_date TEXT NOT NULL,
  duration_days INTEGER NOT NULL CHECK (duration_days IN (14, 30)),
  end_date TEXT NOT NULL,
  created_by INTEGER REFERENCES personnel_accounts(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_personnel_contracts_account_date
  ON personnel_contracts(account_id, start_date DESC, id DESC);
