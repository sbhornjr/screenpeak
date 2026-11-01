# ScreenPeak

Next.js 16 (App Router) gaming profile app backed by Supabase. Tailwind CSS v4.
(The repo directory is still historically `ng-plus`; the product name is
**ScreenPeak** — it was renamed from "NG+" over a trademark conflict. The
Supabase columns / RPC fields `ngplus_rating` and `avg_ngplus_rating` keep their
names — renaming them needs a DB migration and they never surface in the UI.
Frontend wiring was renamed: the tic event is `screenpeak:plus1`, its CSS class
`sp-plus1`.)

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->


## Monorepo layout

npm workspaces (`"workspaces": ["apps/*", "packages/*"]` in the root `package.json`):

- `apps/web/` — the Next.js site (`@screenpeak/web`). Every tool config
  (`next.config.ts`, `tsconfig.json`, ESLint, PostCSS, Vitest, Drizzle, Sentry)
  and `.env.local` live here, next to its `package.json`.
- `apps/mobile/` — the Expo app (`@screenpeak/mobile`, Expo SDK 58, Expo Router).
  Its own `AGENTS.md` covers Expo rules. Screens in `src/app/`, the tab bar in
  `src/components/app-tabs.tsx`, and `@/` there means `apps/mobile/src/`.
  **Styling is `StyleSheet` + tokens** (NativeWind was rejected in the Phase 0
  spike): import values from `@/theme`, which re-exports
  `packages/shared/tokens.ts` plus the font mapping — pick a font weight by
  `fontFamily` (`face.mono[600]`), never `fontWeight`. `Eyebrow`, `Seal` and
  `GameCard` are ported in `src/components/`.
- `packages/shared/` (`@screenpeak/shared`) — code **both** apps import, shipped
  as TypeScript source (web compiles it via `transpilePackages`). Import by
  subpath: `@screenpeak/shared/types`, `/types/<file>`, `/schemas` (zod),
  `/constants` (`FEED_PAGE_SIZE`), `/tokens`. It must never import `db`,
  `postgres`, `next/*`, React, or anything server-only — everything in it ships
  inside the phone app.
- Root keeps only the workspace `package.json`, the **single** `package-lock.json`
  (never add one inside an app — Next.js uses it to find the monorepo root), the
  hoisted `node_modules/`, and repo-wide docs (`AGENTS.md`, `DESIGN.md`, `build-plan.md`).

**One React for the whole monorepo.** `react`/`react-dom` are pinned to the
exact version the Expo SDK requires (React Native's renderer checks for an exact
match), in both apps' `package.json` *and* the root `overrides`. npm hoists into
one shared `node_modules`, so a different web React lands at the root and gets
bundled into the mobile app next to its own copy ("Invalid hook call"). On an
Expo SDK upgrade: run `npx expo install --fix` in `apps/mobile`, then copy its
`react` version into `apps/web/package.json` and the root `overrides`, and
confirm with `npx expo-doctor`. Never bump React in the web app alone.

**Unless noted, every path in the rest of this file is relative to `apps/web/`**
(e.g. `lib/db.ts` means `apps/web/lib/db.ts`), and so is the `@/` import alias —
write `@/lib/db`, never `@/apps/web/lib/db`. Run `npm install` from the root only.

## Commands

From the repo root (the root scripts forward to the web workspace, which runs
with `apps/web/` as its working directory, so `process.cwd()` paths still resolve):

```bash
npm run dev                                          # web dev server on :3000
npx tsc --noEmit -p apps/web                         # web typecheck
npx tsc --noEmit -p apps/mobile                      # mobile typecheck
npx tsc --noEmit -p packages/shared                  # shared package typecheck
npm run lint                                         # eslint (core-web-vitals + typescript)
npm test                                             # unit tests (vitest run)
TEST_DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/screenpeak_test' \
  npm run test:igdb-integration -w @screenpeak/web   # Postgres integration tests
npm run mobile                                       # expo start (flags: npm run mobile -- --clear)
```

`TEST_DATABASE_URL` must be a local database whose name ends in `_test`, and the
role must be allowed to `CREATE DATABASE`. The integration config is
`apps/web/vitest.igdb-integration.config.mts`. Unit tests do not need a database.
See `apps/web/test/README.md` for what each suite covers.

Agent skills live in `.cursor/skills/` (Cursor automations read only that folder).
`.claude/skills/<name>` is a symlink to each one, for Claude Code. Add a skill
there and link it; never copy it. There is no `.agents/skills/`, because Cursor
also reads that folder and would load every skill twice.

Before calling work done, run the verify-screenpeak skill and attach its evidence.
When you add or change a user-facing feature, update verify-screenpeak's feature map using the maintain-verification-skill skill, and include the new flow's evidence in the PR.

## Local Postgres

Cloud agents never connect to the hosted database. Do not pass `--target-hosted`.
`DATABASE_URL`, `DATABASE_POOL_URL`, and `LOCAL_DATABASE_URL` for agent work point
at `127.0.0.1`, `localhost`, or `::1`, and the database name ends in `_test` or `_copy`.

`apps/web/.env.local` is gitignored. `migrate:journal` and `seed:igdb` read it and
do not override variables already set in the shell. They never fall back to
`DATABASE_POOL_URL`. A localhost URL can still be a tunnel: check the host.

Empty local Postgres has no `anon` or `authenticated` role and no `auth.uid()`.
Run the stub file once before the first migrate. Do not run it on Supabase.

```bash
psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 -f apps/web/db/local/auth-stubs.sql
npm run migrate:journal -w @screenpeak/web -- --database-env LOCAL_DATABASE_URL --apply-pending
```

`seed:igdb` is local-only. The host must be `127.0.0.1`, `localhost`, or `::1`,
and the database name must end in `_test` or `_copy`.

```bash
npm run seed:igdb -w @screenpeak/web -- --database-env LOCAL_DATABASE_URL --top
npm run seed:igdb -w @screenpeak/web -- --database-env LOCAL_DATABASE_URL --ids 1,2,3
```

Details: `docs/igdb.md`.

## Rules for agents

- Talk to IGDB only through `lib/igdb/` and `scripts/seed-igdb.ts`. Talk to Steam only through `lib/steam.ts`, `lib/steam-openid.ts`, and `lib/catalog/steam-import.ts`. Do not call those APIs from a new client.
- Never put `SUPABASE_SECRET_KEY` (the service role key) in client code, `NEXT_PUBLIC_*` env, or a module imported by a `'use client'` component. The admin client stays in `app/api/delete-account`.
- Cloud agents never connect to the hosted database.

## Test account

Username `peek`, email `hornflakes+peek@mail.grokbot.com`, password `peekpeek`.
The account exists on the hosted Supabase project and its email is verified.
Agents may use it for testing however they see fit when a hosted-backed run is
available. Cloud agents do not get that run: they stay on local Postgres.

For a local database, create the same user after auth stubs and `migrate:journal`.
`auth.users` in the stub file has no password column. Inserting the row fires
`handle_new_user()`, which creates `public.users` (username from
`raw_user_meta_data`) and the default Wishlist:

```bash
psql "$LOCAL_DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO auth.users (id, email, raw_user_meta_data)
SELECT gen_random_uuid(), 'hornflakes+peek@mail.grokbot.com', '{"username":"peek"}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM auth.users WHERE email = 'hornflakes+peek@mail.grokbot.com'
);
SQL
```

Signing in through the UI still needs a Supabase Auth server. The stub database
is not one. `verify-screenpeak` starts a local Auth and PostgREST stand-in, stores
`peekpeek` in `verify_local.passwords`, and gives `peek` five rated games.
When `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` are set it seeds them with
`seed:igdb --top 100` on the local database only. Otherwise it inserts the
fixture games.
Use that harness, or another fixture user you insert the same way, for local runs.

## Structure (`apps/web/`)

- `app/` — Next.js App Router pages and API routes
  - `app/components/` — UI components organized by domain (user, game, library, lists, feed, settings, util)
  - `app/api/` — route handlers: `loadout` (POST, generates the Loadout paragraph for the website;
    the phone calls `POST /api/v1/me/loadout`, and both use `generateReadout` in `lib/loadout-readout.ts`),
    `steam/link` + `steam/callback` (Steam OpenID sign-in), `delete-account` (DELETE)
  - `app/auth/confirm/` — landing route for every Supabase auth email link
  - `app/feed-actions.ts` — server action, paginates the activity feed
- `db/` — Drizzle schema (`schema.ts`, `relations.ts`) and hand-authored SQL
  migrations (`db/migrations/`, tracked in `meta/_journal.json` like any
  drizzle-kit migration, even the ones — like `0001_functions_and_triggers.sql`
  and later fixes — that were captured/written by hand rather than generated
  by `drizzle-kit generate`)
- `lib/` — shared logic: Supabase clients, the Drizzle client (`lib/db.ts`),
  `requireUser()` (`lib/auth.ts`), DB queries (`lib/queries/`), page loaders
  (`lib/loaders/`), utilities
- `scripts/` — IGDB seed and the migration journal (`seed-igdb.ts`, `establish-migration-journal.ts`). See `docs/igdb.md` and Local Postgres above. `seed:igdb` is local-only.
- `test/` — Vitest suite. Shared TS types (mirroring `lib/queries/`) and the zod
  schemas live in `packages/shared`, not here — see Monorepo layout
- `assets/fonts/` — OFL fonts read by `lib/og.tsx` via `process.cwd()` for OG images

## Supabase Clients & Drizzle

Three Supabase clients exist, plus a Drizzle client for direct Postgres access — use the right one for context:

| File | Context | Import |
|------|---------|--------|
| `lib/supabase-server.ts` | Server Components / Route Handlers | `import { createClient } from '@/lib/supabase-server'` (async) |
| `lib/supabase-browser.ts` | Client Components via `@supabase/ssr` | `import { createClient } from '@/lib/supabase-browser'` |
| `lib/supabase-stateless.ts` | Server — verifying a bearer token (`auth.getUser(token)`); no cookies, no session storage. Only `lib/auth.ts` should need it | `import { createStatelessClient } from '@/lib/supabase-stateless'` (sync, one per request) |
| `lib/db.ts` | Postgres queries outside Auth/Storage (`lib/queries/*`) | `import { db } from '@/lib/db'` (sync, module-scope singleton — never pass it as a function param) |

Do **not** mix them. The server client is async (`await createClient()`). The browser client from `supabase-browser.ts` is sync. `db` connects directly to Postgres and bypasses RLS entirely (the pooler role has `BYPASSRLS`) — any Drizzle mutation must enforce its own authorization (see below), and any Drizzle read of a privacy-gated resource must be gated in application code, not left to a policy that no longer applies.

Functions that intentionally stay on `supabase-js` instead of `db` live in their own dedicated files, never mixed into a Drizzle-backed `lib/queries/*` file — importing a single named export pulls in a module's *entire* top-level import graph, so one `supabase-js`-only function sharing a file with `import { db } from '@/lib/db'` drags Drizzle's `postgres()` client (and its `fs`/`net`/`tls` Node built-ins) into any client bundle that imports the file, breaking the build with `Module not found: Can't resolve 'fs'`. That's why these are split out:
- `lib/queries/user-auth.ts` — genuine Auth calls (`signInWithPassword`, `signOut`, etc.) — avatar uploads moved to `lib/r2.ts` + `app/user-actions.ts`. "Who's signed in?" is *not* here: see "Who's calling" below
- `FEED_PAGE_SIZE` — a plain constant client callers need, split out of `feed.ts` for the same reason; it now lives in `@screenpeak/shared/constants` (dependency-free by design, like everything in `packages/shared`)

Game and taxonomy typeahead lives on `db` in `lib/queries/game.ts` (`searchGamesByName`, `searchTaxonomyTable`, `getTaxonomyNameBySlug`). Client components call `app/search-actions.ts`. `GET /api/v1/games/search` and `GET /api/v1/taxonomy/[table]/search` call the same functions. Do not import those queries from a `'use client'` file — that pulls `lib/db` into the browser bundle.

Adding a new client-callable helper to `user.ts`, `game.ts`, or `feed.ts` reintroduces this bug — add it to the matching dedicated file instead, or create a new one for a different domain.

Client-side mutations that used to call `lib/queries/*` directly with the browser client now go through Server Actions (`app/library-actions.ts`, `app/review-actions.ts`, `app/list-actions.ts`, `app/user-actions.ts`, `app/steam-actions.ts`), which derive the caller's identity from `requireUser()` (`lib/auth.ts`) instead of trusting a client-supplied id. If you find a component still doing `supabase.from(...).update(...)` with a client-supplied user id, that's a straggler from the pre-Drizzle architecture — move it onto a Server Action instead of leaving it, even if the table's RLS policy happens to make it non-exploitable today (ownership checks belong in one place, not "wherever RLS backstops a shortcut").

### Drizzle gotchas

- **Timestamps**: `postgres`-js returns `timestamptz` columns as `"YYYY-MM-DD HH:MM:SS.sss+00"` (space separator, 2-digit offset) instead of `supabase-js`/PostgREST's ISO-8601 `"YYYY-MM-DDTHH:MM:SS.sssZ"` — some engines' `Date` parsers (notably Safari) reject the former. Always parse a Drizzle-sourced timestamp through `parseDbTimestamp()` (`@screenpeak/shared/dates`) before doing date math or calling `.toISOString()`/`new Date(...)` on it directly.
- **Array params to raw RPC calls**: interpolating a plain JS array into drizzle-orm's `sql` template tag (e.g. `` sql`select * from some_fn(p_ids => ${idsArray})` ``) expands it into an `IN`-list (`($1, $2)`), not a native Postgres array — that silently breaks any function parameter typed `uuid[]` (the query throws, and if it's wrapped in the usual `catch { return [] }`, the failure is invisible: no error, just an empty result). Use `uuidArrayParam()` (`lib/sql-helpers.ts`) to build a real `ARRAY[...]::uuid[]` literal instead. `lib/queries/game.ts`'s `queryGames` and `lib/queries/review.ts`'s `getAvgRatingsForGames` both hit this; check any new raw SQL RPC call that takes an array parameter.
- **`bigint` / `numeric` come back as strings by default**: postgres-js returns both (every RPC's `COUNT(*)` and `AVG()`) as strings, and a raw `db.execute(...)` result cast `as unknown as T` hides it — `"9.67"` then fails `typeof x === "number"` and `x === 1` checks while loose `>`/`/` math quietly works. `lib/db.ts` registers parsers that turn both into JS numbers, so don't add per-call `Number()` coercion; Drizzle's typed `numeric()` columns (`hours_played`) still come back as strings.
- **`SECURITY DEFINER` RPC functions bypass RLS and must repeat its checks by hand**: `get_feed()` (`db/migrations/0002_fix_get_feed_library_privacy.sql`) is the precedent — it joins against `users.library_public` before including a followed user's library activity, mirroring `library_entries`' own RLS policy, because as a `SECURITY DEFINER` function it never goes through RLS in the first place. Any new or modified RPC function that reads a privacy-gated table (`library_entries`, `lists`/`list_games` when `is_public = false`, etc.) needs the same manual check — there is no policy backstopping it.

## Auth & Middleware

`apps/web/proxy.ts` is the Next.js 16 proxy (the old `middleware.ts` filename). It refreshes the Supabase session on matched requests. There is no `middleware.ts`.

Supabase auth email links (signup, recovery, email change) all land on
`app/auth/confirm/route.ts`, which handles both the `token_hash`+`type` and `code`
link formats.

### Who's calling (`lib/auth.ts`) and the `/api/v1` error shape (`lib/api.ts`)

- **On the server, anywhere** (Server Components, Server Actions, Route Handlers):
  `getOptionalUser()` → `{ id, email } | null`, or `requireUser()` → `{ id, email }`
  (throws 401 when signed out). No arguments — they read the current request via
  Next's `headers()` / `cookies()`: `Authorization: Bearer <access_token>` if present
  (the phone app sends it), else the Supabase session cookie (the browser sends it).
- **In a `'use client'` component:** these are server-only; call the browser
  client's `supabase.auth.getUser()` (as `UserContext` / `ChangePasswordButton` do).
- Every path verifies with the Auth server (`getUser`), never the token's claims
  locally, so sign-out / account deletion take effect immediately. (The project
  signs with ES256, so `getClaims()` could verify locally and skip the round trip —
  at the cost of revoked tokens working until they expire.)
- **`/api/v1` handlers call `getBearerUser()`**, which reads only
  `Authorization: Bearer`. No header means signed out (`null`), even when the
  browser also sent a session cookie. Pages and Server Actions keep
  `getOptionalUser()` / `requireUser()` (bearer, else cookie).
  `GET /api/v1/me` returns `{ user: null }` with no email. `GET /api/v1/me/settings`
  is 401 without a bearer and never includes a Steam id (`steam_linked` only).
- **`/api/v1` writes call `requireBearerUser()`.** It is `getBearerUser()` plus a
  401 `unauthenticated` when the Bearer header is absent. It never reads the
  session cookie and it does not spend the write budget. Reads stay on
  `getBearerUser()` so a missing token is the signed-out payload, not an error.
  `GET /api/v1/me/library/[gameId]` calls `requireBearerUser()` and does not
  spend a write token. POST, PUT, PATCH, and DELETE call
  `consumeWriteRateLimit` (`lib/rate-limit.ts`) after that: 60 requests per 60
  seconds per user, stored in `api_rate_limits` (migration 0009). Over the
  budget is 429 `rate_limited` with `Retry-After` and `retry_after` in the
  body. Search routes and `app/search-actions.ts` call
  `consumeSearchRateLimit` after the query parses: 120 per 60 seconds. The
  bucket is `search:user:<uuid>` when the caller is signed in (bearer on the
  route, cookie on the action), otherwise `search:ip:<address>`. The address
  is the first `x-vercel-forwarded-for` hop, then `x-real-ip`, then the last
  `x-forwarded-for` hop, else `local`. A 401 does not spend the search budget.
  `test/api/v1-routes-auth.test.ts` requires `requireBearerUser` and
  `consumeWriteRateLimit` on POST, PUT, PATCH, and DELETE, and fails if a GET
  calls `consumeWriteRateLimit`. A nested function with the helper's name does
  not count. The same file fails if a non-test module calls
  `searchGamesByName`, `searchTaxonomyTable`, or `searchLibraryTaxonomy` from
  `lib/queries/game.ts` without calling the imported `consumeSearchRateLimit`.
  Stale buckets (window older than a day) are deleted by
  `GET /api/cron/rate-limits`, which requires `Authorization: Bearer`
  `CRON_SECRET`. `apps/web/vercel.json` schedules that daily.
- Files under `app/api/v1/` cannot import cookie auth. `eslint/v1-bearer-only.mjs`
  (rule `screenpeak/v1-bearer-only`) fails lint on `getOptionalUser`,
  `requireUser`, `cookies` from `next/headers` (including a `.cookies()` call),
  and `@/lib/supabase-server`. Scope analysis also flags an alias
  (`import { getOptionalUser as readSession }`, `const readSession = getOptionalUser`),
  a member call (`auth.getOptionalUser()`), a namespace import of `@/lib/auth`
  or `next/headers`, and `import('@/lib/auth')`, `import('next/headers')`, or
  `import('@/lib/supabase-server')`. `test/api/v1-routes-auth.test.ts` parses
  every route file with the TypeScript compiler. Comments do not count.
  `withAuth` must be imported from `@/lib/api`, and the handler must call
  `getBearerUser` or `requireBearerUser` imported from `@/lib/auth`. A local
  function with those names does not count. `GET /home` and
  `GET /user/[username]/ratings_reviews` have no caller. `GET /app-config` is
  the other exception: the phone reads it before sign-in, including with a
  stale bearer, so it must not touch the session. Their tests lock that. A new
  route is not in that set.
- **A route's `@/lib` imports, and one level of functions those imports call,
  must not swallow a failed read** as `[]`, `null`, `new Set()`, `new Map()`,
  `catch { return fallback() }`, `const empty = []; return empty`, or
  `.catch(() => ({ ...[] }))` (`test/api/v1-reads-throw.test.ts`). The walk
  includes same-module helpers. `getDeveloperNameMap` and `getHeroGame` are
  the exception: characterization tests lock their empty fallback, and an
  outage inside those two can still look empty.
- **A bad bearer token fails closed** — 401 `invalid_token`, never a fallback to a
  cookie, and it throws even from `getOptionalUser()`. An unreachable Auth
  server is **503 `auth_unavailable`, never 401** (a 401 makes the app sign the user out);
  in a page, either error renders `app/error.tsx`.
- Every `/api/v1` error body is `{ error: { code, message } }`, typed as
  `ApiErrorBody` / `ApiErrorCode` in `@screenpeak/shared/api/errors` (the phone app's
  contract — add new codes there). Throw an `ApiError` (or `UnauthenticatedError` /
  `AuthUnavailableError`) and wrap the handler:
  `export const GET = withAuth(async (req, ctx: RouteContext<'/api/v1/…'>) => { … })`.
  `withAuth` renders any `ApiError`; anything else is logged and becomes a generic
  500 `internal` — never put internals in an `ApiError` message.

### Loaders (`lib/loaders/`) and the `/api/v1` contract

A loader is a page's data gathering lifted out of `page.tsx`, so the page and its
`GET /api/v1/...` route return the same thing (`lib/loaders/game-page.ts` is the
reference). **Write one only when it earns its keep** — it combines several
queries, gates privacy, or reshapes rows into the contract. A single query that can
return the contract type itself is called directly by both the page and the route
(`getGameReviewsForPage` → `GET /api/v1/games/[slug]/reviews`). Either way:
- Return a type **declared in `@screenpeak/shared/api/*`** (never inferred from the
  loader or query). The IGDB prelaunch reset changed this v1 contract in place
  (no `rawg_id`, no Metacritic, `igdb_id` and `artwork_image_url` added). Once a
  client ships, change it additively.
- **Build the response field by field** — or, for a query returned as-is, make its
  `select` list exactly the contract's columns. Extra columns leak silently
  (TypeScript won't flag them); send only what the screen needs, not whole rows
  like account settings.
- **Queries an API route calls must throw on a DB error**, not `catch { return [] }`
  like most of `lib/queries/*`: through the API an outage has to be a 500, not a
  plausible empty result. A web page that wants the old forgiving behaviour
  `.catch()`es at the call site.
- **Everything must survive `JSON.stringify`**: no `Set`/`Map` (→ `{}`), no `Date`;
  convert `numeric` strings to numbers. Loader tests check a JSON round trip.
- **Privacy gates live in the loader**, never in `page.tsx` — `db` bypasses RLS and
  the route would skip a page-level check.
- Viewer-specific data goes in a `viewer` block that's `null` when signed out, and
  its queries don't run at all then. URL-paged data (reviews) gets its own endpoint.
- **Paged queries need a total order** (`ORDER BY sort_col, …, id`): with `OFFSET`
  paging, ties in the sort column otherwise repeat or skip rows between pages.
- **Query params:** parse them with zod in a small module both callers import, **strict** for the API
  (throw `ApiError(400, 'invalid_request', message naming the param)`) and **lenient**
  for the web page (per-field `.catch(default)`, as hand-edited URLs always have been) —
  `lib/game-reviews-query.ts` is the reference. Shared limits go in
  `@screenpeak/shared/constants`.
- The route: `withAuth` → `getBearerUser()` → loader → `404 not_found` or
  `Response.json(data)` with `Cache-Control: private, no-store`. Paths mirror the
  site: `/api/v1/user/[username]/library`, `/lists`, `/lists/[listId]`,
  `/ratings_reviews`, `/loadout`, plus `/games`, `/feed`, `/explore`, `/home`,
  `/me`, and `/me/settings`. A missing player and a private library, loadout, or
  list are the same 404. Response types and `createApiClient` live in
  `@screenpeak/shared/api`.

## External APIs

- **IGDB** — catalogue seed and Steam-app matching (`lib/igdb/`, `scripts/seed-igdb.ts`). Twitch client credentials. `/steamlink` matches owned apps through `game_external_ids` (`lib/catalog/steam-import.ts`). There is no RAWG client.
- **Anthropic API** — generates AI "Loadout" identity text (`lib/loadout.ts`), model
  `claude-sonnet-4-6`. `new Anthropic()` reads `ANTHROPIC_API_KEY` from env implicitly.
  Failures degrade to `''` — the paragraph is optional page content.
- **Steam** — Web API for owned games + achievement completion (`lib/steam.ts`), behind
  Steam OpenID 2.0 sign-in (`lib/steam-openid.ts`); powers the `/steamlink` import flow.
  Phone linking does not use the website session. `POST /api/v1/me/steam/link-intent`
  takes an S256 PKCE `codeChallenge` and returns a 5-minute HMAC `state` bound
  to the bearer user (`STEAM_LINK_INTENT_SECRET`, at least 32 characters). The
  signature is not stored. The phone opens the relative `path`
  (`GET /api/steam/link?state=…&client=mobile`). When `state` is present, that
  request and `GET /api/steam/callback` must not read cookies. The callback
  checks that `openid.return_to`'s `state` equals the request state (both
  absent on the website flow) and only then stores the Steam id on the intent.
  It redirects to `screenpeak://steamlink?code=<one-time>`. A bad, expired, or
  reused state, or a missing secret, redirects to `screenpeak://steamlink?ok=0`.
  `POST /api/v1/me/steam/link-complete` (bearer + write budget) commits the link
  when the bearer user, the intent user, and the PKCE verifier all match.
  Realm and `return_to` use `NEXT_PUBLIC_SITE_URL`, not the request host. The
  website button omits `state` and still uses the session cookie.
  `POST /api/v1/me/steam/import` is the batch cursor (`runSteamImportBatch`,
  lease heartbeat 5s, takeover 30s). A busy lease does not spend the write
  budget. There is no whole-library GET. `POST /api/v1/me/library/import` still
  confirms the selection.
- **Cloudflare R2** — user avatars, via a presigned direct-to-R2 upload (`lib/r2.ts`,
  `createAvatarUploadUrl` in `app/user-actions.ts`). The R2 env is read when an
  upload URL is signed, not when the module loads: `user-actions.ts` shares a
  page with other server actions, and a missing bucket must not fail those.
  Game cover art is IGDB-hosted, never
  uploaded anywhere (remote patterns: `images.igdb.com`, plus the R2 custom domain — derived
  from `R2_PUBLIC_URL` in `next.config.ts`, not hardcoded).

## Env Vars

Required in `apps/web/.env.local` (gitignored):
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SECRET_KEY` (admin client in `delete-account`)
- `DATABASE_URL` (session pooler — read by `apps/web/drizzle.config.ts`. Apply schema changes with `migrate:journal`, not `drizzle-kit push`. See `docs/igdb.md`)
- `DATABASE_POOL_URL` (transaction pooler — the app's runtime Drizzle client, `lib/db.ts`; throws at module load if unset)
- `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` (IGDB seed and Steam-app matching)
- `ANTHROPIC_API_KEY` (for loadout generation)
- `STEAM_API_KEY` (Steam library import + achievements)
- `STEAM_LINK_INTENT_SECRET` (phone Steam OpenID state; at least 32 characters. The website Steam button does not read it. Missing or short, `POST /api/v1/me/steam/link-intent` is 500. The mobile callback and link GET redirect to `screenpeak://steamlink?ok=0` instead of throwing)
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`
  (Cloudflare R2 — avatar uploads)
- `NEXT_PUBLIC_SITE_URL` (metadataBase / OG tags; defaults to `http://localhost:3000`)

## Conventions

- **Design system** — "ScreenPeak": screen-peeking at what your friends play.
  Cool-graphite dark ground, one electron-beam cyan accent treated as phosphor
  light, and a **split-screen** motif — You and Community sit side by side.
  All colour, type, and
  spacing go through CSS custom properties in `app/globals.css`; reference them
  as Tailwind arbitrary properties, e.g. `bg-(--color-bg)`, `text-(--color-text)`,
  `border-(--color-border)`. Do **not** hardcode hex. `packages/shared/tokens.ts`
  is a hand-copy of these values for the phone app — **change a colour in both
  places**; `test/shared/tokens.test.ts` fails if they drift.
  - Ground / surfaces: `--color-bg` `#101215`, `--color-surface` `#181b20`,
    `--color-surface-light` `#21252b`, `--color-border` `#313640`
  - Text: `--color-text` `#dfe3ea` (body), `--color-muted` `#8b919d`
    (genuine secondary text only — not paragraphs)
  - Accent: `--color-accent` `#47c6dd` (electron cyan) — primary buttons, links,
    active nav, and the seam marker. Cool, not icy-pastel; never purple, never brass.
  - Score colours (`--color-you` = the accent, `--color-community` = `#9aa1ad`) —
    used only by the stat compare.
  - Rating tiers (reserved for score *values* on cards / distributions, never
    decoration): `--color-good` `#4f86c6` (≥8), `--color-mid` `#e0a13f` (6–7),
    `--color-bad` `#e0574c` (<6)
- **The seam** — a 2px vertical cyan bar is the recurring structural marker: it
  precedes every `SectionHead` and page `Eyebrow`, and divides the wordmark
  (`Screen` | `Peak`). It replaced an earlier `▸` menu-cursor glyph. Use
  `Eyebrow` / `SectionHead`, don't re-roll the markup.
- **Fonts** — Chakra Petch (`--font-display`, a semi-condensed screen-readout
  face for headings), IBM Plex Sans (`--font-body`), IBM Plex Mono
  (`--font-mono`, tracked-uppercase labels, datestamps, and numeric data only).
  Set in `app/layout.tsx`.
- Reusable UI lives in `app/components/util/` — prefer `Eyebrow`, `SectionHead`,
  `Wordmark`, `EmptyState`, `StatGrid`, `DistributionChart`, `Pagination`,
  `Panel`, `Modal` (and `app/components/user/Avatar`) over re-rolling one.
- Path alias: `@/*` maps to `apps/web/` (not the repo root) — see Monorepo layout
