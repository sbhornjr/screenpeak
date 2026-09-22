# Drizzle migration for the query layer

## Goal

Match the pattern already used on the user's other project: `supabase-js` for
authentication only, Drizzle (direct Postgres) for everything else. Today
ScreenPeak uses `supabase-js` for both — RLS is the only authorization
backstop, including for a handful of mutations issued straight from client
components.

## Scope

**In scope:** the 9 files in `lib/queries/`, the 3 client-side mutation call
sites that need to become Server Actions, and the Drizzle client + auth-helper
plumbing they depend on.

**Out of scope (tracked, not done here):**
- Standardizing error handling across query functions (today's handling is
  inconsistent — some functions check `{ error }` and log/degrade, most just
  coalesce `data ?? []`/`null`). This migration preserves each function's
  existing behavior exactly rather than fixing this; worth a dedicated pass
  later.
- The `AGENTS.md` "Supabase Clients" table update — deferred until the whole
  migration lands, then it gets a fourth row for Drizzle.
- The SECURITY DEFINER / arbitrary-`p_user_id` RPC exposure noted during the
  schema migration (`get_feed` and others bypass the `library_public` flag).
  Unrelated to this migration; separate follow-up.
- Storage bucket migration, full env cutover to the new Supabase project —
  both already called out as follow-ups from the schema/data migration work.

## Architecture

Two new files, no changes to the three existing Supabase clients
(`lib/supabase.ts`, `lib/supabase-server.ts`, `lib/supabase-browser.ts`):

- **`lib/db.ts`** — exports a singleton `db` (Drizzle + `postgres` driver)
  built from `db/schema.ts`/`db/relations.ts` (already on disk from the
  schema migration). Runtime connection uses the **transaction pooler**
  (port 6543, `prepare: false`), not the session-pooler `DATABASE_URL` that
  `drizzle.config.ts` uses for migrations — matches Supabase's documented
  pattern for app-runtime connections. Needs a new env var,
  `DATABASE_POOL_URL`.
- **`lib/auth.ts`** — exports `requireUser()`, wrapping the existing
  `lib/supabase-server.ts` client + `auth.getUser()`. Returns the verified
  user id (throws/redirects if unauthenticated). This is the only source of
  truth for "who is making this request" anywhere a Drizzle mutation needs
  it — never a client-supplied id.

## Query-function conversion pattern

Every `lib/queries/*.ts` function keeps its current shape — client as first
param, plain args after — just `db: DrizzleDb` instead of
`supabase: SupabaseClient`. This preserves the existing test style exactly:
`test/lib/queries.game.test.ts` fakes the client's chain inline (no
`vi.mock`), and that approach carries over unchanged, just faking Drizzle's
chain shape instead of Supabase's.

RPC calls (22 across the codebase, all thin wrappers around the 27 Postgres
functions kept from the schema migration) become
`db.execute(sql\`select * from fn_name(p_arg => ${val}, ...)\`)`, using
Postgres named-argument syntax — mirrors how they're already called as named
params via `supabase.rpc()` today.

## Auth boundary for the 3 Server Action conversions

Three call sites currently mutate the DB straight from a `'use client'`
component, authorized only by RLS on a client-supplied user id:

- `app/components/library/LibraryButton.tsx` → `createLibraryEntry`,
  `updateLibraryEntry`, `deleteLibraryEntry`
- `app/components/lists/LikeListButton.tsx` → `likeList`, `unlikeList`
- `app/components/user/AvatarUploader.tsx` → `updateAvatarUrl` (the
  `uploadAvatarImage` half of this component stays on `supabase-js` — it's a
  Storage upload, not a Postgres write)

Each becomes a Server Action. `requireUser()` is called inside the Server
Action itself, not inside the query-layer function — the query layer stays
pure data access parameterized by `userId`, exactly like today. Only the
*source* of that `userId` moves from "trusted client prop" to "verified
session inside a Server Action."

## What stays on `supabase-js` (not converted)

Within `lib/queries/user.ts`, these are genuinely Auth or Storage operations,
not Postgres queries, and stay as-is: `signInWithPassword`,
`signUpWithPassword`, `signOut`, `updateEmail`, `updatePassword`,
`uploadAvatarImage`, `deleteUserAccount` (calls the Auth admin API; the
corresponding `public.users` row cleanup already happens via the
`ON DELETE CASCADE` FK, no separate DB call needed).

## Error handling

Preserve each function's current behavior exactly when converting it —
translate the Supabase idiom to the Drizzle idiom 1:1, don't standardize or
improve it. Drizzle throws on query failure (unlike `supabase-js`, which
returns `{ data, error }` and usually doesn't throw), so a function that
today silently coalesces `data ?? []`/`null` on error needs an explicit
try/catch reproducing that same silent-degrade behavior; a function that
today checks `{ error }` and logs-then-continues or throws gets the
equivalent try/catch. (Standardizing this is the tracked, out-of-scope item
above.)

## Sequencing (Approach 1 — incremental, domain-by-domain)

1. `lib/db.ts` + `lib/auth.ts` — set up once, first.
2. Read-only, low-risk files: `game.ts`, `explore.ts`, `stats.ts`, `steam.ts`.
3. Mutation-heavy files + their Server Action conversions together:
   `library.ts`, `review.ts`, `list.ts`.
4. `user.ts` last — splitting the DB-backed functions (17 of them: `getViewer`,
   `getProfileSummaryByUsername`, `getProfileSummaryById`, `getFullProfile`,
   `getUserIdFromUsername`, `getAccountSettings`, `updateBio`,
   `updateUsername`, `updateSelectedTitle`, `updateFavoriteGames`,
   `updateAvatarUrl`, `updatePrivacy`, `getFollowers`, `getFollowing`,
   `followUser`, `unfollowUser`, `getCurrentLoadoutIdentity`) from the 7 that
   stay on `supabase-js` (listed above).
5. `feed.ts` (single function, `getFeed`, wraps `get_feed` RPC) — grouped with
   step 2 order-wise but trivial either way.

Each step: convert the file, update that file's tests if it has any, verify
manually against the dev server, before moving to the next file. Old
`supabase-js` imports in a file are only removed once nothing in that file
references them.

## Testing

No new tests for thin pass-through wrappers — matches the existing
characterization-suite philosophy (`test/README.md`): "testing them would
assert 'it called the client', which breaks on any refactor without catching
real bugs." Existing tests with real logic to preserve
(`test/lib/queries.game.test.ts` — `getGameTaxonomy`, `getDistinctEsrbRatings`,
`getDeveloperNameMap`) get their fake client updated to Drizzle's chain shape
in the same step that converts `game.ts`.
