# IGDB hosted cutover checklist

Owner steps for the development database. Nothing in this file has been run against hosted Supabase. The commands refuse a non-local URL, and they refuse a database whose name does not end in `_test` or `_copy`. `--confirm-local-copy` does not lift either refusal. It only allows a localhost URL that still has Supabase dump markers (a tunnel). `--local-auth-stubs` still refuses those markers.

Run every command from the repository root. Set `TEST_DATABASE_URL` yourself. The scripts do not read `DATABASE_POOL_URL`.

Keep the app and every other writer stopped from the backup until the verification queries pass and you start the revision that no longer selects `rawg_id`, `metacritic_score`, or `games.steam_appid`.

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

The database name must end in `_copy`. Rehearse steps 3–10 on this restore before repeating them on any other database. A restored Supabase dump has auth markers, so every journal, reset, and seed command needs `--confirm-local-copy` after you have checked the URL is that restore and not a tunnel to the hosted project. Do not pass `--local-auth-stubs` on this dump.

If the first rehearsal fails, fix the cause and repeat the stamp, apply, reset, seed, and column drop on a second local restore. Do not continue to another database from a rehearsal you have not checked.

## 3. Journal dry-run

Writes nothing.

```bash
TEST_DATABASE_URL=postgresql://YOUR_USER@127.0.0.1:5432/screenpeak_copy \
  npm run migrate:journal -w @screenpeak/web -- \
  --database-env TEST_DATABASE_URL --confirm-local-copy
```

Expect `baseline` `ready` and `pending` starting at `0003_igdb_request_budget` and ending at `0007_igdb_catalog_cleanup`. If `baseline` is `reject`, stop. Do not stamp. Reasons such as a missing `games.rawg_id` or an existing `games.igdb_id` mean this is not an unjournaled 0000–0002 database.

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
npm run migrate:journal -w @screenpeak/web -- \
  --database-env TEST_DATABASE_URL --apply-pending --local-auth-stubs
```

## 5. Apply 0003–0006 only

`--apply-pending` with no `--through` runs every pending file, including 0007, in one transaction. 0007 raises when any catalogue row has a null or non-positive `igdb_id`. Legacy rows still have null `igdb_id`, so that raise rolls 0003–0006 back with it. Stop after 0006.

```bash
TEST_DATABASE_URL=postgresql://YOUR_USER@127.0.0.1:5432/screenpeak_copy \
  npm run migrate:journal -w @screenpeak/web -- \
  --database-env TEST_DATABASE_URL --confirm-local-copy \
  --apply-pending --through 0006_two_score_rpcs
```

Expect `applied` to be `0003_igdb_request_budget`, `0004_igdb_catalog_preparation`, `0005_taxonomy_slug_unique`, `0006_two_score_rpcs`. Do not use `drizzle-kit migrate` before the stamp: an empty journal would replay `0000`.

This revision reads `igdb_id`, `game_external_ids`, and `igdb_private`. Start it only after this step. It does not select `rawg_id`, `metacritic_score`, or `games.steam_appid`, so it may run while those columns still exist. Keep it stopped until step 10 if you are not ready to serve traffic. Do not start a build from before this revision after step 8: that build selects `games.steam_appid`.

## 6. Reset, then seed

`reset:catalog --apply` deletes every game and taxonomy row, then inserts only the games in the manifest. `seed:igdb --top` writes games directly and does not build that manifest. A seed run before `--apply` is deleted by the reset. The order that leaves the top-N catalogue in place is reset, then seed.

`--confirm-before-task-6` is ignored. Do not pass it. Task 6 matches Steam libraries from `game_external_ids` and does not read `games.steam_appid`.

Write an empty manifest, dry-run, then apply. The dry-run writes nothing. It prints current counts and `blocked`, because an empty manifest over an existing catalogue is refused until `--allow-empty`. Read `library`, `reviews`, `memberships`, and `favourites` before you apply. Those rows are the loss.

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
  --apply --allow-empty
```

`--allow-empty` is required for this empty manifest. `--allow-small` is a different flag: it permits replacing 25 or more games with fewer than 25 and fewer than 10% of the current count. Do not pass `--allow-small` for this empty reset.

Apply copies the catalogue into a new `reset_backup` schema (`reset_backup`, then `reset_backup_2`, and so on) and does not drop an earlier copy. A failed apply leaves that schema and rolls the catalogue change back. A committed manifest cannot be applied again.

A non-empty `--staged` file of `CatalogGame` values is the other reset input. `--apply` still deletes every game first, including any rows `seed:igdb` already wrote.

Seed after the reset. `--top` with no number selects 2000 main games (`game_type = 0`), ranked by `rating_count`, then `rating`, then id. The value must be an integer from 1 to 5000. The command upserts in batches of 50. It does not clear library entries, reviews, lists, or accounts. It needs `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET`, and 0003 must already be applied. A failed batch leaves earlier batches committed and prints the remaining IGDB ids. Re-run the same command with `--resume`.

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

This revision does not select the dropped columns, so it can be the running build during 0007. Stop any older build first. `getGameBySlug` and `getGamesFromSteamIds` in the previous revision read `games.steam_appid`.

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

Then sign in, search, open a game, rate it, edit the library, and import a Steam library against this database. A normal `seed:igdb` or Steam import after this must not clear those new rows. Neither command is a reset.

## 9. Hosted database

Repeat steps 3–8 only when the URL is `127.0.0.1`, `localhost`, or `::1`, the database name ends in `_copy`, and you pass `--confirm-local-copy` after you have verified the target. These commands refuse a `supabase.co` host. They also refuse database name `postgres`, which is the usual hosted name, even through a tunnel. `--confirm-local-copy` does not change that. Do not point the commands at `DATABASE_POOL_URL`.

Take a fresh `pg_dump` immediately before that run. Keep the app stopped until step 8 passes, then start this revision.

## 10. Rollback

- A failed reset transaction rolls back. The app stays stopped. Inspect the error before retrying the same manifest. The `reset_backup` schema from that attempt remains; the next apply uses the next name and does not drop it.
- If 0007 fails, its transaction rolls back and 0003–0006 stay. Fix the null id or the function body and run step 7 again. Do not restore the dump for that failure alone.
- If you need the pre-reset database back, stop the app and restore the step 1 custom dump. Check out the git revision recorded with that dump. `reset_backup` cannot undo 0007: those copies were taken before the column drop, and there is no CLI that restores them.
- A committed reset manifest cannot be applied again. Do not replay it to undo a later seed.
- After new reviews or library rows exist, take a new dump before any restore. Restoring the step 1 dump replaces those rows.

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
