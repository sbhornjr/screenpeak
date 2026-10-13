# IGDB hosted cutover checklist

Owner steps for the development database. Nothing in this file has been run against hosted Supabase.

Journal, reset, and seed refuse a non-local URL unless you pass `--target-hosted` and type that URL's host and database name with `--confirm-host` and `--confirm-database`. Those three flags are only for step 9, after the local rehearsal. Audit commands stay local-only. `--confirm-local-copy` is the local-copy flag: it allows a localhost URL that still has Supabase dump markers. It does not authorize a hosted host, and it must not be combined with `--target-hosted`. `--local-auth-stubs` refuses a Supabase auth schema and refuses `--target-hosted`.

Run every command from the repository root. Set the environment variable you pass to `--database-env`. The scripts do not read `DATABASE_POOL_URL`.

Keep the app and every other writer stopped from the backup until the verification queries pass and you start this revision. Stop any older build before step 7. That build's `getGameBySlug` selects `games.steam_appid` on every game page.

## 1. Backup

Record the git revision of the dump and the revision you will start afterward (the change that journals `0007_igdb_catalog_cleanup`).

```bash
pg_dump --format=custom --no-owner --file "$HOME/screenpeak-dev-YYYY-MM-DD.dump" "$HOSTED_DATABASE_URL"
shasum -a 256 "$HOME/screenpeak-dev-YYYY-MM-DD.dump"
```

Keep the dump outside git. The Task 1 inventory export is not this backup. The `reset_backup` schema created later is a rehearsal aid, not this backup.

## 2. Restore a local copy and rehearse

```bash
createdb screenpeak_copy
pg_restore --no-owner --dbname "postgresql://YOUR_USER@127.0.0.1:5432/screenpeak_copy" "$HOME/screenpeak-dev-YYYY-MM-DD.dump"
```

The database name must end in `_copy`. Rehearse steps 3–8 and the local rollback in step 10 on this restore before step 9. A restored Supabase dump has auth markers, so every journal, reset, and seed command on this copy needs `--confirm-local-copy` after you have checked the URL is that restore and not a tunnel to the hosted project. Do not pass `--target-hosted` or `--local-auth-stubs` on this dump.

A plain local Postgres, and a `pg_restore --no-owner` of a Supabase dump, does not have Supabase's `anon`, `authenticated`, and `service_role` roles. `0003` and later run `REVOKE ... FROM anon, authenticated` and fail with `role "anon" does not exist` until those roles exist. Create them on that local database before step 3. `service_role` is included so later grants match a Supabase dump; this rehearsal role does not need `BYPASSRLS`.

`pgcrypto` is created by `0000`. Supabase keeps it in the `extensions` schema, and a restored dump often does too. Local `search_path` does not include `extensions`, so an unqualified `digest()` fails. The reset fingerprint finds whichever schema holds the extension. You still need the extension itself. If `CREATE EXTENSION` says it already exists, leave it where it is.

```bash
psql "postgresql://YOUR_USER@127.0.0.1:5432/screenpeak_copy" <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END $$;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
SQL
```

Run that again on `empty_local_test` before the empty-database command in step 4. `--local-auth-stubs` creates `anon` and `authenticated` only, and only for that empty path. It does not create `service_role` or `pgcrypto`, and it refuses a restored Supabase dump.

If the first rehearsal fails, fix the cause and repeat the stamp, apply, reset, seed, and column drop on a second local restore. Do not continue to another database from a rehearsal you have not checked.

## 3. Journal dry-run

Writes nothing.

```bash
TEST_DATABASE_URL=postgresql://YOUR_USER@127.0.0.1:5432/screenpeak_copy \
  npm run migrate:journal -w @screenpeak/web -- \
  --database-env TEST_DATABASE_URL --confirm-local-copy
```

Expect `baseline` `ready`. With no journal, `pending` starts at `0000_illegal_kinsey_walden` and ends at `0007_igdb_catalog_cleanup`. `0003` through `0007` is the pending list only after step 4. If `baseline` is `reject`, stop. Do not stamp. Reasons such as a missing `games.rawg_id` or an existing `games.igdb_id` mean this is not an unjournaled 0000–0002 database.

Re-running this dry-run after step 7 reports `baseline` `recorded` and an empty `pending` list. The pre-stamp column check still names `rawg_id`, `metacritic_score`, and `steam_appid`, so its reasons are expected once those columns are gone. `stampBaseline` on a matching journal returns an empty `stamped` list and does not rewrite it.

## 4. Stamp 0000–0002

Records the three baseline hashes. Does not replay them.

```bash
TEST_DATABASE_URL=postgresql://YOUR_USER@127.0.0.1:5432/screenpeak_copy \
  npm run migrate:journal -w @screenpeak/web -- \
  --database-env TEST_DATABASE_URL --confirm-local-copy --stamp-baseline
```

Expect `stamped` to list `0000_illegal_kinsey_walden`, `0001_functions_and_triggers`, and `0002_fix_get_feed_library_privacy`. A second run stamps nothing.

An empty local database (no `public` tables) is a different path. It may apply the whole chain, including 0007, in one transaction. Use that only on empty local Postgres, never on this dump:

```bash
TEST_DATABASE_URL=postgresql://YOUR_USER@127.0.0.1:5432/empty_local_test \
  npm run migrate:journal -w @screenpeak/web -- \
  --database-env TEST_DATABASE_URL --apply-pending --local-auth-stubs
```

The database name must end in `_test`. This path is empty local Postgres only.

## 5. Apply 0003–0006 only

`--apply-pending` with no `--through` runs every pending file, including 0007, in one transaction. 0007 raises when any catalogue row has a null or non-positive `igdb_id`. Legacy rows still have null `igdb_id`, so that raise rolls 0003–0006 back with it. Stop after 0006.

```bash
TEST_DATABASE_URL=postgresql://YOUR_USER@127.0.0.1:5432/screenpeak_copy \
  npm run migrate:journal -w @screenpeak/web -- \
  --database-env TEST_DATABASE_URL --confirm-local-copy \
  --apply-pending --through 0006_two_score_rpcs
```

Expect `applied` to be `0003_igdb_request_budget`, `0004_igdb_catalog_preparation`, `0005_taxonomy_slug_unique`, `0006_two_score_rpcs`. Do not use `drizzle-kit migrate` before the stamp: an empty journal would replay `0000`.

This revision reads `igdb_id`, `game_external_ids`, and `igdb_private`. It does not select `rawg_id`, `metacritic_score`, or `games.steam_appid`, so it may run while those columns still exist. Keep every build stopped until you choose to serve traffic. The old-build cutoff is step 7, not step 8 or step 10: the previous revision's `getGameBySlug` selects `games.steam_appid` unconditionally, and every game page on that build errors once step 7 commits.

## 6. Reset, then seed

`reset:catalog --apply` deletes every game and taxonomy row, then inserts only the games in the manifest. `seed:igdb --top` writes games directly and does not build that manifest. A seed run before `--apply` is deleted by the reset. The order that leaves the top-N catalogue in place is reset, then seed.

`--confirm-before-task-6` is ignored. Do not pass it.

This reset is acceptable for this development database. It deletes game-linked rows. It does not preserve them.

`--apply` deletes:

- every `library_entries` row, including `hours_played` and `steam_playtime_minutes`
- every `ratings_reviews` row
- every `list_games` row (list membership)
- `users.favorite_game_ids` (the arrays are cleared; the user rows stay)
- generated `loadout_identity` and `loadout_identity_at`
- every game, genre, platform, developer, publisher, and taxonomy join
- every `game_external_ids` row
- every `igdb_private.steam_match_cache` row

What stays: user accounts and profile settings, list definitions, follows, list likes, and `steam_accounts`.

Steam users can re-import afterward. `steam_accounts` is still there. The seed writes Steam app ids only for the games it inserts, then drops an app id owned by two of those games. Owned apps outside that unique seeded set have no mapping. The next Steam import calls IGDB for those apps and can insert new library rows from Steam playtime. That import does not put back the deleted reviews, list memberships, favourites, hand-edited hours, or Loadout text, and it does not reattach them to the old game UUIDs.

Write an empty manifest. Dry-run without `--allow-empty` prints the counts and `blocked` naming `--allow-empty`. It does not ask for `--allow-small`. Read `library`, `reviews`, `memberships`, and `favourites` there. Then dry-run again with `--allow-empty`. That second dry-run is the block the apply will use. Expect `blocked` `null`, including when `games` is 25 or more. If it names `--allow-small`, stop. Do not pass `--allow-small` for this empty reset. `--allow-small` is only for a non-empty manifest under the floor (fewer than 25 games and fewer than 10% of the current count).

```bash
printf '%s\n' '[]' > /tmp/screenpeak-empty-staged.json
TEST_DATABASE_URL=postgresql://YOUR_USER@127.0.0.1:5432/screenpeak_copy \
  npm run reset:catalog -w @screenpeak/web -- \
  --database-env TEST_DATABASE_URL --confirm-local-copy \
  --staged /tmp/screenpeak-empty-staged.json \
  --write-manifest /tmp/screenpeak-reset-manifest.json

TEST_DATABASE_URL=postgresql://YOUR_USER@127.0.0.1:5432/screenpeak_copy \
  npm run reset:catalog -w @screenpeak/web -- \
  --database-env TEST_DATABASE_URL --confirm-local-copy \
  --manifest /tmp/screenpeak-reset-manifest.json

TEST_DATABASE_URL=postgresql://YOUR_USER@127.0.0.1:5432/screenpeak_copy \
  npm run reset:catalog -w @screenpeak/web -- \
  --database-env TEST_DATABASE_URL --confirm-local-copy \
  --manifest /tmp/screenpeak-reset-manifest.json \
  --allow-empty

TEST_DATABASE_URL=postgresql://YOUR_USER@127.0.0.1:5432/screenpeak_copy \
  npm run reset:catalog -w @screenpeak/web -- \
  --database-env TEST_DATABASE_URL --confirm-local-copy \
  --manifest /tmp/screenpeak-reset-manifest.json \
  --apply --allow-empty
```

The command that passes `--allow-empty` and omits `--apply` is a dry-run. It writes nothing. Apply only after that dry-run prints `blocked` `null`.

A size refusal throws before any `reset_backup` schema is created, and the catalogue stays as it was. A successful apply copies the catalogue into a new `reset_backup` schema (`reset_backup`, then `reset_backup_2`, and so on) and does not drop an earlier copy. A failure after that copy (stale fingerprint, count mismatch) leaves the schema and rolls the catalogue change back. A committed manifest cannot be applied again. `reset_backup` is a rehearsal aid. It is not the step 1 dump, and it cannot undo step 7.

A non-empty `--staged` file of `CatalogGame` values is the other reset input. `--apply` still deletes every game first, including any rows `seed:igdb` already wrote.

Seed after the reset. `--top` with no number selects 2000 main games (`game_type = 0`), ranked by `rating_count`, then `rating`, then id. The value must be an integer from 1 to 5000. The command upserts in batches of 50. It writes Steam app ids only for those games. It does not clear accounts, list definitions, follows, or likes, and it does not restore the rows the reset deleted. It needs `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET`, and 0003 must already be applied. A failed batch leaves earlier batches committed and prints the remaining IGDB ids. Re-run the same command with `--resume`.

`--resume` computes the top-N list again, then skips IGDB ids already stored. It does not stop just because some rows exist. Progress is printed to stderr: ranking pages, each fetch with its duration, then each 50-game write with its duration and statement count. The JSON summary on stdout includes `target`, `ranked`, `skippedExisting`, `written`, and `shortfall`. If IGDB has fewer rated main games than `--top` asked for, the command writes that shorter list and exits non-zero. A page shorter than the requested 500 is not treated as the end of the catalogue unless a cursor probe finds nothing past it.

A 50-game batch is a handful of multi-row inserts. Genres, platforms, companies, covers, and external ids are not separate queries per row. Expect a batch to commit in a few seconds on the hosted session pooler, and the full 2000 games in about 5–8 minutes including the IGDB fetches. The command then closes the database pool and exits. Lock waits fail after 5 seconds and statements after 30 seconds.

A seed that you interrupt with Ctrl-C can leave a session idle in a transaction holding the rate-limit row or a catalogue advisory lock. The next write then waits on that lock until the 5 second lock timeout. New connections set `idle_in_transaction_session_timeout` to 15 seconds so a killed session releases the lock. A session left by an older build, or one the pooler kept open, does not have that timeout. `--clear-budget` terminates sessions of this database user, in this database, that have been idle in a transaction (including aborted) for more than 15 seconds while holding one of the seed advisory locks or a lock in `igdb_private`. It checks the backend id and start time again before terminating, so a recycled process is left alone. It does not terminate this command's own session, another role's session, or an ordinary table lock. It deletes every rate-limit lease and resets the spacing clock. Run it only while other seeds are stopped. It does not change the catalogue.

```bash
TEST_DATABASE_URL=postgresql://YOUR_USER@127.0.0.1:5432/screenpeak_copy \
  npm run seed:igdb -w @screenpeak/web -- \
  --database-env TEST_DATABASE_URL --confirm-local-copy --top

TEST_DATABASE_URL=postgresql://YOUR_USER@127.0.0.1:5432/screenpeak_copy \
  npm run seed:igdb -w @screenpeak/web -- \
  --database-env TEST_DATABASE_URL --confirm-local-copy --top --resume
```

## 7. Apply 0007 after the reset and before any build that still selects the old columns

0007 sets `igdb_id` NOT NULL on `games`, `genres`, `platforms`, `developers`, and `publishers`, and drops `rawg_id`, `metacritic_score`, and `games.steam_appid`. It aborts if any of those tables has a null or non-positive `igdb_id`, or if a public function body still names one of those columns. It does not delete rows and it does not use `CASCADE`.

Run it after step 6. The reset has removed the legacy nulls, and the seed writes positive IGDB ids. An empty catalogue also passes the check. Do not run it in the step 5 transaction.

Stop the previous revision before this command. Its `getGameBySlug` selects `games.steam_appid` on every game page, so that page errors as soon as this transaction commits. `getGamesFromSteamIds` in that revision probes `information_schema` and skips `games.steam_appid` once the column is gone; that query is not the one that breaks. This revision does not select the dropped columns, so it can be the running build during 0007. Do not start the older revision again after this command.

```bash
TEST_DATABASE_URL=postgresql://YOUR_USER@127.0.0.1:5432/screenpeak_copy \
  npm run migrate:journal -w @screenpeak/web -- \
  --database-env TEST_DATABASE_URL --confirm-local-copy --apply-pending
```

Expect `applied` to be `0007_igdb_catalog_cleanup` only. Then start this revision. Do not start an older revision after this command.

## 8. Verify

On the database you just changed:

```sql
select column_name from information_schema.columns
 where table_schema = 'public'
   and column_name in ('rawg_id', 'metacritic_score', 'steam_appid');

select table_name, is_nullable from information_schema.columns
 where table_schema = 'public' and column_name = 'igdb_id'
   and table_name in ('games', 'genres', 'platforms', 'developers', 'publishers');

select count(*) from games where igdb_id is null or igdb_id <= 0;
select count(*) from library_entries;
select count(*) from ratings_reviews;
select count(*) from list_games;
select count(*) from users;
select count(*) from lists;
select count(*) from follows;
select count(*) from list_likes;
select count(*) from steam_accounts;
select count(*) from drizzle.__drizzle_migrations;
```

Expect no `rawg_id`, `metacritic_score`, or `steam_appid` columns. Expect five `igdb_id` rows, each `is_nullable = NO`. Expect the invalid-id count, library entries, ratings/reviews, and list memberships to be 0. Expect user, list, follow, like, and Steam-link counts to match the dry-run. Expect 8 journal rows (0000 through 0007).

Then sign in, search, open a game, rate it, edit the library, and import a Steam library against this database. The import resolves owned apps the seed did not map and can insert new library rows. It does not restore the rows step 6 deleted. A normal `seed:igdb` or Steam import after this must not clear those new rows. Neither command is a reset.

## 9. Hosted database

Do this only after the local `_copy` rehearsal in steps 3–8 has been checked. Take a fresh `pg_dump` immediately before this run. Keep the app and every older build stopped. The older build must already be stopped before 0007, same as step 7.

Journal, reset, and seed accept the hosted URL only with `--target-hosted` plus the host and database name typed from that URL. `--confirm-host` must equal the URL hostname. `--confirm-database` must equal the URL database name, including `postgres` when that is the name. A mismatch refuses before connecting. `--target-hosted` refuses a local host. Do not pass `--confirm-local-copy` or `--local-auth-stubs` with it. Do not point the commands at `DATABASE_POOL_URL`. Audit commands do not take `--target-hosted`.

Use a different variable from the rehearsal URL. Replace the host and database name below with the ones in `HOSTED_DATABASE_URL`.

```bash
HOSTED_DATABASE_URL='postgresql://USER:PASSWORD@db.PROJECT.supabase.co:5432/postgres' \
  npm run migrate:journal -w @screenpeak/web -- \
  --database-env HOSTED_DATABASE_URL \
  --target-hosted \
  --confirm-host db.PROJECT.supabase.co \
  --confirm-database postgres
```

Repeat steps 4–8 with those three flags in place of `--confirm-local-copy`, and with `HOSTED_DATABASE_URL` in place of `TEST_DATABASE_URL`. Same order: stamp, `--apply-pending --through 0006_two_score_rpcs`, empty reset dry-run, dry-run with `--allow-empty`, `--apply --allow-empty`, `seed:igdb --top`, then `--apply-pending` for 0007. Stop the older build before that last command. Then run the step 8 queries. Start this revision only after they pass.

## 10. Rollback

- A size refusal does not create `reset_backup` and does not change the catalogue.
- A failed reset transaction rolls the catalogue change back. The app stays stopped. Inspect the error before retrying the same manifest. If the failure happened after the backup copy, that `reset_backup` schema remains; the next apply uses the next name and does not drop it.
- If 0007 fails, its transaction rolls back and 0003–0006 stay, provided step 5 already committed them. Fix the null id or the function body and run step 7 again. Do not restore the dump for that failure alone.
- `reset_backup` cannot undo 0007. Those copies were taken before the column drop, and there is no CLI that restores them. A committed reset manifest cannot be applied again. Do not replay it to undo a later seed.
- To put the local rehearsal back to the step 1 dump, drop that database and repeat step 2. `pg_restore` into the database that already has 0007, `reset_backup`, and new rows does not replace it.

```bash
dropdb --if-exists screenpeak_copy
createdb screenpeak_copy
pg_restore --no-owner --dbname "postgresql://YOUR_USER@127.0.0.1:5432/screenpeak_copy" "$HOME/screenpeak-dev-YYYY-MM-DD.dump"
```

Check out the git revision recorded with that dump.

- Hosted Supabase is not a database you can `dropdb` and recreate. To put it back, stop the app and restore the step 1 custom dump with `--clean` so existing objects are dropped before they are recreated:

```bash
pg_restore --clean --if-exists --no-owner --dbname "$HOSTED_DATABASE_URL" "$HOME/screenpeak-dev-YYYY-MM-DD.dump"
```

Supabase-managed schemas (`auth`, `storage`, extensions) can error on that restore. Read those errors. A partial restore is not the pre-reset database. Check out the git revision recorded with the dump. After new reviews or library rows exist, take a new dump before any restore. Restoring the step 1 dump replaces those rows.

## 11. Environment

`migrate:journal`, `reset:catalog`, and `seed:igdb` load `apps/web/.env.local` from the web package. A missing file is ignored. Variables already set in the environment win, including empty values. `export KEY=value`, `KEY=value`, and `KEY = value` (spaces around `=`) are all read. Quoted values keep the text inside one matching pair of quotes.

Put these in `apps/web/.env.local` or export them. Do not set `RAWG_API_KEY`. No script reads it.

| Variable | Used by |
| --- | --- |
| `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` | `seed:igdb`, IGDB adapter, audit. Required for step 6. The process fetches its own token. |
| `STEAM_API_KEY` | Steam library import and achievements. Not the seed. |
| `TEST_DATABASE_URL` | The name you pass to `--database-env` for the copy. Not read unless you pass that flag. |
| `DATABASE_POOL_URL` | App runtime after cutover. Cutover commands do not fall back to it. `seed:igdb` sets it from `--database-env` inside that process only. |
| `DATABASE_URL` | `drizzle-kit` tooling. Not this checklist. |
| `ANTHROPIC_API_KEY` | Loadout text. Optional page content. |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY` | App auth and account deletion. |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL` | Avatars. |
| `NEXT_PUBLIC_SITE_URL` | Metadata. Defaults to `http://localhost:3000`. |

## 12. Repair a short `--top` seed

The first hosted `--top` (default 2000) can stop at 200 games. IGDB's documented page maximum is 500. The ranker used to treat any shorter page as the end of the catalogue, so a 200-row response was stored as the whole top-N and the command exited 0. `--resume` computed that same short list, found every id already stored, and exited 0 again. Separately, Ctrl-C during a run with no progress output left the rate-limit row locked, so the next run sat until it was killed.

Do not top up those 200 rows. The short page did not finish the tie at its cutoff, so they are not a proven prefix of the real top 2000. Wiping the catalogue and seeding again is the reliable repair. The cutover already deleted library entries, reviews, list memberships, and favourites. This reset deletes the 200 games and their taxonomy rows. It does not delete user accounts, list definitions, follows, likes, or `steam_accounts`.

Stop the app and every other seed or audit first. If 0007 is already applied, do not apply it again. Take a fresh `pg_dump` before this repair if the database has rows you still need; the step 1 dump remains the rollback for the original cutover.

Replace the host and database name below with the ones in `HOSTED_DATABASE_URL`. The clear prints one JSON object and does not write games.

```bash
HOSTED_DATABASE_URL='postgresql://USER:PASSWORD@db.PROJECT.supabase.co:5432/postgres' \
  npm run seed:igdb -w @screenpeak/web -- \
  --database-env HOSTED_DATABASE_URL \
  --target-hosted \
  --confirm-host db.PROJECT.supabase.co \
  --confirm-database postgres \
  --clear-budget
```

Then repeat the step 6 empty reset against `HOSTED_DATABASE_URL` with `--target-hosted`, `--confirm-host`, and `--confirm-database` in place of `--confirm-local-copy`: write the empty manifest, dry-run, dry-run with `--allow-empty`, then `--apply --allow-empty`. After that dry-run prints `blocked` `null`, apply.

Seed the top 2000. Do not pass `--resume` on this empty catalogue. Stderr should keep printing ranking pages past 200 candidates. The stdout JSON should show `ranked` 2000, `written` 2000, and `shortfall` `null`. Exit 0.

```bash
HOSTED_DATABASE_URL='postgresql://USER:PASSWORD@db.PROJECT.supabase.co:5432/postgres' \
  npm run seed:igdb -w @screenpeak/web -- \
  --database-env HOSTED_DATABASE_URL \
  --target-hosted \
  --confirm-host db.PROJECT.supabase.co \
  --confirm-database postgres \
  --top
```

If that run is interrupted after it has committed some batches, rerun the same command with `--resume` added. Resume computes the top 2000 again, skips the ids already stored, and writes the rest. A `shortfall` string and a non-zero exit mean IGDB returned fewer than 2000 rated main games; do not treat that as a finished catalogue.

If `--top` fails with `IGDB games HTTP 400` before a batch commits, nothing was written. Do not reset again. Rerun the same `--top` command. Each follow-up page uses one Apicalypse predicate per field, integer or `null` values, a single `sort` field, and `limit` of at most 500. A decimal `rating` is not sent in `where`. The rejected response body is logged with secrets removed.

Then run the step 8 queries. `games` should be 2000. If 0007 was already applied, `drizzle.__drizzle_migrations` stays at 8 rows. Start this revision only after those queries match step 8.

## 13. IGDB commercial terms

Before public launch, obtain a written IGDB commercial partnership that covers storage, caching, and attribution. The Twitch Developer Agreement defaults to 24-hour caching. The free noncommercial documentation is not permission to ship. This development reset does not satisfy that gate. Do not treat the 24-hour default as the shipped cache policy unless the written agreement says so.

## 14. A `--top` seed that sits after the last fetch

The fetch log is not the end of the run. The old writer then upserted each game with a separate round trip for every genre, platform, company, join row, and Steam id: about sixty statements per game. On the us-west-2 session pooler that is about ten minutes for the first 50 games, with no further log until that batch commits. Nothing is wrong with the ranking, and the games response already includes covers, genres, platforms, companies, and external ids.

Stop that process with Ctrl-C. Do not reset the catalogue. Do not apply 0007 again. Rows already committed stay. `--resume` recomputes the top 2000 and skips stored IGDB ids, so a finished batch of 50 is not written again.

In zsh, with the same `HOSTED_DATABASE_URL` you used for the seed (the host must be exactly the pooler below):

```zsh
H='--database-env HOSTED_DATABASE_URL --target-hosted --confirm-host aws-0-us-west-2.pooler.supabase.com --confirm-database postgres'
HOSTED_DATABASE_URL='postgresql://USER:PASSWORD@aws-0-us-west-2.pooler.supabase.com:5432/postgres' \
  npm run seed:igdb -w @screenpeak/web -- ${=H} --clear-budget --top --resume
```

`--clear-budget` runs first and drops idle catalogue locks left by the interrupted transaction. Stderr should then show each fetch's duration and a `committed` line every few seconds, with a statement count around 20 rather than thousands. The remaining games should finish in about 5–8 minutes. The process closes the pool and exits. A `shortfall` string means IGDB returned fewer than 2000 rated main games.

## 15. Steam import matching that stops, then says it is already running

Matching writes new IGDB games in the request that is open in the browser. The old importer held session advisory lock `1936745323` on a reserved pool connection for that whole request, including one catalogue round trip per genre, platform, company, and Steam id. A batch of games that were not in the 2000-game seed can sit there for minutes. The page only moves forward when that request returns. Refreshing starts a second request, which sees the lock and shows “Matching is already running for your library.” The retry button hits the same lock and stops.

Stop the local dev server so it closes its pool. Apply the lease migration. `0008_steam_import_lease` only adds `igdb_private.steam_import_runs`. It does not change the catalogue. After 0007 is already recorded, this is the only pending file, and the journal goes from 8 rows to 9.

```zsh
H='--database-env HOSTED_DATABASE_URL --target-hosted --confirm-host aws-0-us-west-2.pooler.supabase.com --confirm-database postgres'
HOSTED_DATABASE_URL='postgresql://USER:PASSWORD@aws-0-us-west-2.pooler.supabase.com:5432/postgres' \
  npm run migrate:journal -w @screenpeak/web -- ${=H} --apply-pending
```

Start the app again and open Steam import. A holder of classid `1936745323` that has been idle for 30 seconds is terminated by the new importer before it takes the lease. Writes upsert on `igdb_id` and keep the existing slug, so the games already added (the catalogue moving from 2000 to 2048) are not inserted again.

If the banner is still “already running” after the restart, the pooler kept the old session. Preview, then terminate that backend only. Do not terminate a row whose `state` is `active`, and do not terminate any other advisory class.

```sql
SELECT a.pid, a.usename, a.state, a.state_change, a.backend_start
FROM pg_stat_activity a
JOIN pg_locks l ON l.pid = a.pid
WHERE l.locktype = 'advisory' AND l.granted
  AND l.classid = 1936745323::oid
  AND a.datname = current_database()
  AND a.usename = current_user
  AND a.pid <> pg_backend_pid();
```

Replace the two literals with one row from that preview. `backend_start` must be copied exactly, including the timezone.

```sql
SELECT pg_terminate_backend(a.pid)
FROM pg_stat_activity a
WHERE a.pid = 0
  AND a.backend_start = 'YYYY-MM-DD HH:MM:SS.MS+00'
  AND a.datname = current_database()
  AND a.usename = current_user
  AND a.pid <> pg_backend_pid()
  AND EXISTS (
    SELECT 1 FROM pg_locks l
    WHERE l.pid = a.pid AND l.locktype = 'advisory' AND l.granted
      AND l.classid = 1936745323::oid
  );
```

