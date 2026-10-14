# IGDB catalogue

IGDB is the game catalogue. Twitch client credentials (`TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`) authorize both the bulk seed and Steam-app matching at import time. There is no RAWG client. A game page shows You and Community, both out of 10.

`igdb_id` is required on games, genres, platforms, developers, and publishers. Applied migration `0007_igdb_catalog_cleanup.sql` dropped `rawg_id`, `metacritic_score`, and `games.steam_appid`. Do not edit applied SQL files `0000`–`0008` or `db/migrations/meta/_journal.json`.

## What the seed writes

`seed:igdb` stores main games only (`game_type = 0`). `--top` takes the top 2000 by `rating_count`, then rating, then id, and will not exceed 5000. Writes are upserts in batches of 50. `--resume` skips IGDB ids already stored and still starts from the full ranked list. The command does not clear library entries, reviews, lists, or accounts. A Steam app id shared by two games in the same batch is dropped. Steam import is separate: it keeps editions and expansions, and its only mutex is `igdb_private.steam_import_runs`.

`--clear-budget` clears this database user's own stale IGDB rate-limit sessions. Run it only while no other seed is running.

## Writing a migration

Add the next SQL file and a journal entry. Do not edit `0000`–`0008` or rewrite an applied hash.

1. Create `apps/web/db/migrations/0009_short_name.sql`. Put `--> statement-breakpoint` between statements, as `0003` and `0008` do. `migrate:journal` splits the file on that marker.
2. Append an entry to `apps/web/db/migrations/meta/_journal.json`. Use the next `idx`, a `when` greater than the previous entry, `tag` equal to the filename without `.sql`, `version` `"7"`, and `"breakpoints": true`.
3. Update `apps/web/db/schema.ts` when the change is a table or column the app reads.

Do not apply schema changes with `drizzle-kit push`. `apps/web/drizzle.config.ts` still reads `DATABASE_URL` for drizzle-kit itself. The journal above is what gets applied.

## Applying a migration

Both commands read `apps/web/.env.local` without overriding variables already set. They never fall back to `DATABASE_POOL_URL`. A localhost URL can still be a tunnel: check the host before you point a command at it.

`seed:igdb` is local only. The host must be `127.0.0.1`, `localhost`, or `::1`, and the database name must end in `_test` or `_copy`.

`migrate:journal` uses that same local rule unless you pass `--target-hosted` with `--confirm-host` and `--confirm-database`. Those two values must be typed from the URL and must match its hostname and database name exactly. `--target-hosted` refuses a local host. Without `--apply-pending` the command prints a dry-run and writes nothing.

On an empty database, `--apply-pending` runs the whole journal in one transaction and records each file. A database that already has `public.games` but no recorded `0000`–`0002` hashes is refused. The command will not replay those files.

Empty local Postgres does not have the `anon` and `authenticated` roles or `auth.uid()`, and `0000` names them. Run the stub file once, from the repo root, before the first migrate. Do not run it on Supabase. Supabase already has those roles, and the file replaces `auth.uid()`.

```bash
psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 -f apps/web/db/local/auth-stubs.sql
npm run migrate:journal -w @screenpeak/web -- --database-env LOCAL_DATABASE_URL --apply-pending
```

`psql` reads the shell. `migrate:journal` also reads `apps/web/.env.local`, so `LOCAL_DATABASE_URL` can live there as well as in the shell.

Hosted apply, after a dry-run with the same flags:

```bash
npm run migrate:journal -w @screenpeak/web -- \
  --database-env HOSTED_DATABASE_URL \
  --target-hosted \
  --confirm-host HOST-FROM-THE-URL \
  --confirm-database DATABASE-NAME-FROM-THE-URL
npm run migrate:journal -w @screenpeak/web -- \
  --database-env HOSTED_DATABASE_URL \
  --apply-pending \
  --target-hosted \
  --confirm-host HOST-FROM-THE-URL \
  --confirm-database DATABASE-NAME-FROM-THE-URL
```

Seed a local copy after its journal is current:

```bash
npm run seed:igdb -w @screenpeak/web -- --database-env LOCAL_DATABASE_URL --top
npm run seed:igdb -w @screenpeak/web -- --database-env LOCAL_DATABASE_URL --ids 1,2,3
npm run seed:igdb -w @screenpeak/web -- --database-env LOCAL_DATABASE_URL --clear-budget
```

## Attribution

Cover art is served from `images.igdb.com`. The site footer credits IGDB ("Game data and images from IGDB"). A written commercial partnership is still required before public launch. It has to cover storage, caching, and attribution. The Twitch Developer Agreement's default 24-hour cache is not permission to ship. See `docs/backlog.md`.
