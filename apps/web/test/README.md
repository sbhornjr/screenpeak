# Test suite

Runner: [Vitest](https://vitest.dev). Run with:

```bash
npm test          # one-off (vitest run)
npm run test:watch
```

Config lives in `vitest.config.mts` at the repo root. Node is the default
environment; DOM specs opt in per-file with a `// @vitest-environment jsdom`
docblock. `server-only` is aliased to an empty stub (`test/stubs/server-only.ts`)
so server modules (`lib/db.ts`, loaders) can be imported in tests; the Next
build still enforces the real guard.

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
| `lib/loaders/game-page.test.ts` | `loadGamePage` | Unknown slug → `null` with no other queries; signed out → `viewer: null` and no viewer queries run; signed in → viewer block from the viewer's own rows (private lists included), list membership as an array, lists narrowed to `{ id, name, game_count }`, `defaultListPrivacy` defaulting to `true`, `hours_played` numeric string → number, nullable library columns normalised; `game` has exactly the contract's fields (no `steam_appid`); result survives a JSON round trip. `lib/queries/*` mocked |
| `lib/game-reviews-query.test.ts` | `parseGameReviewsQuery`, `parseGameReviewsQueryLenient` | Strict (API): defaults (page 1, 10, date, desc), URL-string coercion, `pageSize` ≤ 100, and 400-worthy values (`0`, `1.5`, `abc`, `101`, unknown sort/order) rejected naming the param. Lenient (web page): per-field fallback |
| `lib/queries.review.test.ts` | `getGameReviewsForPage` | Returns exactly the `GameReviewsPage` shape (`reviews`, `total`, `totalPages`; rounding up; empty game); page → `LIMIT`/`OFFSET`; viewer's own review excluded from page and count; total ordering for stable paging (rating → `updated_at` → id; date → id); throws on a DB error. `db` mocked, SQL fragments rendered with Drizzle's `PgDialect` |
| `api/games-slug-reviews.test.ts` | `GET /api/v1/games/[slug]/reviews` | Defaults on a bare request; parsed query + viewer id reach the loader; `private, no-store`; bad param → 400 `invalid_request` before any lookup; unknown slug → 404; bad bearer → 401; a DB error → 500 `internal` (detail not leaked). Auth and both queries mocked; real query parser |
| `api/games-slug.test.ts` | `GET /api/v1/games/[slug]` | Loader data as JSON (signed out → `viewer` null; signed in → viewer id passed); `Cache-Control: private, no-store`; unknown slug → 404 `not_found` error shape; a bad bearer → 401 before the loader runs. Auth + loader mocked |
| `lib/auth.test.ts` | `getOptionalUser`, `requireUser` | Bearer valid / expired (403 `bad_jwt`) / empty / deleted-user → `{ id, email }` or 401 `invalid_token`; an invalid bearer never falls back to a valid cookie (fails closed); no bearer (or a non-Bearer scheme) → cookie session, else 401 `unauthenticated`; `getOptionalUser` returns `null` when signed out but still rejects a bad token; an Auth outage (`AuthRetryableFetchError`) is 503 `auth_unavailable` on every path. `next/headers` and both Supabase clients mocked; real supabase-js error classes |
| `lib/api.test.ts` | `apiError`, `withAuth` | `{ error: { code, message } }` body; handler + route context passed through; `UnauthenticatedError` → 401 with `WWW-Authenticate: Bearer` / `Bearer error="invalid_token"`; `AuthUnavailableError` → 503 + `Retry-After`; any `ApiError` rendered as-is; unexpected errors → generic 500 `internal` with the detail logged, never in the body |
| `lib/supabase-logging.test.ts` | `createLoggingFetch` | Response passed through with body still readable (uses `.clone()`); error line on non-ok; request-body redaction; oversized-body truncation; network errors rethrown after logging |
| `scripts/igdb-audit.test.ts` / `scripts/audit-igdb-cli.test.ts` | Read-only IGDB audit | Exact/ambiguous/missing mapping, pagination, metadata failures, main-game filtering, token refresh/backoff, supplied image URL validation, and real CLI argument handling without credentials |
| `scripts/inventory-igdb-baseline-cli.test.ts` | Read-only database inventory CLI | Help without credentials, explicit missing-credential error, and rejection of private exports inside the repository |
| `lib/igdb/*.test.ts` | Production IGDB adapter | Token single-flight/expiry/401; retries/timeouts/cooldowns; fail-closed budget; lookup references, paging, safe queries, metadata/image normalization and pre-1970 dates |
| `integration/igdb-budget.integration.ts` (separate config) | Real Postgres request budget | Explicit disposable TEST_DATABASE_URL; cross-connection and cross-process rate coordination, active cap, expired leases and browser-role denial |
| `lib/catalog/upsert.test.ts` | Catalogue boundary | Required complete snapshots, valid IDs/dates/URLs, unique taxonomy IDs, and unsuffixed local slugs |
| `lib/catalog/cutover.test.ts` | Reset/seed policy | Local-only database URLs, rating-count ranking, shared Steam ids removed before write, 401/429 never a negative-cache decision, stable reset checksums |
| `integration/catalog-migration.integration.ts` (separate config) | Real Postgres catalogue | Preparation chain, concurrent writes, relation replacement, rollback, stale snapshots, unsuffixed and colliding slugs (including the `igdb-<id>` and `<slug>-igdb-<id>` fallbacks), missing provider timestamps, shared Steam ids, 401/429 cache refusal, grant revocation, and guarded cleanup |
| `integration/catalog-reset.integration.ts` (separate config) | Migration journal and catalogue reset | Baseline stamp before 0003/0004, empty-database chain, duplicate-slug abort, seed without clearing users, dry-run, rollback, stale manifest, replay refusal, and in-database backup restore |
| `lib/rawg.test.ts` | `importGameFromSteam` | The 4-strategy Steam→RAWG name matcher: exact, roman-vs-arabic sequels, diacritics, `(YYYY)` suffix on either side; `null` + no write when unmatched |
| `lib/steam.test.ts` | `getOwnedGames`, `getPlayerAchievementCompletion`, `getFullyCompletedAppids` | Public-profile mapping; hidden-details → `undefined` (not zero); throw/log on non-ok owned-games; achievement completion truth table; errors swallowed to `false`; concurrent 100%-set collection |
| `lib/loadout.test.ts` | `generateLoadoutIdentity` | Returns model text on success; degrades to `''` + logs on API failure; `''` for non-text content blocks |
| `lib/queries.game.test.ts` | `getGameTaxonomy`, `getDistinctEsrbRatings`, `getDeveloperNameMap` | Embedded-row flattening + missing sections; de-dupe/drop-null/sort; first-wins map with string-normalised keys; error → empty map + log |
| `components/Pagination.test.tsx` | `<Pagination>` | Page-window math (fixed-width run near edges, ellipses, `<= 7` shows all); `aria-current`; disabled arrows; href preserves params |
| `components/DistributionChart.test.tsx` | `<DistributionChart>` | One row per bucket; `count · pct%` vs `0`; singular/plural caption |
| `components/StatGrid.test.tsx` | `<StatGrid>` | One cell per stat; value + label rendered; caller `className` appended |
| `components/StatCompare.test.tsx` | `<StatCompare>` | Exactly You and Community, both /10; signed-out, unrated, no ratings, one rating, a gap, and a personal score with a missing aggregate |
| `lib/hero-game.test.ts` | `selectHeroGame` | At least three ratings, then community average, then id; a missing or zero average is not a score |
| `lib/game-catalog-sort.test.ts` | `parseCatalogSort`, `parseCatalogSortLenient`, `defaultOrder` | Strict rejection of a Metacritic sort; lenient fallback to name ascending; non-name keys default to descending |
| `components/CatalogSortFilters.test.tsx` | `GameFilters`, `LibraryFilters` | Changing the sort key from the default name ascending submits descending for a score or date sort |
| `integration/catalog-scores.integration.ts` (separate config) | Real Postgres score RPCs | `0006` keeps `metacritic_score`, drops default-privilege grants, sets `search_path`, orders equal averages by rating count, and hides private libraries and private lists from the feed |
| `lib/catalog/steam-import.test.ts` | `resolveSteamBatch`, library collapse | Stored mappings, one game for several Steam apps, miss and ambiguous cache, 401/429/5xx/timeout not cached, demo 247750 rejected, expansions kept, shared and foreign ids, name collision, hours summed once |
| `lib/catalog/steam-import-actions.test.ts` | Steam import server actions | Signed-out rejection, posted user id and app ids ignored, invalid input returned as a visible error |
| `components/SteamLinkGamesSection.test.tsx` | Steam import preview | Hours field, unmatched-app count, retry after a provider failure, no match request when nothing is pending |
| `integration/steam-import.integration.ts` (separate config) | Real Postgres Steam import | Two app ids one game, second sync skips IGDB, 200-only cache, demo not stored, expansion stored, shared id dropped, foreign id does not block, hours not inflated, `metacritic_score` still present |

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
