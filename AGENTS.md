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


## Commands

```bash
npm run dev        # dev server on :3000
npm run build      # production build
npm run lint       # eslint (core-web-vitals + typescript)
npm run seed       # seed games from RAWG API (requires .env.local with RAWG_API_KEY + SUPABASE_SECRET_KEY)
npm test           # vitest run (one-off)
npm run test:watch # vitest in watch mode
```

Tests: Vitest characterization suite in `test/` — see `test/README.md` for scope.
No typecheck script — use `npx tsc --noEmit` for type checking.

## Structure

- `app/` — Next.js App Router pages and API routes
  - `app/components/` — UI components organized by domain (user, game, library, lists, feed, settings, util)
  - `app/api/` — route handlers: `loadout` (POST, generates the Loadout paragraph),
    `steam/link` + `steam/callback` (Steam OpenID sign-in), `delete-account` (DELETE)
  - `app/auth/confirm/` — landing route for every Supabase auth email link
  - `app/feed-actions.ts` — server action, paginates the activity feed
- `db/` — Drizzle schema (`schema.ts`, `relations.ts`) and hand-authored SQL
  migrations (`db/migrations/`, tracked in `meta/_journal.json` like any
  drizzle-kit migration, even the ones — like `0001_functions_and_triggers.sql`
  and later fixes — that were captured/written by hand rather than generated
  by `drizzle-kit generate`)
- `lib/` — shared logic: Supabase clients, the Drizzle client (`lib/db.ts`),
  `requireUser()` (`lib/auth.ts`), DB queries (`lib/queries/`), utilities
- `scripts/` — standalone scripts (`seed-games.ts`, `inspect-rawg.ts`)
- `test/` — Vitest suite; `types/` — shared TS types mirroring `lib/queries/`

## Supabase Clients & Drizzle

Three different Supabase clients exist, plus a Drizzle client for direct Postgres access — use the right one for context:

| File | Context | Import |
|------|---------|--------|
| `lib/supabase-server.ts` | Server Components / Route Handlers | `import { createClient } from '@/lib/supabase-server'` (async) |
| `lib/supabase-browser.ts` | Client Components via `@supabase/ssr` | `import { createClient } from '@/lib/supabase-browser'` |
| `lib/supabase.ts` | Browser only — raw `supabase-js` client with debug logging | `import { supabase } from '@/lib/supabase'` |
| `lib/db.ts` | Postgres queries outside Auth/Storage (`lib/queries/*`) | `import { db } from '@/lib/db'` (sync, module-scope singleton — never pass it as a function param) |

Do **not** mix them. The server client is async (`await createClient()`). The browser client from `supabase-browser.ts` is sync. `db` connects directly to Postgres and bypasses RLS entirely (the pooler role has `BYPASSRLS`) — any Drizzle mutation must enforce its own authorization (see below), and any Drizzle read of a privacy-gated resource must be gated in application code, not left to a policy that no longer applies.

Functions that intentionally stay on `supabase-js` instead of `db` live in their own dedicated files, never mixed into a Drizzle-backed `lib/queries/*` file — importing a single named export pulls in a module's *entire* top-level import graph, so one `supabase-js`-only function sharing a file with `import { db } from '@/lib/db'` drags Drizzle's `postgres()` client (and its `fs`/`net`/`tls` Node built-ins) into any client bundle that imports the file, breaking the build with `Module not found: Can't resolve 'fs'`. That's why these are split out:
- `lib/queries/user-auth.ts` — genuine Auth calls (`getViewer`, `signInWithPassword`, `signOut`, etc.) — avatar uploads moved to `lib/r2.ts` + `app/user-actions.ts`
- `lib/queries/game-search.ts` — read-only search functions called directly from `'use client'` components (`searchGamesByName`, `searchTaxonomyTable`, `getTaxonomyNameBySlug`)
- `lib/queries/feed-constants.ts` — `FEED_PAGE_SIZE`, a plain constant re-exported from `feed.ts` for client callers, split out for the same reason

Adding a new client-callable helper to `user.ts`, `game.ts`, or `feed.ts` reintroduces this bug — add it to the matching dedicated file instead, or create a new one for a different domain.

Client-side mutations that used to call `lib/queries/*` directly with the browser client now go through Server Actions (`app/library-actions.ts`, `app/review-actions.ts`, `app/list-actions.ts`, `app/user-actions.ts`, `app/steam-actions.ts`), which derive the caller's identity from `requireUser()` (`lib/auth.ts`) instead of trusting a client-supplied id. If you find a component still doing `supabase.from(...).update(...)` with a client-supplied user id, that's a straggler from the pre-Drizzle architecture — move it onto a Server Action instead of leaving it, even if the table's RLS policy happens to make it non-exploitable today (ownership checks belong in one place, not "wherever RLS backstops a shortcut").

### Drizzle gotchas

- **Timestamps**: `postgres`-js returns `timestamptz` columns as `"YYYY-MM-DD HH:MM:SS.sss+00"` (space separator, 2-digit offset) instead of `supabase-js`/PostgREST's ISO-8601 `"YYYY-MM-DDTHH:MM:SS.sssZ"` — some engines' `Date` parsers (notably Safari) reject the former. Always parse a Drizzle-sourced timestamp through `parseDbTimestamp()` (`lib/dates.ts`) before doing date math or calling `.toISOString()`/`new Date(...)` on it directly.
- **Array params to raw RPC calls**: interpolating a plain JS array into drizzle-orm's `sql` template tag (e.g. `` sql`select * from some_fn(p_ids => ${idsArray})` ``) expands it into an `IN`-list (`($1, $2)`), not a native Postgres array — that silently breaks any function parameter typed `uuid[]` (the query throws, and if it's wrapped in the usual `catch { return [] }`, the failure is invisible: no error, just an empty result). Use `uuidArrayParam()` (`lib/sql-helpers.ts`) to build a real `ARRAY[...]::uuid[]` literal instead. `lib/queries/game.ts`'s `queryGames` and `lib/queries/review.ts`'s `getAvgRatingsForGames` both hit this; check any new raw SQL RPC call that takes an array parameter.
- **`SECURITY DEFINER` RPC functions bypass RLS and must repeat its checks by hand**: `get_feed()` (`db/migrations/0002_fix_get_feed_library_privacy.sql`) is the precedent — it joins against `users.library_public` before including a followed user's library activity, mirroring `library_entries`' own RLS policy, because as a `SECURITY DEFINER` function it never goes through RLS in the first place. Any new or modified RPC function that reads a privacy-gated table (`library_entries`, `lists`/`list_games` when `is_public = false`, etc.) needs the same manual check — there is no policy backstopping it.

## Auth & Middleware

`proxy.ts` handles Supabase session refresh on every request via cookie-based SSR. It is not wired as `middleware.ts` by default — verify before modifying.

Supabase auth email links (signup, recovery, email change) all land on
`app/auth/confirm/route.ts`, which handles both the `token_hash`+`type` and `code`
link formats.

## External APIs

- **RAWG API** — game data source, used by `scripts/seed-games.ts` via `lib/rawg.ts`
- **Anthropic API** — generates AI "Loadout" identity text (`lib/loadout.ts`), model
  `claude-sonnet-4-6`. `new Anthropic()` reads `ANTHROPIC_API_KEY` from env implicitly.
  Failures degrade to `''` — the paragraph is optional page content.
- **Steam** — Web API for owned games + achievement completion (`lib/steam.ts`), behind
  Steam OpenID 2.0 sign-in (`lib/steam-openid.ts`); powers the `/steamlink` import flow
- **Cloudflare R2** — user avatars, via a presigned direct-to-R2 upload (`lib/r2.ts`,
  `createAvatarUploadUrl` in `app/user-actions.ts`). Game cover art is RAWG-hosted, never
  uploaded anywhere (remote patterns: `media.rawg.io`, plus the R2 custom domain — derived
  from `R2_PUBLIC_URL` in `next.config.ts`, not hardcoded).

## Env Vars

Required in `.env.local` (gitignored):
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SECRET_KEY` (seed script + admin client in `delete-account`)
- `DATABASE_URL` (session pooler — `drizzle-kit` tooling only, e.g. `npx drizzle-kit push`)
- `DATABASE_POOL_URL` (transaction pooler — the app's runtime Drizzle client, `lib/db.ts`; throws at module load if unset)
- `RAWG_API_KEY` (for seed script)
- `ANTHROPIC_API_KEY` (for loadout generation)
- `STEAM_API_KEY` (Steam library import + achievements)
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`
  (Cloudflare R2 — avatar uploads)
- `NEXT_PUBLIC_SITE_URL` (metadataBase / OG tags; defaults to `http://localhost:3000`)

## Conventions

- **Design system** — "ScreenPeak": screen-peeking at what your friends play.
  Cool-graphite dark ground, one electron-beam cyan accent treated as phosphor
  light, and a **split-screen** motif — the three scores (critic / community /
  you) sit side by side like players sharing a screen. All colour, type, and
  spacing go through CSS custom properties in `app/globals.css`; reference them
  as Tailwind arbitrary properties, e.g. `bg-(--color-bg)`, `text-(--color-text)`,
  `border-(--color-border)`. Do **not** hardcode hex.
  - Ground / surfaces: `--color-bg` `#101215`, `--color-surface` `#181b20`,
    `--color-surface-light` `#21252b`, `--color-border` `#313640`
  - Text: `--color-text` `#dfe3ea` (body), `--color-muted` `#8b919d`
    (genuine secondary text only — not paragraphs)
  - Accent: `--color-accent` `#47c6dd` (electron cyan) — primary buttons, links,
    active nav, and the seam marker. Cool, not icy-pastel; never purple, never brass.
  - Split-screen "player" colours (`--color-critic` = P1 warm `#e8a24e`,
    `--color-community` = P2 grey `#9aa1ad`, `--color-you` = P3 = the accent) —
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
- Path alias: `@/*` maps to project root
- No monorepo — single package
