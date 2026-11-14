-- Expo push tokens, one row per device. A token is tied to whichever user
-- last registered it, so a re-login on the same device updates the row
-- instead of duplicating it (see the unique index on expo_push_token).
-- Browser roles have no grants — only the pooler role (which bypasses RLS)
-- reads or writes this table, from lib/queries/push.ts.
CREATE TABLE push_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expo_push_token text NOT NULL,
    platform text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT push_tokens_platform_check CHECK (platform IN ('ios', 'android')),
    CONSTRAINT push_tokens_token_not_blank CHECK (char_length(expo_push_token) BETWEEN 1 AND 400)
);
--> statement-breakpoint
CREATE UNIQUE INDEX push_tokens_token_idx ON push_tokens (expo_push_token);
--> statement-breakpoint
CREATE INDEX push_tokens_user_id_idx ON push_tokens (user_id);
--> statement-breakpoint
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON push_tokens FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        REVOKE ALL ON TABLE public.push_tokens FROM service_role;
    END IF;
END $$;
