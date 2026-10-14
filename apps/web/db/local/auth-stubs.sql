-- Local Postgres only. Run this once on an empty local database, before
-- migrate:journal. Supabase already has these roles, the auth schema, and
-- auth.uid(). This file refuses a Supabase database because it would replace
-- auth.uid().
--
-- From the repo root:
--   psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 -f apps/web/db/local/auth-stubs.sql

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('supabase_admin', 'supabase_auth_admin', 'authenticator'))
       OR EXISTS (SELECT 1 FROM pg_namespace WHERE nspname IN ('supabase_migrations', 'storage', 'vault', '_realtime'))
    THEN
        RAISE EXCEPTION 'Refusing local auth stubs on a Supabase database. This file is only for empty local Postgres.';
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
    id uuid PRIMARY KEY,
    email text,
    raw_user_meta_data jsonb
);

ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS raw_user_meta_data jsonb;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql
AS $$ SELECT NULL::uuid $$;
