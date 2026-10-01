-- New D1 database only. Existing KV data is copied only by the explicit migration endpoint.
CREATE TABLE IF NOT EXISTS app_state (
  id INTEGER PRIMARY KEY CHECK(id=1),
  json TEXT NOT NULL,
  revision INTEGER NOT NULL,
  last_op TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cleaner_accounts (
  cleaner_id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS cleaner_operations (
  operation_id TEXT PRIMARY KEY,
  cleaner_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  result TEXT NOT NULL,
  created_at TEXT NOT NULL
);
