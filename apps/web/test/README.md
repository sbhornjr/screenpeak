# Test suite

Runner: [Vitest](https://vitest.dev). Run with:

```bash
npm test          # one-off (vitest run)
npm run test:watch
```

Config lives in `vitest.config.mts` at the repo root. Node is the default
environment; DOM specs opt in per-file with a `// @vitest-environment jsdom`
docblock.

## What is covered, and why

This is a **characterization suite** — it pins down the *current* observable
behaviour of the project's logic so refactors have a safety net. Tests sit at
public seams (exported functions, rendered components), never against internals.
The only things mocked are true system boundaries: `fetch` (outbound HTTP to
RAWG / Steam / Anthropic) and the Supabase client (DB). No internal collaborator
is mocked — logging behaviour is asserted through real `console` spies.

| Spec | Seam | Behaviour locked in |
|------|------|---------------------|
| `lib/logger.test.ts` | `redact`, `logger` | Recursive redaction of sensitive keys (case-insensitive, substring, nested, arrays); level → console routing; meta redaction; `debug` silenced in production |
| `lib/titles.test.ts` | `getTitles` | Fixed genre titles always present; games/devs mapped to `#1 <name> Fan`; ordering |
| `lib/dates.test.ts` | `parseDbTimestamp` | Normalizes postgres's space-separated, 2-digit-offset `timestamptz` text to ISO-8601 before parsing; ISO input passed through; no double `:00` when an offset already has a colon; positive/negative offset math |
| `shared/tokens.test.ts` | `@screenpeak/shared/tokens` vs `app/globals.css` | Every `--color-*` in globals.css has a camelCased twin in `tokens.colors` with the same value (resolving `var()` aliases and the `color-mix()` highlight), and tokens has no extra colours; shared `tierColor` returns the same tier as `lib/rating-tier.ts` at every threshold on /10 and /100. Also proves the web → `packages/shared` wiring |
| `lib/safe-redirect.test.ts` | `safeNextPath` | `/auth/confirm`'s `next` param is reduced to a same-origin path: `/auth/update-password` and query/hash pass through; missing/empty → `/`; userinfo (`@evil.com`), subdomain (`.evil.com`), absolute, protocol-relative (`//`, `/\`), tab-normalised and `javascript:` targets all fall back to `/` |
| `lib/plus1.test.ts` / `plus1.ssr.test.ts` | `plus1` | Dispatches `screenpeak:plus1` with `{label, n}` (default `n=1`); no-ops when `window` is undefined |
| `lib/schemas.test.ts` | `emailSchema`, `passwordSchema`, `usernameSchema`, `ratingReviewSchema`, `listFieldsSchema`, `bioSchema`, `selectedTitleSchema`, `favoriteGameIdsSchema`, `privacyTypeSchema`, `parseOrError` | Trim/normalise; length + charset bounds (username 3–20, review ≤5000, list name ≤80, bio ≤500); rating coerced to int 1–10; empty review is valid; ≤5 favourite ids; fixed privacy section names; `parseOrError` returns first-issue message |
| `lib/auth.test.ts` | `getOptionalUser`, `requireUser` | Bearer valid / expired (403 `bad_jwt`) / empty / deleted-user → `{ id, email }` or 401 `invalid_token`; an invalid bearer never falls back to a valid cookie (fails closed); no bearer (or a non-Bearer scheme) → cookie session, else 401 `unauthenticated`; `getOptionalUser` returns `null` when signed out but still rejects a bad token; an Auth outage (`AuthRetryableFetchError`) is 503 `auth_unavailable` on every path. `next/headers` and both Supabase clients mocked; real supabase-js error classes |
| `lib/api.test.ts` | `apiError`, `withAuth` | `{ error: { code, message } }` body; handler + route context passed through; `UnauthenticatedError` → 401 with `WWW-Authenticate: Bearer` / `Bearer error="invalid_token"`; `AuthUnavailableError` → 503 + `Retry-After`; any `ApiError` rendered as-is; unexpected errors → generic 500 `internal` with the detail logged, never in the body |
| `lib/supabase-logging.test.ts` | `createLoggingFetch` | Response passed through with body still readable (uses `.clone()`); error line on non-ok; request-body redaction; oversized-body truncation; network errors rethrown after logging |
| `lib/rawg.test.ts` | `importGameFromSteam` | The 4-strategy Steam→RAWG name matcher: exact, roman-vs-arabic sequels, diacritics, `(YYYY)` suffix on either side; `null` + no write when unmatched |
| `lib/steam.test.ts` | `getOwnedGames`, `getPlayerAchievementCompletion`, `getFullyCompletedAppids` | Public-profile mapping; hidden-details → `undefined` (not zero); throw/log on non-ok owned-games; achievement completion truth table; errors swallowed to `false`; concurrent 100%-set collection |
| `lib/loadout.test.ts` | `generateLoadoutIdentity` | Returns model text on success; degrades to `''` + logs on API failure; `''` for non-text content blocks |
| `lib/queries.game.test.ts` | `getGameTaxonomy`, `getDistinctEsrbRatings`, `getDeveloperNameMap` | Embedded-row flattening + missing sections; de-dupe/drop-null/sort; first-wins map with string-normalised keys; error → empty map + log |
| `components/Pagination.test.tsx` | `<Pagination>` | Page-window math (fixed-width run near edges, ellipses, `<= 7` shows all); `aria-current`; disabled arrows; href preserves params |
| `components/DistributionChart.test.tsx` | `<DistributionChart>` | One row per bucket; `count · pct%` vs `0`; singular/plural caption |
| `components/StatGrid.test.tsx` | `<StatGrid>` | One cell per stat; value + label rendered; caller `className` appended |

`smoke.test.ts` is not a characterization test — it just confirms the toolchain
(TS compiles, the `@/*` alias resolves, `expect` works).

## Not covered (deliberately)

- Thin `lib/queries/*` wrappers that only forward args to `supabase.rpc()` /
  `.from()` — testing them would assert "it called the client", which breaks on
  any refactor without catching real bugs.
- Server Components, route handlers, `proxy.ts`, and `feed-actions.ts` — these
  are integration/E2E territory (they compose auth + DB + framework) and need a
  running stack, not unit mocks.
- `scripts/` (`seed-games.ts`, `inspect-rawg.ts`) — one-shot operational
  scripts; their reusable core (`seedGame`, `importGameFromSteam`) is exercised
  via `lib/rawg.test.ts`.
