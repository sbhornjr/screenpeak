# IGDB catalogue

IGDB is the game catalogue. Twitch client credentials (`TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`) authorize both the bulk seed and Steam-app matching at import time. There is no RAWG client. A game page shows You and Community, both out of 10.

`igdb_id` is required on games, genres, platforms, developers, and publishers. Applied migration `0007_igdb_catalog_cleanup.sql` dropped `rawg_id`, `metacritic_score`, and `games.steam_appid`. Do not edit applied SQL files `0000`–`0008` or `db/migrations/meta/_journal.json`.

## What the seed writes

`seed:igdb` stores main games only (`game_type = 0`). `--top` takes the top 2000 by `rating_count`, then rating, then id, and will not exceed 5000. Writes are upserts in batches of 50. `--resume` skips IGDB ids already stored and still starts from the full ranked list. The command does not clear library entries, reviews, lists, or accounts. A Steam app id shared by two games in the same batch is dropped. Steam import is separate: it keeps editions and expansions, and its only mutex is `igdb_private.steam_import_runs`.

`--clear-budget` clears this database user's own stale IGDB rate-limit sessions. Run it only while no other seed is running.

## Local commands

Both commands read `apps/web/.env.local` without overriding variables already set. They never fall back to `DATABASE_POOL_URL`. The host must be local (`127.0.0.1`, `localhost`, or `::1`) and the database name must end in `_test` or `_copy`. A non-local URL is refused before a connection is opened. A localhost URL can still be a tunnel: check the host before you point a command at it.

```bash
npm run migrate:journal -w @screenpeak/web -- --database-env NAME
npm run migrate:journal -w @screenpeak/web -- --database-env NAME --apply-pending
npm run seed:igdb -w @screenpeak/web -- --database-env NAME --top
npm run seed:igdb -w @screenpeak/web -- --database-env NAME --ids 1,2,3
npm run seed:igdb -w @screenpeak/web -- --database-env NAME --clear-budget
```

Without `--apply-pending`, `migrate:journal` prints a dry-run and writes nothing. On an empty database, `--apply-pending` runs the whole journal in one transaction and records each file. A database that already has `public.games` but no recorded `0000`–`0002` hashes is refused. The command will not replay those files.

`migrate:journal` does not create the `anon` and `authenticated` roles or `auth.uid()`. Empty local Postgres needs those before `0000`. Hosted schema changes are an owner SQL step. Do not point these commands at the hosted database.

## Attribution

Cover art is served from `images.igdb.com`. The site footer credits IGDB ("Game data and images from IGDB"). A written commercial partnership is still required before public launch. It has to cover storage, caching, and attribution. The Twitch Developer Agreement's default 24-hour cache is not permission to ship. See `docs/backlog.md`.
