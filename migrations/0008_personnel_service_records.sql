PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS personnel_service_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES personnel_accounts(id) ON DELETE CASCADE,
  record_type TEXT NOT NULL CHECK (record_type IN ('award','reprimand','history')),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  document_number TEXT NOT NULL DEFAULT '',
  record_date TEXT NOT NULL,
  created_by INTEGER REFERENCES personnel_accounts(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_service_records_account_date
  ON personnel_service_records(account_id, record_date DESC, id DESC);
