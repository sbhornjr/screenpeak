-- Fixed-window counters for /api/v1 writes and search. One row per bucket,
-- updated in a single statement so a transaction-pooler connection (Vercel)
-- can run it. No session lock, no Redis. The app role bypasses RLS.
-- Browser roles have no grants.
CREATE TABLE api_rate_limits (
    bucket text PRIMARY KEY,
    window_start timestamptz NOT NULL,
    hits integer NOT NULL,
    CONSTRAINT api_rate_limits_bucket_length CHECK (char_length(bucket) BETWEEN 1 AND 200),
    CONSTRAINT api_rate_limits_hits_nonnegative CHECK (hits >= 0)
);
--> statement-breakpoint
ALTER TABLE api_rate_limits ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON api_rate_limits FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
-- service_role is the Supabase secret-key role. Drizzle uses the pooler role,
-- which bypasses RLS, so this table does not need a service_role grant.
-- The role is absent on local Postgres; skip the revoke there.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        REVOKE ALL ON TABLE public.api_rate_limits FROM service_role;
    END IF;
END $$;
