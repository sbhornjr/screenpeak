-- One Steam import per user. The holder refreshes heartbeat_at while it runs.
-- A dead request stops refreshing, and the next attempt takes the row after
-- the TTL. This replaces the session advisory lock (classid 1936745323), which
-- stayed granted on an idle pool connection after the request died.
CREATE TABLE igdb_private.steam_import_runs (
    user_id uuid PRIMARY KEY,
    owner_token uuid NOT NULL,
    heartbeat_at timestamptz NOT NULL,
    started_at timestamptz NOT NULL
);
--> statement-breakpoint
ALTER TABLE igdb_private.steam_import_runs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON igdb_private.steam_import_runs FROM PUBLIC, anon, authenticated;
