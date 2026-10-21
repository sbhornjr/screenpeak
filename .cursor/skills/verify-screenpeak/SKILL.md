---
name: verify-screenpeak
description: "Drive the ScreenPeak web app against a local Postgres and prove the Loadout Read-Out through the signed-in UI. Also drives the phone navigation skeleton, the phone profile, the phone library, the phone lists, and the phone game page on Expo web. Use before calling ScreenPeak work done, and whenever a change can affect sign-in, the library fixture, /user/peek/loadout, the phone tabs, the phone profile, the phone library, the phone lists, or the phone game page."
---

# Verify ScreenPeak

ScreenPeak's primary surface is the Next.js web app. This skill launches that app on a disposable local Postgres, signs in as the fixture user through the sign-in dialog, and proves the Loadout Read-Out. The phone navigation skeleton is driven on Expo web against the same local API (`drive mobile-nav`). The phone profile, including follow and the privacy gates, is `drive mobile-profile`. The phone library, including filters and a private library, is `drive mobile-library`. The phone lists, including a private list and the owner's create, edit, and delete, are `drive mobile-lists`. The phone game page, including rate, review, library, and lists, is `drive mobile-game`. Steam import is intentionally absent: agents have no Steam account.

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
node .cursor/skills/verify-screenpeak/verify-screenpeak.mjs drive mobile-nav
node .cursor/skills/verify-screenpeak/verify-screenpeak.mjs drive mobile-profile
node .cursor/skills/verify-screenpeak/verify-screenpeak.mjs drive mobile-forgot-password
node .cursor/skills/verify-screenpeak/verify-screenpeak.mjs drive mobile-sign-up
node .cursor/skills/verify-screenpeak/verify-screenpeak.mjs drive mobile-game
node .cursor/skills/verify-screenpeak/verify-screenpeak.mjs drive mobile-library
node .cursor/skills/verify-screenpeak/verify-screenpeak.mjs drive mobile-lists
```

`drive search` does not start signed in. It reads one of `peek`'s rated games and that game's developer and publisher from Postgres, fetches the game and taxonomy search routes, and types into the catalogue's developer dropdown and the signed-in favorite-game picker. It does not click Lock.

`drive mobile-nav` starts Expo web on `localhost:8081` with `EXPO_PUBLIC_API_URL` pointed at the local website and the public Supabase URL and anon key from the env file this skill wrote. It does not write those values into the repo. It screenshots the four tabs signed out and signed in as peek, peek's public profile signed out, and a second local user `ada` whose library and loadout are private, both signed out and as peek. It also opens the catalogue from Browse and comes Back, opens the Library tab from the profile preview, and opens ada's library (private) and loadout (Not found). It deletes `ada` and stops Expo before it exits. Port 8081 must be free.

`drive mobile-library` starts the same Expo web server. Signed in as peek, it screenshots the Library header, the open Status dropdown, the cover edit overlay, the filters sheet with a facet search, an empty search, and ada's private library at 375×667 and 320×568, plus the centered wordmark on the feed at both widths. It opens one game and the owner's library sheet, then closes both without saving. The edit press stays on the library. It deletes `ada` and stops Expo before it exits. Port 8081 must be free. Do not run it at the same time as another Expo drive.

`drive mobile-lists` starts the same Expo web server. It inserts peek's public list Night runs (one library game), peek's private Secret shelf, ada's public Ada's picks, and ada's private Ada hidden. Wishlist stays empty. Signed in as peek, it opens Lists from the Profile hub and screenshots the index, Night runs, the edit sheet, the empty Wishlist, the New list sheet, ada's index, and Ada's picks at 375×667 and 320×568. Remove stays on the list. The default Wishlist has no Delete. It creates Drive shelf and deletes it. Ada's index hides Ada hidden and has no New list. The private list URL says Not found. It deletes those lists and `ada`, and stops Expo before it exits. Port 8081 must be free. Do not run it at the same time as another Expo drive.

`drive mobile-profile` starts the same Expo web server. It dresses peek's display name, bio, title, read-out, one favorite, and one written review, then restores those columns. It inserts `nova`, whose library and loadout are public, and `ada`, whose library and loadout are private. Signed in as peek, it screenshots the Profile tab, nova, and ada at 375×667 and 320×568. It opens the Settings stub and the ratings stub, opens the Library tab from peek's preview, follows and unfollows nova by user id, and opens nova's library. It deletes `nova` and `ada`, restores peek, and stops Expo before it exits. Port 8081 must be free. Do not run it at the same time as another Expo drive.

`drive mobile-forgot-password` starts the same Expo web server. It does not change peek's password. It inserts a local user `resetfan`, requests a reset from the Log in screen, opens the local recovery link the gateway recorded (there is no email server), sets a new password, then signs in with that password. It also opens set-new-password again while that normal session is signed in and checks the form stays hidden. It deletes `resetfan` and stops Expo before it exits. Port 8081 must be free. Do not run it at the same time as another Expo drive.

`drive mobile-sign-up` starts the same Expo web server. It creates `signupfan` from the Sign up screen, checks the signup request has no PKCE challenge, rejects the password until the local confirmation link is opened, then signs in. It deletes `signupfan` and stops Expo before it exits. Port 8081 must be free. Do not run it at the same time as another Expo drive.

`drive mobile-game` starts the same Expo web server at an iPhone SE viewport (375×667). It opens one of peek's games signed out, checks the library wording and the in-app screenshot viewer, checks Rate opens the signup prompt, taps Log in and checks that sheet is gone on the sign-in screen, then signs in as peek and rates, edits the review, deletes the written review while keeping the score, checks hours, times played, and the 100% flag, changes library status without sending those fields, adds the game to the existing wishlist, and creates a list from the New list step. It then focuses the review field in a 375×420 viewport so Close stays on screen. It restores peek's rating and library row, deletes the created list, and stops Expo before it exits. Port 8081 must be free. Do not run it at the same time as another Expo drive.

`drive game-page` reads one of `peek`'s games from Postgres, fetches `GET /api/v1/games/[slug]` and the reviews route while signed out, and opens the website's game page. It then signs in as peek and checks the library stats on that page. The native screen is `drive mobile-game`.

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

- `page.png` — the website game page, signed out, with the game's name and "In your library" visible
- `library.png` — the same page after sign-in, with hours played, times played, and the 100% flag
- `result.json` — the slug, the API status, `viewer`, `avg_rating`, and the reviews status

A passing game-page proof shows the game name in `page.png`, the signed-out library line, the signed-in library stats in `library.png`, and a 200 from `GET /api/v1/games/[slug]` with `viewer` null in `result.json`.

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

A passing search proof shows the developer name in `filters.png`, the game name in `favorites.png`, 200 from `GET /api/v1/games/search` with `avg_rating` a number and no `avg_ngplus_rating`, and 200 from `GET /api/v1/taxonomy/developers/search` and `GET /api/v1/taxonomy/publishers/search`.

`drive mobile-nav` writes `/tmp/screenpeak-verify/evidence/mobile-nav/`:

- `feed-signed-out.png`, `explore-signed-out.png`, `library-signed-out.png`, `own-profile-signed-out.png` — the four tabs before sign-in
- `user-peek-signed-out.png` — peek's public profile, with Loadout, Lists, and the library counts
- `user-ada-signed-out.png` — ada's private profile, Lists only
- `feed-signed-in.png`, `explore-signed-in.png`, `library-signed-in.png`, `own-profile-as-peek.png` — the same tabs as peek
- `user-ada-as-peek.png` — ada's private profile while signed in as peek
- `library-from-profile.png` and `library-from-peek.png` — the Library tab after the preview is tapped, with the hub no longer on top
- `game-rate-sheet.png` — the Rate sheet on one of peek's games, with Close still visible
- `game-list-sheet.png` — the Add to list sheet on that game
- `game-list-focused.png` — the same sheet with the new-list field focused
- `user-ada-library.png` — ada's library is private, with no game titles and no library request
- `user-ada-loadout.png` — Not found, with no game titles
- `result.json` — the profile JSON checks, the library-tab landing, and ada's 404 library and loadout

A passing mobile-nav proof shows ScreenPeak on each screenshot, the welcome and signup prompts while signed out, peek's games on the signed-in library, Loadout and the library counts on peek's own hub and on the signed-out public profile, and neither Loadout nor the library counts on ada. `result.json` has an empty `problems` list, `library_stats` null for ada, and `viewer.is_owner` true for peek.

`drive mobile-profile` writes `/tmp/screenpeak-verify/evidence/mobile-profile/`:

- `own-375.png` and `own-320.png` — peek's Profile tab at 375×667 and 320×568, with the display name, bio, read-out, and library counts
- `review-title-320.png` — the same profile at 320×568, scrolled to a long review title beside its score
- `public-375.png` and `public-320.png` — nova's public profile at those sizes, with Follow
- `private-375.png` and `private-320.png` — ada's private profile at those sizes, with Follow and Lists, and without Loadout or the library counts
- `result.json` — the follow URL, the library landings, and an empty `problems` list

A passing mobile-profile proof shows ScreenPeak on each screenshot, Peek Reader and the written review on the Profile tab, Nova Vale with Follow and the library counts, and Ada Lovelace with the written review and neither the read-out nor the library counts. Follow and unfollow use `/api/v1/user/<uuid>/follow`. After the drive, peek's display name, bio, title, read-out, favorites, and that review text are restored, and `nova` and `ada` are gone.

`drive mobile-forgot-password` writes `/tmp/screenpeak-verify/evidence/mobile-forgot-password/`:

- `signed-out-home.png` — the welcome, signed out
- `update-without-link.png` — set-new-password opened with no recovery session
- `request.png` — the reset form
- `confirmation.png` — the neutral confirmation
- `update-password.png` — set-new-password after the local reset link
- `updated.png` — the password was saved
- `signed-in.png` — the feed after signing in with the new password
- `normal-session.png` — set-new-password while signed in, with no password fields
- `result.json` — the recover responses, the redirect URL, and the password check

A passing forgot-password proof shows ScreenPeak on each screenshot, the same confirmation sentence, Send reset link disabled after that sentence, the set-new-password form after the local link, the feed without the welcome after the new password, and the reset-link sentence again on `normal-session.png`. `result.json` has an empty `problems` list, `recoverBodiesMatch` true, `repeatDisabled` true, `oldPasswordRejected` true, `storedPasswordMatches` true, and `pkceChallenge` true. peek's password is still `peekpeek`.

`drive mobile-sign-up` writes `/tmp/screenpeak-verify/evidence/mobile-sign-up/`:

- `request.png` — the sign-up form
- `confirmation.png` — the check-your-email sentence
- `unconfirmed.png` — Log in before the confirmation link
- `signed-in.png` — the feed after the link and the same password
- `result.json` — the signup challenge, the verify status, and the sign-in

A passing sign-up proof shows ScreenPeak on each screenshot, the check-your-email sentence, "Email not confirmed" before the link, and the feed without the welcome after it. `result.json` has an empty `problems` list, `signupChallenge` null, `confirmed` true, and `signedIn` true. peek's password is still `peekpeek`.

`drive mobile-game` writes `/tmp/screenpeak-verify/evidence/mobile-game/`:

- `se-signed-out.png` — the game at 375×667, signed out, with the name, the cover facts, and In your library visible
- `cover-se.png` — the same cover row at 320×568
- `screenshot-viewer.png` — the in-app full-screen screenshot, with Close screenshot
- `signup.png` — the signup prompt after Rate
- `se-signed-in.png` — the same game as peek, with Your score
- `library-stats.png` — hours played 12.5, times played 4, and the 100% flag
- `write-review.png` — Write a review at the bottom right of Reviews, signed out
- `review-saved.png` — the new written review
- `edit-review.png` — Edit your review at the bottom right of Reviews
- `review-edited.png` — the edited review
- `review-deleted.png` — the score still on the page after the written review is gone, with Write a review
- `library-saved.png` — the new status, with the same hours, times played, and 100% flag still on the page and unchanged in Postgres
- `list-sheet.png` — the lists and New list, before the create fields
- `new-list.png` — the create step after New list
- `list-created.png` — the new list in the Add to list sheet
- `keyboard-open.png` — the rate sheet at 375×420 with the review field focused and Close on screen
- `result.json` — the write checks and an empty `problems` list
- `postgres.txt` — the review text, the status-only library row, the list counts, and the restored fixture

`drive mobile-library` writes `/tmp/screenpeak-verify/evidence/mobile-library/`:

- `header-375.png` and `header-320.png` — Status: All, Sort: Name, and 100% only
- `menu-375.png` and `menu-320.png` — the open Status dropdown
- `overlay-375.png` and `overlay-320.png` — the cover edit pencil
- `own-375.png` and `own-320.png` — peek's Library tab and a game
- `odd-375.png` and `odd-320.png` — the same grid, with an odd number of cards, at 375×667 and 320×568
- `sort-375.png` and `sort-320.png` — Date added, with the descending sort toggle
- `filters-375.png` and `filters-320.png` — the filters sheet, with a facet search open
- `empty-375.png` and `empty-320.png` — a search with no games
- `private-375.png` and `private-320.png` — ada's private library
- `logo-375.png` and `logo-320.png` — the centered Screen | Peak wordmark on the feed
- `result.json` — the wordmark offsets, the game path, and an empty `problems` list

A passing mobile-library proof shows ScreenPeak on each screenshot, a game on the Library tab, Clear filters in the sheet, "No games found" after the search, and "This library is private." on ada's library. `result.json` has an empty `problems` list and wordmark deltas within 12px. ada is gone after the drive.

`drive mobile-lists` writes `/tmp/screenpeak-verify/evidence/mobile-lists/`:

- `index-375.png` and `index-320.png` — Your Lists, Show: My lists, New list, and the private list
- `own-375.png` and `own-320.png` — Night runs, its game, and the remove control
- `edit-375.png` and `edit-320.png` — the edit sheet, including Delete list
- `empty-375.png` and `empty-320.png` — the empty Wishlist
- `create-375.png` and `create-320.png` — the New list sheet
- `other-index-375.png` and `other-index-320.png` — ada's lists, without the private list or New list
- `other-375.png` and `other-320.png` — Ada's picks, without Edit, Add games, or Remove
- `result.json` — the paths, the cell widths, and an empty `problems` list
- `postgres.txt` — Drive shelf gone, and the Wishlist id

A passing mobile-lists proof shows ScreenPeak on each screenshot, Show: My lists, Night runs with its description, List name on the create and edit sheets, This list is empty on the Wishlist, ada's public list, and no Ada hidden on ada's index. `result.json` has an empty `problems` list. After the drive, Drive shelf, Night runs, Secret shelf, Ada's picks, and Ada hidden are gone, and ada is gone. Wishlist is still peek's default list.

A passing mobile-game proof shows ScreenPeak and the game name on `se-signed-out.png`, the signup sentence on `signup.png`, the new review then the edited review, the score still visible after the written review is deleted, a library PUT body that is only `{ "status": ... }` while Postgres still has hours 12.5, play count 4, and the 100% flag, the game on the wishlist and on the created list, and Close inside the short viewport. `result.json` has an empty `problems` list. After the drive, peek still has five ratings and five library rows, and the created list is gone.

## Cleanup

```bash
node .cursor/skills/verify-screenpeak/verify-screenpeak.mjs down
```

Kill only the pids in `/tmp/screenpeak-verify/pids`. After `down`, `/tmp/screenpeak-verify/evidence/loadout-readout/`, `/tmp/screenpeak-verify/evidence/game-page/`, `/tmp/screenpeak-verify/evidence/read-endpoints/`, `/tmp/screenpeak-verify/evidence/game-writes/`, `/tmp/screenpeak-verify/evidence/search/`, `/tmp/screenpeak-verify/evidence/mobile-nav/`, `/tmp/screenpeak-verify/evidence/mobile-profile/`, `/tmp/screenpeak-verify/evidence/mobile-forgot-password/`, `/tmp/screenpeak-verify/evidence/mobile-sign-up/`, `/tmp/screenpeak-verify/evidence/mobile-game/`, `/tmp/screenpeak-verify/evidence/mobile-library/`, and `/tmp/screenpeak-verify/evidence/mobile-lists/` must still exist. Confirm that before treating the run as finished.

## Helpers

The only helper is the executable script. Run it with `node` as shown above (the file is also executable). There is no separate browser binary to install beyond `google-chrome`. PostgREST is downloaded on `up` into `/tmp/screenpeak-verify/postgrest` when it is not already there (pinned to v16.4, linux static x86-64).

Keep the feature map honest with `/maintain-verification-skill` when the app changes.
