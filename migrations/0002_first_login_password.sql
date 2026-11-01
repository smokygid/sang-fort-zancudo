ALTER TABLE personnel_accounts
ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 1 CHECK (must_change_password IN (0,1));

CREATE TABLE IF NOT EXISTS cabinet_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_account_id INTEGER REFERENCES personnel_accounts(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_account_id INTEGER REFERENCES personnel_accounts(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
