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

## 12. IGDB commercial terms

Before public launch, obtain a written IGDB commercial partnership that covers storage, caching, and attribution. The Twitch Developer Agreement defaults to 24-hour caching. The free noncommercial documentation is not permission to ship. This development reset does not satisfy that gate. Do not treat the 24-hour default as the shipped cache policy unless the written agreement says so.
