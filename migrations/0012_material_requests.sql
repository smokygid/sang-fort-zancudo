PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS material_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_number TEXT NOT NULL UNIQUE,
  requester_account_id INTEGER NOT NULL REFERENCES personnel_accounts(id),
  requester_faction TEXT NOT NULL,
  items_json TEXT NOT NULL,
  comment TEXT NOT NULL DEFAULT '',
  requested_date TEXT NOT NULL,
  requested_time TEXT NOT NULL,
  sang_status TEXT NOT NULL DEFAULT 'pending' CHECK (sang_status IN ('pending','approved','proposed','rejected')),
  sang_date TEXT,
  sang_time TEXT,
  sang_comment TEXT NOT NULL DEFAULT '',
  sang_reviewer_id INTEGER REFERENCES personnel_accounts(id),
  sang_reviewed_at TEXT,
  city_status TEXT NOT NULL DEFAULT 'pending' CHECK (city_status IN ('pending','approved','proposed','rejected')),
  city_date TEXT,
  city_time TEXT,
  city_comment TEXT NOT NULL DEFAULT '',
  city_reviewer_id INTEGER REFERENCES personnel_accounts(id),
  city_reviewed_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','coordination','approved','rejected','completed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_material_requests_status
  ON material_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_material_requests_requester
  ON material_requests(requester_account_id, created_at DESC);
