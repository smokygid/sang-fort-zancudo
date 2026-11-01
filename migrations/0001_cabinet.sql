PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS personnel_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service_number TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_iterations INTEGER NOT NULL DEFAULT 310000,
  personnel_id TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'soldier',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cabinet_sessions (
  id TEXT PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES personnel_accounts(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cabinet_sessions_expiry ON cabinet_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_personnel_accounts_service_number ON personnel_accounts(service_number);