CREATE TABLE IF NOT EXISTS cabinet_registration_requests (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 service_number TEXT NOT NULL UNIQUE,
 personnel_id TEXT NOT NULL UNIQUE,
 full_name TEXT NOT NULL,
 password_hash TEXT NOT NULL,
 password_salt TEXT NOT NULL,
 password_iterations INTEGER NOT NULL DEFAULT 100000,
 status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 reviewed_by INTEGER REFERENCES personnel_accounts(id) ON DELETE SET NULL,
 reviewed_at TEXT,
 review_note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_registration_requests_status_created
 ON cabinet_registration_requests(status, created_at);
CREATE TABLE IF NOT EXISTS faction_lookup_invites (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 faction_name TEXT NOT NULL,
 contact_name TEXT NOT NULL DEFAULT '',
 invite_token_hash TEXT NOT NULL UNIQUE,
 expires_at TEXT NOT NULL,
 used_at TEXT,
 created_by INTEGER REFERENCES personnel_accounts(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS faction_lookup_log (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 actor_account_id INTEGER REFERENCES personnel_accounts(id) ON DELETE SET NULL,
 query_name TEXT NOT NULL,
 result_count INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_faction_lookup_log_actor_created
 ON faction_lookup_log(actor_account_id, created_at);
