CREATE TABLE change_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clerk_user_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  parent_id TEXT,
  action TEXT NOT NULL,
  data TEXT,
  source_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_change_log_user_id ON change_log (clerk_user_id, id);
