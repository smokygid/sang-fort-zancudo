PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sang_news (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'ІНШЕ',
  news_date TEXT NOT NULL,
  excerpt TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  image_url TEXT NOT NULL DEFAULT '',
  is_featured INTEGER NOT NULL DEFAULT 0 CHECK (is_featured IN (0,1)),
  is_announcement INTEGER NOT NULL DEFAULT 0 CHECK (is_announcement IN (0,1)),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  created_by INTEGER REFERENCES personnel_accounts(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES personnel_accounts(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_sang_news_publication
ON sang_news(status, is_featured, news_date DESC, id DESC);
