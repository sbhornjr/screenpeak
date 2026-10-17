---
name: verify-screenpeak
description: "Drive the ScreenPeak web app against a local Postgres and prove the Loadout Read-Out through the signed-in UI. Use before calling ScreenPeak work done, and whenever a change can affect sign-in, the library fixture, or /user/peek/loadout."
---

# Verify ScreenPeak

ScreenPeak's primary surface is the Next.js web app. The phone app is a second surface and is not driven here. This skill launches the web app on a disposable local Postgres, signs in as the fixture user through the sign-in dialog, and proves the Loadout Read-Out. Steam import is intentionally absent: agents have no Steam account.

One instance per machine. `up` refuses when port 3210, 54321, or 54322 is already taken. Do not point this skill at a hosted database.

## Launch

From the repo root, with local Postgres already accepting connections (`pg_isready -h 127.0.0.1`):

```bash
node .cursor/skills/verify-screenpeak/verify-screenpeak.mjs up
node .cursor/skills/verify-screenpeak/verify-screenpeak.mjs doctor
```

`up` is ready when it prints `ready http://127.0.0.1:3210` and `doctor` exits 0. Ready means the home page returns 200 and the fixture user `peek` has five ratings. A database that only accepts connections is not ready.

What `up` does, in order:

1. Creates role `screenpeak` (login, superuser, password `screenpeak`) and database `screenpeak_verify_copy` if they are missing. The superuser connection is the local stand-in for the hosted pooler role that bypasses RLS. Drizzle reads on the Loadout page use it. The Read-out save does not: that save goes through PostgREST as `authenticated` and is subject to RLS.
2. Writes `apps/web/.env.local` only when that file is absent or already contains the line `verify-screenpeak local stack`. A pre-existing env file without that marker is left untouched and `up` exits. The file is gitignored.
3. On an empty database, runs `apps/web/db/local/auth-stubs.sql`, then `npm run migrate:journal -w @screenpeak/web -- --database-env LOCAL_DATABASE_URL --apply-pending`.
4. Applies the local-app SQL in the helper (authenticator role, grants, JWT-reading `auth.uid()`, `verify_local.passwords`, and the `peek` user). `auth-stubs.sql` installs `auth.uid()` as `SELECT NULL::uuid`. Leaving that in place makes the RLS update match zero rows, so the helper replaces the function after migrate. Do not run that replacement on a Supabase database.
5. Seeds the catalogue, local database only. When `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` are both set, it runs `npm run seed:igdb -w @screenpeak/web -- --database-env LOCAL_DATABASE_URL --top 100` and gives `peek` five of those games (same genre when one has at least five) with ratings 9, 8, 8, 7, and 6. The seed command refuses a non-local URL. Do not pass `--target-hosted`. When either Twitch variable is unset, it does not call IGDB and inserts the five-game fixture (`Fixture Roguelike` / `Peak Fixture 1`–`5`) instead. A failed seed with the keys set does not fall back to that fixture.
6. Starts PostgREST on `127.0.0.1:54322` and the Auth/PostgREST gateway on `127.0.0.1:54321`.
7. Starts `npm run dev -- -H 127.0.0.1 -p 3210`. The Next process inherits `ANTHROPIC_API_KEY` when it is set. The helper does not write that key, or the Twitch secrets, into `apps/web/.env.local` or the evidence files.

The gateway is a stand-in for Supabase Auth, PostgREST's public URL, and the API gateway. This environment has no Docker, so `supabase start` is not the launch path. A full local Supabase stack would not need the authenticator role, the `auth.uid()` replacement, or the gateway. The Next.js app, the catalogue seed, and the browser drive still would. The stand-in implements the Auth calls the sign-in dialog and `getUser()` make (`POST /auth/v1/token?grant_type=password`, refresh, `GET /auth/v1/user`, logout) and proxies `/rest/v1/*` to PostgREST. It does not implement the rest of GoTrue.

`R2_PUBLIC_URL` is required by `apps/web/next.config.ts` even though the Read-out never uploads. When it is unset, `up` writes `https://verify-screenpeak.invalid` and records the substitution in `/tmp/screenpeak-verify/state.json`. That host is not a bucket. Do not invent `ANTHROPIC_API_KEY`, `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `STEAM_API_KEY`, or a hosted `SUPABASE_SECRET_KEY`. The Loadout model call has no stub flag in `lib/loadout.ts`.

Teardown:

```bash
node .cursor/skills/verify-screenpeak/verify-screenpeak.mjs down
```

`down` stops the PostgREST, gateway, Next, and Chrome processes recorded in `/tmp/screenpeak-verify/pids`, drops `screenpeak_verify_copy`, and deletes `apps/web/.env.local` only if this skill wrote it. When this run created the `authenticator` role, `down` drops that role too. The role is cluster-wide, and `apps/web/db/local/auth-stubs.sql` refuses every database on a cluster where `authenticator` exists, including `test:igdb-integration`. It does not stop the system Postgres and it does not delete `/tmp/screenpeak-verify/evidence`.

## Doctor

```bash
node .cursor/skills/verify-screenpeak/verify-screenpeak.mjs doctor
```

Read-only. It checks that the recorded Next, gateway, and PostgREST pids are alive, that `http://127.0.0.1:3210/` returns 200, that Postgres is on `127.0.0.1` and the database name is `screenpeak_verify_copy`, that `peek` has at least five ratings, and that `google-chrome` exists. It prints whether `ANTHROPIC_API_KEY`, `TWITCH_CLIENT_ID`, and `TWITCH_CLIENT_SECRET` are set, and which catalogue mode ran. A missing Anthropic key does not by itself fail doctor: the page can still be driven, and the drive reports the missing key when generation cannot finish. Run doctor before the first drive and again after any failed drive. If doctor cannot see a wedged browser, run `down` and `up` again rather than reusing the session.

## Drive

The harness is this script. Feature recipes name the exact subcommand. Prefer the accessible names in the feature file. The sign-in inputs are not labelled with `htmlFor`; the recipe uses the placeholder attribute, which is the stable handle in `AuthModal`.

```bash
node .cursor/skills/verify-screenpeak/verify-screenpeak.mjs drive loadout-readout
node .cursor/skills/verify-screenpeak/verify-screenpeak.mjs drive game-page
node .cursor/skills/verify-screenpeak/verify-screenpeak.mjs drive read-endpoints
node .cursor/skills/verify-screenpeak/verify-screenpeak.mjs drive game-writes
node .cursor/skills/verify-screenpeak/verify-screenpeak.mjs drive search
```

`drive search` does not start signed in. It reads one of `peek`'s rated games and that game's developer from Postgres, fetches the game and taxonomy search routes, and types into the catalogue's developer dropdown and the signed-in favorite-game picker. It does not click Lock.

`drive game-page` does not sign in. It reads one of `peek`'s games from Postgres, fetches `GET /api/v1/games/[slug]` and the reviews route, and opens the website's game page. The native screen is checked with Expo web, not this drive.

`drive read-endpoints` does not sign in. It fetches the public read routes, hides `peek`'s library and loadout, inserts one private list, and checks that those stay off the JSON. It restores the public flags and deletes that list before it exits.

`drive game-writes` signs in as `peek` through the local gateway password grant, not the website dialog. It updates one existing rating's text, changes that game's library status without clearing hours, play count, or the 100% flag, creates a private list containing the game, and checks that the review route is 401 without a bearer and 401 with only a cookie. It restores the rating, the status, and those three library columns, and deletes the list with `DELETE /api/v1/lists/[listId]` before it exits. Rating and library counts stay at five.

The drive resets `peek`'s Read-out columns to null, signs in through the dialog, opens Loadout from the account menu and from `/user/peek/loadout`, clicks `Generate your Read-out`, and reads `public.users` back. It exits 0 only when the page shows the generated paragraph and `loadout_identity` in Postgres equals that paragraph. It exits 2 when the click ran but the model call did not produce text. Any other failure exits 1.

## Evidence

Proof for a drive is written under `/tmp/screenpeak-verify/evidence/` and is not removed by `down`.

`drive loadout-readout` writes `/tmp/screenpeak-verify/evidence/loadout-readout/`:

- `before.png` — Loadout page before the click, with the fixture stats visible
- `after.png` — the same page after the click
- `result.json` — button outcome, `/api/loadout` status and body, and the Postgres row
- `postgres.txt` — the `psql` output for the user, library count, rating count, and Read-out columns

A passing Loadout proof shows the action (the Generate control) and the resulting state (the paragraph on screen and the same text in `users.loadout_identity`). A missing `ANTHROPIC_API_KEY` is a failed proof: the screenshot shows the page error, Postgres still has a null `loadout_identity`, and `result.json` names the env var. Do not substitute a canned paragraph.

`drive game-page` writes `/tmp/screenpeak-verify/evidence/game-page/`:

- `page.png` — the website game page, signed out, with the game's name visible
- `result.json` — the slug, the API status, `viewer`, `avg_rating`, and the reviews status

A passing game-page proof shows the game name in `page.png` and a 200 from `GET /api/v1/games/[slug]` with `viewer` null in `result.json`.

`drive read-endpoints` writes `/tmp/screenpeak-verify/evidence/read-endpoints/`:

- `page.png` — `/user/peek` signed out, with the username visible
- `result.json` — status codes for the public profile, library, loadout, lists, catalogue, `/me`, and `/me/settings`, plus the 404s after the library and loadout are made private

A passing read-endpoints proof shows `peek` in `page.png`, 200s for the public reads, `viewer` null, 404 `Not found.` for the private library, loadout, and list, and 401 from `/api/v1/me/settings`.

`drive game-writes` writes `/tmp/screenpeak-verify/evidence/game-writes/`:

- `page.png` — the website game page for the game that was written, with the name visible
- `result.json` — the write statuses, the Postgres review and library status from before the restore, and the counts
- `postgres.txt` — the during-write review and status, then the restored row

A passing game-writes proof shows the game name in `page.png`, 401 without a bearer, 401 for a cookie with no bearer, 200 for the review and library updates with the same values in Postgres, hours 12.5 and play count 4 and the 100% flag still set after the status-only save, 201 for the list with one `list_games` row, 204 from `DELETE /api/v1/lists/[listId]`, 400 for a self-follow, and counts of 5 and 5 after the restore.

`drive search` writes `/tmp/screenpeak-verify/evidence/search/`:

- `filters.png` — `/games` with filters open and the developer name in the dropdown
- `favorites.png` — Choose Favorite Games, signed in, with the game name in the results
- `result.json` — the search statuses, including the empty-query 400, the `limit=21` 400, the `genres` 400, the cookie-only 200, and the bad-bearer 401

A passing search proof shows the developer name in `filters.png`, the game name in `favorites.png`, 200 from `GET /api/v1/games/search` with `avg_rating` a number and no `avg_ngplus_rating`, and 200 from `GET /api/v1/taxonomy/developers/search`.

## Cleanup

```bash
node .cursor/skills/verify-screenpeak/verify-screenpeak.mjs down
```

Kill only the pids in `/tmp/screenpeak-verify/pids`. After `down`, `/tmp/screenpeak-verify/evidence/loadout-readout/`, `/tmp/screenpeak-verify/evidence/game-page/`, `/tmp/screenpeak-verify/evidence/read-endpoints/`, `/tmp/screenpeak-verify/evidence/game-writes/`, and `/tmp/screenpeak-verify/evidence/search/` must still exist. Confirm that before treating the run as finished.

## Helpers

The only helper is the executable script. Run it with `node` as shown above (the file is also executable). There is no separate browser binary to install beyond `google-chrome`. PostgREST is downloaded on `up` into `/tmp/screenpeak-verify/postgrest` when it is not already there (pinned to v16.4, linux static x86-64).

Keep the feature map honest with `/maintain-verification-skill` when the app changes.
