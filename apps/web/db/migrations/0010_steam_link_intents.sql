-- Phone Steam OpenID intents. One outstanding row per user. The HMAC
-- signature and the one-time completion code stay with the phone; this table
-- stores the jti, the PKCE challenge, and (after OpenID) the verified Steam
-- id plus a hash of the code. Browser roles have no grants. The pooler role
-- bypasses RLS.
CREATE TABLE steam_link_intents (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_challenge text NOT NULL,
    expires_at timestamptz NOT NULL,
    consumed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    steam_id text,
    completion_code_hash text,
    CONSTRAINT steam_link_intents_expires_after_create CHECK (expires_at > created_at),
    CONSTRAINT steam_link_intents_challenge_shape CHECK (code_challenge ~ '^[A-Za-z0-9_-]{43,128}$'),
    CONSTRAINT steam_link_intents_steam_id_shape CHECK (steam_id IS NULL OR steam_id ~ '^[0-9]{17}$'),
    CONSTRAINT steam_link_intents_code_hash_shape CHECK (completion_code_hash IS NULL OR completion_code_hash ~ '^[A-Za-z0-9_-]{43}$')
);
--> statement-breakpoint
CREATE INDEX steam_link_intents_user_id_idx ON steam_link_intents (user_id);
--> statement-breakpoint
CREATE UNIQUE INDEX steam_link_intents_one_live_idx ON steam_link_intents (user_id) WHERE consumed_at IS NULL;
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
