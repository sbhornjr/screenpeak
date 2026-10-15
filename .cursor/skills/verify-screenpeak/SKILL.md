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
4. Applies the local-app SQL in the helper (authenticator role, grants, JWT-reading `auth.uid()`, `verify_local.passwords`, the `peek` user, and the fixture library). `auth-stubs.sql` installs `auth.uid()` as `SELECT NULL::uuid`. Leaving that in place makes the RLS update match zero rows, so the helper replaces the function after migrate. Do not run that replacement on a Supabase database.
5. Starts PostgREST on `127.0.0.1:54322` and the Auth/PostgREST gateway on `127.0.0.1:54321`.
6. Starts `npm run dev -- -H 127.0.0.1 -p 3210`.

The gateway is a stand-in for Supabase Auth, PostgREST's public URL, and the API gateway. This environment has no Docker, so `supabase start` is not the launch path. A full local Supabase stack would not need steps 4–5; the Next.js app, the fixture, and the browser drive still would. The stand-in implements the Auth calls the sign-in dialog and `getUser()` make (`POST /auth/v1/token?grant_type=password`, refresh, `GET /auth/v1/user`, logout) and proxies `/rest/v1/*` to PostgREST. It does not implement the rest of GoTrue.

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

Read-only. It checks that the recorded Next, gateway, and PostgREST pids are alive, that `http://127.0.0.1:3210/` returns 200, that Postgres is on `127.0.0.1` and the database name is `screenpeak_verify_copy`, that `peek` has at least five ratings, and that `google-chrome` exists. It prints whether `ANTHROPIC_API_KEY` is set. A missing key does not by itself fail doctor: the page can still be driven, and the drive reports the missing key when generation cannot finish. Run doctor before the first drive and again after any failed drive. If doctor cannot see a wedged browser, run `down` and `up` again rather than reusing the session.

## Drive

The harness is this script. Feature recipes name the exact subcommand. Prefer the accessible names in the feature file. The sign-in inputs are not labelled with `htmlFor`; the recipe uses the placeholder attribute, which is the stable handle in `AuthModal`.

```bash
node .cursor/skills/verify-screenpeak/verify-screenpeak.mjs drive loadout-readout
```

The drive resets `peek`'s Read-out columns to null, signs in through the dialog, opens Loadout from the account menu and from `/user/peek/loadout`, clicks `Generate your Read-out`, and reads `public.users` back. It exits 0 only when the page shows the generated paragraph and `loadout_identity` in Postgres equals that paragraph. It exits 2 when the click ran but the model call did not produce text. Any other failure exits 1.

## Evidence

Proof for a drive is written to `/tmp/screenpeak-verify/evidence/loadout-readout/` and is not removed by `down`:

- `before.png` — Loadout page before the click, with the fixture stats visible
- `after.png` — the same page after the click
- `result.json` — button outcome, `/api/loadout` status and body, and the Postgres row
- `postgres.txt` — the `psql` output for the user, library count, rating count, and Read-out columns

A passing proof shows the action (the Generate control) and the resulting state (the paragraph on screen and the same text in `users.loadout_identity`). A missing `ANTHROPIC_API_KEY` is a failed proof: the screenshot shows the page error, Postgres still has a null `loadout_identity`, and `result.json` names the env var. Do not substitute a canned paragraph.

## Cleanup

```bash
node .cursor/skills/verify-screenpeak/verify-screenpeak.mjs down
```

Kill only the pids in `/tmp/screenpeak-verify/pids`. After `down`, the evidence directory above must still exist. Confirm that before treating the run as finished.

## Helpers

The only helper is the executable script. Run it with `node` as shown above (the file is also executable). There is no separate browser binary to install beyond `google-chrome`. PostgREST is downloaded on `up` into `/tmp/screenpeak-verify/postgrest` when it is not already there (pinned to v16.4, linux static x86-64).

Keep the feature map honest with `/maintain-verification-skill` when the app changes.
