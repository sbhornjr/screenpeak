-- Server-only coordination shared by every process using an IGDB client ID.
-- Reservation spacing 650ms + dispatch window <=350ms guarantees >=300ms
-- between actual dispatches, even when DB round-trip times differ.
CREATE SCHEMA igdb_private;
REVOKE ALL ON SCHEMA igdb_private FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
CREATE TABLE igdb_private.request_budgets (
    credential_key text PRIMARY KEY CHECK (credential_key ~ '^[0-9a-f]{64}$'),
    next_start_at timestamptz NOT NULL DEFAULT '-infinity'
);
CREATE TABLE igdb_private.request_leases (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    credential_key text NOT NULL REFERENCES igdb_private.request_budgets(credential_key) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL
);
CREATE INDEX request_leases_scope_expiry_idx ON igdb_private.request_leases(credential_key, expires_at);
ALTER TABLE igdb_private.request_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE igdb_private.request_leases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA igdb_private FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
CREATE FUNCTION igdb_private.acquire_request_lease(p_key text)
RETURNS TABLE(lease_id uuid, wait_ms integer)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, igdb_private AS $$
DECLARE
    v_next timestamptz;
    v_now timestamptz;
    v_count integer;
    v_expiry timestamptz;
    v_id uuid;
BEGIN
    -- One short transaction serializes each credential scope. Never hold it over HTTP.
    INSERT INTO igdb_private.request_budgets(credential_key) VALUES(p_key) ON CONFLICT DO NOTHING;
    SELECT next_start_at INTO v_next FROM igdb_private.request_budgets WHERE credential_key=p_key FOR UPDATE;
    v_now := clock_timestamp();
    DELETE FROM igdb_private.request_leases WHERE credential_key=p_key AND expires_at<=v_now;
    SELECT count(*),min(expires_at) INTO v_count,v_expiry FROM igdb_private.request_leases WHERE credential_key=p_key;
    IF v_count>=4 THEN
        RETURN QUERY SELECT NULL::uuid, greatest(1,ceil(extract(epoch FROM (v_expiry-v_now))*1000)::integer);
    ELSIF v_next>v_now THEN
        RETURN QUERY SELECT NULL::uuid, greatest(1,ceil(extract(epoch FROM (v_next-v_now))*1000)::integer);
    ELSE
        INSERT INTO igdb_private.request_leases(credential_key,expires_at) VALUES(p_key,v_now+interval '15 seconds') RETURNING id INTO v_id;
        UPDATE igdb_private.request_budgets SET next_start_at=v_now+interval '650 milliseconds' WHERE credential_key=p_key;
        RETURN QUERY SELECT v_id,0;
    END IF;
END;
$$;
CREATE FUNCTION igdb_private.release_request_lease(p_key text,p_id uuid)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = pg_catalog, igdb_private AS $$
    DELETE FROM igdb_private.request_leases WHERE credential_key=p_key AND id=p_id;
$$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA igdb_private FROM PUBLIC, anon, authenticated;
