# ScreenPeak

**Screen-peeking at what your friends play.** ScreenPeak is a gaming-profile web
app: track your library, rate and review what you've played, build lists, follow
other players, and get an AI-written "Loadout" that describes who you are as a
gamer.

The defining idea is the **three-source rating** — every game carries up to three
independent scores shown side by side like players sharing a split screen: the
critics' verdict (Metacritic), the ScreenPeak community average, and yours.

> The repo directory is historically named `ng-plus`. The product was renamed
> from **NG+** to **ScreenPeak** over a trademark conflict. Some internal
> identifiers keep the old name on purpose — the DB column `ngplus_rating`, the
> RPC field `avg_ngplus_rating`, and the sort key `ngplus_rating`. These are
> wiring, never surfaced in the UI; renaming them needs a DB migration.

## Tech stack

| Area | Choice |
|------|--------|
| Framework | Next.js 16 (App Router, React 19, Server Components) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 (config-less, `@import "tailwindcss"` + CSS custom properties) |
| Backend | Supabase (Postgres, Auth, Storage) via `@supabase/ssr` |
| AI | Anthropic SDK (`@anthropic-ai/sdk`) — Loadout identity text |
| Charts | Recharts |
| Validation | Zod |
| Auth (Steam) | `openid` (Steam OpenID 2.0) |
| Tests | Vitest + Testing Library |
| Lint | ESLint (`eslint-config-next`, core-web-vitals + TypeScript) |

## Getting started

### Prerequisites

- Node.js 20+ (developed on Node 24)
- A Supabase project (Postgres + Auth + Storage)
- API keys for RAWG, Anthropic, and Steam (see below)

### Environment

Create `.env.local` in the project root (gitignored):

```bash
# Supabase — client-side (public)
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>

# Supabase — server-only secret (admin client: seed script, account deletion)
SUPABASE_SECRET_KEY=<service-role-key>

# Absolute site URL — used as metadataBase and for OG tags (optional in dev,
# defaults to http://localhost:3000)
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# External APIs
RAWG_API_KEY=<rawg-key>          # game data — seed script
ANTHROPIC_API_KEY=<anthropic-key> # Loadout identity generation
STEAM_API_KEY=<steam-web-api-key> # Steam library import + achievements
```

### Install & run

```bash
npm install
npm run dev      # dev server on http://localhost:3000
```

### Seed game data

The `games` table is populated from the RAWG API. This needs
`RAWG_API_KEY` and `SUPABASE_SECRET_KEY` in `.env.local`:

```bash
npm run seed     # fetches top-rated games from RAWG and upserts them
```

`scripts/seed-games.ts` skips games already in the DB, so it's safe to re-run
and resumes after a crash.

## Scripts

```bash
npm run dev         # Next.js dev server
npm run build       # production build
npm run start       # serve the production build
npm run lint        # ESLint
npm run seed        # seed games from RAWG (needs RAWG_API_KEY + SUPABASE_SECRET_KEY)
npm test            # run the Vitest suite once
npm run test:watch  # Vitest in watch mode
npx tsc --noEmit    # type-check (no dedicated script)
```

## Project structure

```
app/                     Next.js App Router
  page.tsx               landing (logged out) / activity feed (logged in)
  layout.tsx             root layout — fonts, NavBar, UserProvider, +1 layer
  globals.css            design tokens (CSS custom properties) + the one keyframe
  explore/               discovery — trending games, lists, recommendations
  games/                 game browse + filters
  games/[slug]/          game detail — three scores, reviews, screenshots
  user/[username]/        profile
    library/             the user's tracked games
    lists/  lists/[listId]/  user lists + list detail
    loadout/             AI "Loadout" identity page
    ratings_reviews/     the user's ratings & reviews
  settings/              account settings (email, password, username, privacy, Steam)
  steamlink/             Steam library import flow
  auth/confirm/          landing point for every Supabase auth email link
  auth/update-password/  password-reset form
  api/
    loadout/             POST — generate the Loadout paragraph on demand
    steam/link/          GET  — start Steam OpenID sign-in
    steam/callback/      GET  — verify Steam OpenID, link the account
    delete-account/      DELETE — wipe the signed-in user (admin client)
  components/            UI components by domain: user, game, library, lists, feed, settings, util
  feed-actions.ts        server action — paginate the activity feed

lib/
  supabase-*.ts          three Supabase clients (see below)
  supabase-logging.ts    logging fetch wrapper for Supabase calls
  loadout.ts             build Loadout input data + call Anthropic
  logger.ts              structured JSON logger with sensitive-key redaction
  plus1.ts               fire the "+1" tic event (signature interaction)
  titles.ts              compute selectable profile titles from a user's stats
  rawg.ts                RAWG fetch + game upsert; Steam→RAWG name matcher
  steam.ts               Steam Web API — owned games, achievement completion
  steam-openid.ts        Steam OpenID 2.0 relying-party helpers
  schemas.ts             shared Zod schemas (forms + query-layer input checks)
  queries/               all DB access, grouped by domain
                         (user, game, library, list, review, feed, explore, stats, steam)

scripts/
  seed-games.ts          bulk-seed games from RAWG
  inspect-rawg.ts        ad-hoc RAWG response inspection

types/                   shared TypeScript types, mirroring lib/queries domains
test/                    Vitest characterization suite (see test/README.md)
```

Path alias: `@/*` maps to the project root. Single package — no monorepo.

## Architecture notes

### Supabase clients

Three clients exist for three contexts — **do not mix them**:

| File | Use in | Import |
|------|--------|--------|
| `lib/supabase-server.ts` | Server Components / Route Handlers | `import { createClient } from '@/lib/supabase-server'` — **async**, `await createClient()` |
| `lib/supabase-browser.ts` | Client Components (`@supabase/ssr`) | `import { createClient } from '@/lib/supabase-browser'` — sync |
| `lib/supabase.ts` | Browser only — raw `supabase-js` with debug logging | `import { supabase } from '@/lib/supabase'` |

The admin client (service-role key) is constructed inline where needed
(`app/api/delete-account/route.ts`, `scripts/seed-games.ts`) and never used from
the browser.

### Auth & session refresh

`proxy.ts` contains a `proxy()` function that refreshes the Supabase session
from cookies on each request, plus a `config.matcher`. It is **not** currently
wired as `middleware.ts`, so it does not run automatically — verify the wiring
before relying on or modifying it.

Supabase auth email links (signup confirmation, password recovery, email change)
all land on `app/auth/confirm/route.ts`, which handles both the custom-template
(`token_hash` + `type`) and default-template (`code`) link formats.

### External APIs

- **RAWG** — game catalog source. Used by `scripts/seed-games.ts` via `lib/rawg.ts`.
- **Anthropic** — generates the Loadout identity paragraph in `lib/loadout.ts`
  (model `claude-sonnet-4-6`, `max_tokens: 200`). Failures degrade gracefully to
  an empty string; the paragraph is a bonus, not required page content. Rate
  limited to one generation per user per minute in `app/api/loadout/route.ts`.
- **Steam Web API** — owned games and achievement completion (`lib/steam.ts`),
  behind a Steam OpenID 2.0 sign-in (`lib/steam-openid.ts`). Powers the
  `/steamlink` library-import flow.
- **Supabase Storage** — user avatars and game images. Remote image patterns
  (`next.config.ts`): `media.rawg.io` and `*.supabase.co/storage/v1/object/public/**`.

### Security headers

`next.config.ts` sets HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options`,
`Referrer-Policy`, a restrictive `Permissions-Policy`, and
`Content-Security-Policy: frame-ancestors 'none'` on every route.

### Logging

`lib/logger.ts` emits one JSON line per event (`time`, `level`, `scope`,
`message`, redacted meta). Keys matching `password|token|secret|apikey|api_key|
authorization` are recursively replaced with `[REDACTED]` before anything reaches
the console. `debug` is silenced in production; `warn`/`error` always fire.

## Design system

Full reference: **`DESIGN.md`**. In short — a "split screen" motif: cool-graphite
dark ground, one electron-beam cyan accent treated as phosphor light, and a 2px
vertical cyan "seam" as the recurring structural marker.

- All colour, type, and spacing are CSS custom properties in `app/globals.css`.
  Reference them as Tailwind arbitrary properties — `bg-(--color-bg)`,
  `text-(--color-text)`, `border-(--color-border)`. **Never hardcode hex.**
- Fonts (set in `app/layout.tsx`): Chakra Petch (`--font-display`, headings),
  IBM Plex Sans (`--font-body`), IBM Plex Mono (`--font-mono`, tracked-uppercase
  labels, datestamps, numeric data).
- Reuse the primitives in `app/components/util/` — `Eyebrow`, `SectionHead`,
  `Wordmark`, `EmptyState`, `StatGrid`, `DistributionChart`, `Pagination`,
  `Avatar`, `Modal` — rather than re-rolling markup.
- The **+1 tic** (`lib/plus1.ts` → `Plus1Layer`) floats a "+1 LABEL" chip up the
  screen on a first-time durable write (SAVED, COMPLETED, RATED, LISTED, …). Fire
  it only for new entries to the user's own save file — never on edits, removals,
  or other people's activity. Event: `screenpeak:plus1`; CSS class: `sp-plus1`.

## Testing

Vitest characterization suite in `test/` — it pins the *current* observable
behaviour of the project's logic so refactors have a safety net. Tests sit at
public seams (exported functions, rendered components); the only mocks are true
system boundaries (`fetch` to RAWG/Steam/Anthropic, and the Supabase client).

Node is the default environment; DOM specs opt in per file with a
`// @vitest-environment jsdom` docblock. Config: `vitest.config.mts`. See
`test/README.md` for the full coverage table and what's deliberately excluded
(thin query wrappers, Server Components, route handlers, `proxy.ts`, scripts).

```bash
npm test
npm run test:watch
```

## Deployment

Standard Next.js. `npm run build` then `npm run start`, or deploy to any
platform that supports Next.js 16. All environment variables above must be set in
the deployment environment; set `NEXT_PUBLIC_SITE_URL` to the real origin so
metadata and OG tags resolve correctly.
