PRAGMA foreign_keys = ON;

ALTER TABLE sang_orders
ADD COLUMN audience_type TEXT NOT NULL DEFAULT 'all'
CHECK (audience_type IN ('all','person','group'));

CREATE TABLE IF NOT EXISTS sang_order_recipients (
  order_id INTEGER NOT NULL REFERENCES sang_orders(id) ON DELETE CASCADE,
  account_id INTEGER NOT NULL REFERENCES personnel_accounts(id) ON DELETE CASCADE,
  PRIMARY KEY (order_id, account_id)
);

CREATE INDEX IF NOT EXISTS idx_sang_order_recipients_account
ON sang_order_recipients(account_id, order_id);
