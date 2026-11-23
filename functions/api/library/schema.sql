-- The online plan library. Safe to run again: it never drops or changes stored plans.
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revision INTEGER NOT NULL,
  body TEXT NOT NULL,
  thumbnail TEXT
);
