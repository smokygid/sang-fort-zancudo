PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sang_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Наказ',
  order_date TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  created_by INTEGER REFERENCES personnel_accounts(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES personnel_accounts(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_sang_orders_status_date
ON sang_orders(status, order_date DESC, id DESC);
