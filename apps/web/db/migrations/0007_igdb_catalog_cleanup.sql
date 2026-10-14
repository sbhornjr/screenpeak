-- Journaled column cleanup. 0006 already recreated the score RPCs without
-- Metacritic outputs. This migration drops rawg_id, metacritic_score and
-- steam_appid, and sets igdb_id NOT NULL on the five catalogue tables.
-- It aborts when any catalogue row lacks a positive igdb_id, or when a
-- public function body still names a column this migration drops.
-- No DELETE, TRUNCATE, or CASCADE. On a database that still has legacy rows,
-- apply 0003–0006 first (--through 0006_two_score_rpcs), reset, then apply
-- this file. Including it in the same --apply-pending transaction rolls
-- 0003–0006 back when the check raises. See docs/igdb-cutover-checklist.md.
DO $$
DECLARE v_table text; v_invalid boolean;
BEGIN
    FOREACH v_table IN ARRAY ARRAY['games','genres','platforms','developers','publishers'] LOOP
        EXECUTE format('SELECT EXISTS (SELECT FROM public.%I WHERE igdb_id IS NULL OR igdb_id <= 0)', v_table) INTO v_invalid;
        IF v_invalid THEN
            RAISE EXCEPTION 'IGDB cleanup refused: % contains missing/invalid provider IDs', v_table;
        END IF;
    END LOOP;
    -- PL/pgSQL bodies do not register every column dependency. Check those too;
    -- DROP COLUMN's normal dependency check still protects views/SQL dependants.
    IF EXISTS (SELECT FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.prosrc ~ '\m(rawg_id|metacritic_score|steam_appid)\M') THEN
        RAISE EXCEPTION 'RPC cleanup required before dropping legacy catalogue columns';
    END IF;
END $$;
ALTER TABLE public.games ALTER COLUMN igdb_id SET NOT NULL, DROP COLUMN rawg_id,
    DROP COLUMN metacritic_score, DROP COLUMN steam_appid;
ALTER TABLE public.genres ALTER COLUMN igdb_id SET NOT NULL, DROP COLUMN rawg_id;
ALTER TABLE public.platforms ALTER COLUMN igdb_id SET NOT NULL, DROP COLUMN rawg_id;
ALTER TABLE public.developers ALTER COLUMN igdb_id SET NOT NULL, DROP COLUMN rawg_id;
ALTER TABLE public.publishers ALTER COLUMN igdb_id SET NOT NULL, DROP COLUMN rawg_id;
