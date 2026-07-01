CREATE TABLE analytics_events (
  id TEXT PRIMARY KEY NOT NULL,
  clerk_user_id TEXT,
  event TEXT NOT NULL,
  props TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE INDEX idx_analytics_events_user_created ON analytics_events (clerk_user_id, created_at);
--> statement-breakpoint
CREATE INDEX idx_analytics_events_event_created ON analytics_events (event, created_at);
