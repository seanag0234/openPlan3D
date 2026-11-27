-- The online plan library. Safe to run again: it never drops or changes stored plans.
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revision INTEGER NOT NULL,
  body TEXT NOT NULL,
  thumbnail TEXT
);

-- Every save and delete, appended and never changed or removed. body is the plan with each large
-- data URL swapped for a blobs.hash reference (_history.ts); NULL marks a delete.
CREATE TABLE IF NOT EXISTS versions (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  saved_at TEXT NOT NULL,
  name TEXT NOT NULL,
  body TEXT
);
CREATE INDEX IF NOT EXISTS versions_by_project ON versions (project_id, seq);

-- Each large data URL once, by its SHA-256, however many versions use it.
CREATE TABLE IF NOT EXISTS blobs (
  hash TEXT PRIMARY KEY,
  data TEXT NOT NULL
);

-- Who may use each plan: its owner, and an editor row per person it is shared with (_people.ts).
-- A plan with no rows is everyone's. Rows outlive a delete, so only the owner can bring a plan back.
CREATE TABLE IF NOT EXISTS access (
  project_id TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor')),
  PRIMARY KEY (project_id, email)
);
CREATE INDEX IF NOT EXISTS access_by_email ON access (email);

-- A plan saved before the log existed starts its log with the copy it has now.
INSERT INTO versions (project_id, revision, saved_at, name, body)
  SELECT id, revision, updated_at, name, body FROM projects p
  WHERE NOT EXISTS (SELECT 1 FROM versions v WHERE v.project_id = p.id);

