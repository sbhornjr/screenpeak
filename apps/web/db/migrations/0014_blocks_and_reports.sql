-- No PostgREST path for either table — app code (Task 3/4) is the only
-- caller, same reasoning as push_tokens/steam_link_intents. target_id is
-- deliberately not a foreign key: it addresses a review, a list, or a user
-- depending on target_type.
CREATE TABLE blocks (
    blocker_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (blocker_id, blocked_id),
    CONSTRAINT blocks_check CHECK (blocker_id <> blocked_id)
);
--> statement-breakpoint
ALTER TABLE blocks ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON blocks FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        REVOKE ALL ON TABLE public.blocks FROM service_role;
    END IF;
END $$;
--> statement-breakpoint
CREATE TABLE reports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_type text NOT NULL,
    target_id uuid NOT NULL,
    reason text NOT NULL,
    details text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT reports_target_type_check CHECK (target_type IN ('review', 'list', 'profile')),
    CONSTRAINT reports_reason_length CHECK (char_length(reason) BETWEEN 1 AND 200),
    CONSTRAINT reports_details_length CHECK (char_length(COALESCE(details, '')) <= 2000)
);
--> statement-breakpoint
CREATE INDEX reports_reporter_id_idx ON reports (reporter_id);
--> statement-breakpoint
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON reports FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        REVOKE ALL ON TABLE public.reports FROM service_role;
    END IF;
END $$;
