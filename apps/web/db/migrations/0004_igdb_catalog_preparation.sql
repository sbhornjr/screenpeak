-- Preparation only: no catalogue reset and no legacy ID reinterpretation.
ALTER TABLE public.games ADD COLUMN igdb_id integer,
    ADD CONSTRAINT games_igdb_id_key UNIQUE (igdb_id),
    ADD CONSTRAINT games_igdb_id_positive CHECK (igdb_id > 0),
    ALTER COLUMN rawg_id DROP NOT NULL,
    ADD COLUMN game_type integer,
    ADD COLUMN artwork_image_url text,
    ADD COLUMN provider_slug text,
    ADD COLUMN provider_updated_at timestamptz,
    ADD COLUMN metadata_synced_at timestamptz,
    ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
-- Existing duplicate slugs must be reconciled explicitly, never silently renamed.
ALTER TABLE public.games ADD CONSTRAINT games_slug_key UNIQUE (slug);
--> statement-breakpoint
ALTER TABLE public.genres ADD COLUMN igdb_id integer,
    ADD COLUMN provider_updated_at timestamptz,
    ADD CONSTRAINT genres_igdb_id_key UNIQUE (igdb_id),
    ADD CONSTRAINT genres_igdb_id_positive CHECK (igdb_id > 0),
    ALTER COLUMN rawg_id DROP NOT NULL;
ALTER TABLE public.platforms ADD COLUMN igdb_id integer,
    ADD COLUMN provider_updated_at timestamptz,
    ADD CONSTRAINT platforms_igdb_id_key UNIQUE (igdb_id),
    ADD CONSTRAINT platforms_igdb_id_positive CHECK (igdb_id > 0),
    ALTER COLUMN rawg_id DROP NOT NULL;
ALTER TABLE public.developers ADD COLUMN igdb_id integer,
    ADD COLUMN provider_updated_at timestamptz,
    ADD CONSTRAINT developers_igdb_id_key UNIQUE (igdb_id),
    ADD CONSTRAINT developers_igdb_id_positive CHECK (igdb_id > 0),
    ALTER COLUMN rawg_id DROP NOT NULL;
ALTER TABLE public.publishers ADD COLUMN igdb_id integer,
    ADD COLUMN provider_updated_at timestamptz,
    ADD CONSTRAINT publishers_igdb_id_key UNIQUE (igdb_id),
    ADD CONSTRAINT publishers_igdb_id_positive CHECK (igdb_id > 0),
    ALTER COLUMN rawg_id DROP NOT NULL;
--> statement-breakpoint
CREATE TABLE public.game_external_ids (
    provider text NOT NULL CHECK (provider <> ''),
    external_id text NOT NULL CHECK (external_id <> ''),
    game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
    match_method text NOT NULL CHECK (match_method = 'igdb_external_id'),
    verified_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT game_external_ids_provider_external_id_key UNIQUE (provider, external_id)
);
CREATE INDEX game_external_ids_game_id_idx ON public.game_external_ids(game_id);
ALTER TABLE public.game_external_ids ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.game_external_ids FROM PUBLIC, anon, authenticated;
-- Catalogue mutations are operational only, even on projects with default grants.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON
    public.games, public.genres, public.platforms, public.developers, public.publishers,
    public.game_genres, public.game_platforms, public.game_developers, public.game_publishers
    FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
CREATE TABLE igdb_private.steam_match_cache (
    steam_app_id integer NOT NULL CHECK (steam_app_id > 0),
    matcher_version text NOT NULL CHECK (matcher_version <> ''),
    status text NOT NULL CHECK (status IN ('unmatched', 'ambiguous')),
    checked_at timestamptz NOT NULL DEFAULT now(),
    retry_after timestamptz NOT NULL,
    PRIMARY KEY (steam_app_id, matcher_version),
    CHECK (retry_after >= checked_at)
);
CREATE TABLE igdb_private.catalog_reset_runs (
    run_id uuid PRIMARY KEY,
    manifest_checksum text NOT NULL CHECK (manifest_checksum ~ '^[0-9a-f]{64}$'),
    committed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE igdb_private.steam_match_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE igdb_private.catalog_reset_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON igdb_private.steam_match_cache, igdb_private.catalog_reset_runs FROM PUBLIC, anon, authenticated;
