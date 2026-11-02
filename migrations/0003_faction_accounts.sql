ALTER TABLE personnel_accounts ADD COLUMN faction_name TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_personnel_accounts_role_faction
ON personnel_accounts(role, faction_name);
