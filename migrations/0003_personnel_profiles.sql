PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS personnel_profiles (
  account_id INTEGER PRIMARY KEY REFERENCES personnel_accounts(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  age INTEGER,
  contact TEXT NOT NULL DEFAULT '',
  rank TEXT NOT NULL DEFAULT '',
  unit TEXT NOT NULL DEFAULT '',
  mos TEXT NOT NULL DEFAULT '',
  service_status TEXT NOT NULL DEFAULT '',
  service_note TEXT NOT NULL DEFAULT '',
  updated_by INTEGER REFERENCES personnel_accounts(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (age IS NULL OR age BETWEEN 16 AND 100)
);

CREATE INDEX IF NOT EXISTS idx_personnel_profiles_full_name ON personnel_profiles(full_name);
