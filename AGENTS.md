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
- `lib/` — shared logic: Supabase clients, DB queries (`lib/queries/`), utilities
- `scripts/` — standalone scripts (`seed-games.ts`, `inspect-rawg.ts`)
- `test/` — Vitest suite; `types/` — shared TS types mirroring `lib/queries/`

## Supabase Clients

Three different Supabase clients exist — use the right one for context:

| File | Context | Import |
|------|---------|--------|
| `lib/supabase-server.ts` | Server Components / Route Handlers | `import { createClient } from '@/lib/supabase-server'` (async) |
| `lib/supabase-browser.ts` | Client Components via `@supabase/ssr` | `import { createClient } from '@/lib/supabase-browser'` |
| `lib/supabase.ts` | Browser only — raw `supabase-js` client with debug logging | `import { supabase } from '@/lib/supabase'` |

Do **not** mix them. The server client is async (`await createClient()`). The browser client from `supabase-browser.ts` is sync.

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
- **Supabase Storage** — user avatars and game images (remote patterns: `media.rawg.io`,
  `*.supabase.co/storage/v1/object/public/**`)

## Env Vars

Required in `.env.local` (gitignored):
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SECRET_KEY` (seed script + admin client in `delete-account`)
- `RAWG_API_KEY` (for seed script)
- `ANTHROPIC_API_KEY` (for loadout generation)
- `STEAM_API_KEY` (Steam library import + achievements)
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
