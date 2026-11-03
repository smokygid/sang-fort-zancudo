PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS personnel_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES personnel_accounts(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL CHECK (notification_type IN ('contract','award','reprimand','history','system')),
  title TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  link TEXT NOT NULL DEFAULT '#profile-section',
  source_key TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at TEXT,
  UNIQUE(account_id, source_key)
);

CREATE INDEX IF NOT EXISTS idx_personnel_notifications_account
  ON personnel_notifications(account_id, is_read, created_at DESC);
