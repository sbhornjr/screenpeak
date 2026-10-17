-- Phone Steam OpenID intents. One row per issued state. The HMAC signature
-- stays in the token the phone holds; this table only records the jti so the
-- callback can spend it once. Browser roles have no grants. The pooler role
-- bypasses RLS.
CREATE TABLE steam_link_intents (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL,
    consumed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT steam_link_intents_expires_after_create CHECK (expires_at > created_at)
);
--> statement-breakpoint
CREATE INDEX steam_link_intents_user_id_idx ON steam_link_intents (user_id);
--> statement-breakpoint
ALTER TABLE steam_link_intents ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON steam_link_intents FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        REVOKE ALL ON TABLE public.steam_link_intents FROM service_role;
    END IF;
END $$;
