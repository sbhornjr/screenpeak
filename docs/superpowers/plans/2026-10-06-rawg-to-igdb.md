# RAWG to IGDB Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task by task. Do not start implementation as part of the planning request. Steps use checkbox syntax for tracking.

**Goal:** Make IGDB ScreenPeak's active catalogue provider before further mobile/API feature work, rebuilding the test catalogue from IGDB, discarding game-linked test data while retaining accounts/settings/social data, and replacing all active RAWG ingestion.

**Architecture:** Rebuild games, genres, platforms, developers and publishers entirely from IGDB. Back up existing data, then clear libraries, ratings/reviews, list memberships and favourites. Keep accounts, settings, list definitions, follows, likes and Steam links. No old-to-new game mapping or linked-row restoration is required; old URLs are not a compatibility requirement. Add an IGDB adapter, transactional catalogue writer and external ID mappings; web and mobile continue reading the local database. The confirmed score design is You / Community, both out of 10, with all three-score branding removed.

**Tech stack:** Existing Next.js 16 App Router, TypeScript, Drizzle/Postgres on Supabase, Vitest, Expo SDK 57, and shared TypeScript contracts. Use native fetch; no IGDB SDK or new hosting service is required by this plan.

**Design basis:** User request and pasted Grok audit, checked against this checkout at cdd8e19 on 2026-10-06 (including the pre-existing uncommitted mobile-plan edits). The design brief below is part of this plan. Grok's full report at /workspace/lens/screenpeak/rawg-to-igdb-field-audit.md was not available locally. The original planning pass performed no live operations. Task 1 subsequently completed read-only database inventory and credentialed IGDB audits on 2026-10-08; no migration/reset has occurred.

**Status:** Task 1 complete on 2026-10-08 (inventory, private export, measured coverage, 24 manual checks and explicit edge probes). The user confirmed a simpler reset: discard all catalogue and game-linked test data; retain accounts, settings and social data. Remove salvage/reconciliation work from later tasks. You / Community remains the score design. Tasks 2–4 are complete and merged. Task 5 (two-score contract, UI, and journaled RPC rewrite) is complete. Task 6 (IGDB Steam import) is complete on 2026-10-10. Task 7 (imagery, attribution, sitemap) is complete on 2026-10-10; `app/sitemap.ts` no longer reads `games.metacritic_score`. Task 8's code is complete on 2026-10-10: RAWG runtime and the legacy seed are gone, and `0007_igdb_catalog_cleanup.sql` is journaled. It drops `rawg_id`, `metacritic_score`, and `games.steam_appid` after the reset. The hosted reset has not been run. The owner follows `docs/igdb-cutover-checklist.md`. Every migration so far has been applied only to disposable local Postgres, not the development Supabase database.

**Owner rulings 2026-10-10:** Nothing is shipped, so remaining tasks follow code dependencies only — no deploy window, compatibility release, or dual-running contracts. Task 4 starts by recording which migrations have run (the development database still has no migration journal) and rehearses that on a database copy before 0003/0004. Task 7's sitemap fix lands before `metacritic_score` is dropped. Shared or ambiguous Steam app IDs are removed before `writeCatalogGame`, which still throws if one is passed through. Taxonomy slugs are unique. Game slugs no longer always end in `-igdb-<id>`. Cutover includes a top-N IGDB seed. A written IGDB commercial partnership is required before public launch.

## Priority and boundaries

This migration is the next implementation milestone, ahead of the unfinished feature work in build-plan.md and other chats. Resume that work after the cutover acceptance checklist passes. This document records sequencing; it does not pause or message other chats.

Branch workflow: each migration task branches from and merges into `igdb-integration`; only the completed migration merges to `main`. Task 2 branch: `codex/igdb-task-2`. The integration branch includes Task 1’s existing monorepo/mobile ancestry.

The root build-plan.md already had uncommitted edits when this audit began. Preserve those edits. Add only a migration prerequisite notice; do not rewrite its mobile roadmap.

Included:
- Credentials, provider adapter, durable rate coordination, data mapping and imports.
- Fresh IGDB catalogue/taxonomy, seed tooling, and an explicit reset of game-linked test data.
- Steam external-ID matching, bounded retries, negative caching and multiple app IDs.
- Removal of Metacritic from the active UI and ranking, removal of all three-score branding, and a two-score game-page layout (You / Community).
- Web/mobile cover handling, OG imagery, attribution, sitemap correction.
- Coordinated prelaunch contract changes, tests, local cutover, backup recovery and documentation.

Separate follow-up:
- Searching IGDB from the UI when local search has no match, and explicitly adding a selected result.
- Full-catalogue mirroring, automated freshness scheduling, webhooks, videos and franchise UI.
- Unrelated mobile screens, auth redesign or recommendation redesign.
- A new background-job platform. Bounded, resumable Steam processing suffices initially.

Local search will still search the local catalogue after this migration. Broader seeding improves coverage; it does not solve all non-Steam missing-game requests. Track that limitation explicitly.

## Verified findings and corrections to Grok

| Finding | Assessment and implication |
| --- | --- |
| RAWG calls are concentrated in lib/rawg.ts | Confirmed. Both scripts/seed-games.ts and app/steamlink/page.tsx use it. Runtime imports need provider credentials. |
| Provider IDs are separate from user references | Confirmed, but game rows are not decoupled: deleting games cascades into library_entries, ratings_reviews and list_games. users.favorite_game_ids is an array needing explicit cleanup. Back up, then clear these rows/arrays under the confirmed reset scope. |
| Five tables require rawg_id | Confirmed: games, genres, platforms, developers and publishers. Rebuild their content with actual IGDB IDs, then remove RAWG columns; never relabel RAWG numeric values as IGDB IDs. |
| A fresh catalogue is appropriate because nothing is deployed | Now confirmed directly by the user: all data is personal test data and a fresh catalogue is preferred. This is a catalogue rebuild, not a reset of Supabase Auth or unrelated account/social data. |
| Game URLs have to change | They do not technically have to, but preserving them is unnecessary for this unshipped app. Generate fresh unique slugs; no redirect system is required. |
| Metacritic is only a badge/sort concern | Incomplete. getHeroGame selects the homepage and default OG feature by critic/community disagreement. It needs a replacement selection rule and copy. |
| The Following score already exists | Only partially. get_follow_recommendations includes completed games rated at least 7. It cannot supply an unbiased average of all followed users' ratings. |
| Metacritic is absent from AI inputs | Confirmed for lib/loadout.ts. Taxonomy changes still alter genre/developer aggregates and generated prose. |
| 300 Steam titles take three requests | Not a verified bound. Mapping pagination, detail hydration, misses, retries and fallback searches add calls. Measure both mapping and end-to-end import. |
| Images become a few-line change | Portrait covers help, but inspect all web/mobile cards, pickers, metadata and OG routes. Keep landscape assets separate. |
| Sitemap references a missing column | Confirmed against the checked-in schema: games.updated_at is absent. Live schema/runtime outcome was not tested. Current query also silently ignores errors. |

## Design brief and decisions

### Confirmed decisions

1. **Fresh catalogue and game-linked data; keep accounts/settings/social data (confirmed 2026-10-08).** Rebuild all five RAWG-backed tables and taxonomy joins from IGDB. Clear library entries, ratings/reviews, list memberships and favourites after taking a backup. Preserve Auth, profiles, settings, list definitions, follows, likes, Steam links and authored bios. No salvage map, game UUID reuse, review/library merging or old-row restoration is required.
2. **Confirmed: You / Community, both out of 10.** Remove Metacritic and all three-score branding. Rework the game-page score panel around the viewer's own rating and the ScreenPeak community average. IGDB supplies metadata, not a replacement score; do not add Following or IGDB critic/user scores.
3. **Local reads remain available during a provider outage.** IGDB is contacted by ingestion, not ordinary game page rendering.
4. **Prepare, export, rebuild, clean up.** Use temporary migration columns only as needed while implementing. The completed schema has required unique IGDB IDs in the five catalogue tables, no rawg_id columns, no metacritic_score column, and no obsolete games.steam_appid column. Recovery uses the pre-reset backup, not legacy production code paths.
5. **Coordinate the unshipped API changes.** Remove RAWG/Metacritic fields from shared types, API responses, SQL results and all web/mobile callers together. Add igdb_id and image metadata explicitly. No v2 endpoint or backwards-compatibility shim is needed for this prelaunch migration.

### Branding and game-page direction

Use a compact two-column score panel: **You** first, **Community** second, both on the same /10 scale. Keep the cyan emphasis on You and the community rating count alongside its average. Keep the existing rating/review action adjacent to the panel and preserve the cover, game metadata and review sections; this is a focused layout rework.

Remove the three-score pitch from the homepage hero, fallback copy, share-image text/alt text, metadata, component comments and active product/design documentation. Do not replace it with a new numerical slogan. Suggested homepage headline: "Your games. Your take." Supporting copy: "Track what you play, rate your games, and see how your take compares with the community."

The ScreenPeak wordmark, cyan seam and screen-sharing visual motif can remain; remove their dependence on three players or a critic score. Do not introduce a Following score, critic replacement, or unrelated redesign.

### Prelaunch contract reset

The user confirms there are no shipped or deployed clients. Change the existing v1 contract and its consumers together: remove rawg_id and Metacritic fields, add required igdb_id to game detail, and retain only You/Community scoring data. There is no need for a v2 API, deprecated score fields, dual-provider rows or a compatibility release. Update shared types, explicit selects, SQL functions, loaders, fixtures and app callers in the same implementation.

Do not reinterpret old IDs or copy scores into fields with different meanings. Historical migration files remain intact; new migrations bring both a fresh database and the existing test database to the same final schema.

### Catalogue reset policy

Deleting games cascades into library_entries, ratings_reviews and list_games. users.favorite_game_ids is a UUID array requiring explicit cleanup. The user now explicitly prefers discarding this test data over preserving it.

- Keep Supabase Auth, users, follows, lists (definitions/IDs/privacy), list likes, Steam account links and account settings.
- Take a restorable schema/data backup outside git before deletion. Task 1's public-schema inventory export is not this complete backup.
- An empty catalogue after reset is valid; Steam import can populate it. If optional seed records are selected for cutover, stage and validate them before any destructive step. Do not carry forward old RAWG records, mappings or UUIDs.
- Clear library_entries, ratings_reviews and list_games; clear every favourite array. Existing lists remain empty. Show current loss counts before apply; Task 1 measured 420 library entries, 35 ratings/reviews, 29 memberships and two favourites.
- Rebuild all five catalogue tables and joins with fresh local UUIDs and IGDB IDs. No old-to-new crosswalk, salvage search or linked-row restoration.
- Clear generated loadout_identity/loadout_identity_at. Preserve authored profile_loadout_bio, user_bio and selected_title; a stale selected title is not silently rewritten.
- Generate fresh game slugs. No old-URL compatibility or redirect layer is required.
- Default the reset command to dry-run. Apply only to the identified development database using a matching snapshot/staged manifest, with app/writers stopped. Use an atomic transaction and prevent replay of a completed run. Normal seed/import commands must never reset user data.
- Full recovery restores the pre-reset database as a unit; it is separate from the removed per-game salvage feature. No reset occurs in Task 1.

### Score behavior

- You = the authenticated viewer's existing ScreenPeak rating, out of 10. Community = the existing ScreenPeak community average, out of 10, with its rating count. Keep the current aggregation semantics, including the viewer's rating when present.
- Reuse the existing review and rating-stat data. No Following query, new social aggregate, viewer.followingRating field or external score is needed.
- Signed out: viewer remains null; You displays an em dash and a sign-in-to-rate prompt. Never borrow another user's rating or put viewer-specific data into public caches.
- Signed in but unrated: You displays an em dash and the existing rate/review action. Community with no ratings displays an em dash and "No ratings yet," never 0/10.
- Show the personal-versus-community gap only when both scores exist, using the same /10 scale. With community only, invite the viewer to add a rating. With a personal score, use "first on the board" only if the actual community count proves this is the first rating; never infer it from missing community data. With neither score, invite the first rating. A lone personal score during inconsistent/missing aggregate data should simply show that score without a gap claim.
- Homepage and public OG image use public data: featured game = most ScreenPeak ratings among games with at least HERO_MIN_RATINGS (currently 3), then community average descending, then UUID. Use a branded, unfeatured fallback when none qualifies. Public share images show the community score/count only; no personalized You column or placeholder third score.
- Keep the two game-page columns usable at narrow widths; align type, spacing and rating-action placement with the existing design tokens. Render the count as supporting text rather than another score.
- Catalogue default becomes name ascending for a useful cold start. Explicit community sort uses average, rating count, name, UUID, with nulls last. The strict API parser rejects removed metacritic_score sorts; the lenient web parser falls back to the new default.

### Provider field policy

| ScreenPeak field | IGDB input / migration rule |
| --- | --- |
| id, slug, created_at | Fresh local game UUIDs, unique slugs and catalogue timestamps. No old game/user-row identity restoration. |
| igdb_id | Positive unique required ID in the final games/genres/platforms/developers/publishers schema. Nullable only during the temporary preparation phase. |
| rawg_id, metacritic_score | Removed from the final live schema and contracts. Old values remain only in the backup, historical migrations and reset report. |
| name, description | IGDB name and summary; optional storyline remains separate/deferred. Treat text as plain text. |
| released | first_release_date converted from Unix seconds in UTC; missing stays null. Do not multiply twice or use local timezone dates. |
| cover_image_url | Validate the supplied cover.url, normalize HTTPS and select the cover rendition; use image_id only as a consistency check. Missing cover gets the existing placeholder. |
| artwork_image_url | Landscape artwork, otherwise screenshot, otherwise null. Public OG falls back to branded art. |
| screenshots | Stable ordered HTTPS URLs, deduplicated. Validate the returned payload before replacing existing values. |
| esrb_rating | Resolve the ESRB organization and rating label from current age-rating tables. Do not accidentally use a PEGI number as ESRB. |
| reddit_url | Matching website type if supplied, otherwise null. |
| genres, platforms | Fresh IGDB entities with fresh local taxonomy UUIDs and rebuilt game joins. |
| developers, publishers | involved_companies.company, separated by developer/publisher flags. One IGDB company may have both roles. |
| updated_at | Local successful catalogue content change timestamp, for sitemap. |
| provider_updated_at, metadata_synced_at | Source modification time and last successful refresh time, respectively. |

Only a complete, validated authoritative payload may replace metadata and relation sets. Distinguish an intentionally absent optional field from a failed/truncated request. On failure, preserve the last good snapshot.

## Global constraints

- All paths below are repository-relative; application @/ imports remain relative to apps/web.
- Follow AGENTS.md: Drizzle for catalogue writes, module-scope db, server-side authorization, and explicit privacy gates.
- Keep provider code out of packages/shared and browser-callable lib/queries/game-search.ts.
- Preserve ngplus_rating and avg_ngplus_rating; this task does not rename them.
- Use repository Drizzle migrations and meta/_journal.json, never edit already-applied migrations.
- Read applicable installed Next.js docs before product code changes; read the matching Expo docs before changing native APIs.
- Keep one pinned React version and the root package-lock.json.
- Existing colors go through tokens; any semantic color rename must change both globals.css and shared tokens.
- No credential values, private Steam libraries or unredacted payload dumps in git or logs.
- No live reset, migration application, or deployment occurs as part of writing this plan.

## External requirements verified 2026-10-06

IGDB uses server-side Twitch app credentials, supports local data storage, limits requests to four per second with eight open requests, and caps result pages at 500. Use current external_game_source references rather than deprecated category enums. Its cover_big rendition is 264×374, so a 3:4 container still crops slightly. The documentation describes free noncommercial use and a commercial partnership process with visible attribution. Confirm the applicable arrangement before public commercial release. [IGDB documentation](https://api-docs.igdb.com/)

Use TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET in the web/server environment. Obtain an app access token with client_credentials, retain expires_in, and request a new token on expiry; there is no user Twitch sign-in flow in this migration. The standalone audit uses URL-encoded client_id, client_secret and grant_type=client_credentials query parameters on the token POST, as requested; it never logs the URL. [Twitch client credentials](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#client-credentials-grant-flow)

## Review focus

1. A reset accidentally deletes retained accounts/social data or replays after new test data is created: verify preserved identities/content, explicit cleared-table counts and committed-run guards. Task 4 tests this.
2. Multiple Steam app IDs resolve to one local game: show/import one library entry and aggregate playtime once. Task 6 tests this.
3. A 401, 429 or malformed response is mistaken for "no match": no negative-cache entry may be written. Tasks 2 and 6 test this.
4. Signed-out, unrated or sparsely rated games show fabricated scores or misleading comparison copy: the two-score panel distinguishes these states and public OG content uses only community data. Task 5 tests this.
5. An IGDB outage blanks already-imported metadata or makes a DB outage look like a 404: preserve provider snapshots and propagate DB errors. Tasks 3, 4 and 7 test this.

## Starter contracts and acceptance examples

These specify seams, not a complete implementation. Extend the fixtures with the cases in each task. Keep provider schema validation in the adapter.

```ts
// apps/web/lib/catalog/types.ts
export type CatalogTaxon = { igdbId: number; name: string; slug: string }
export type CatalogGame = {
  igdbId: number
  name: string
  providerSlug: string
  gameType: number | null
  released: string | null
  description: string | null
  coverImageUrl: string | null
  artworkImageUrl: string | null
  screenshots: string[]
  esrbRating: string | null
  redditUrl: string | null
  providerUpdatedAt: string | null
  genres: CatalogTaxon[]
  platforms: CatalogTaxon[]
  developers: CatalogTaxon[]
  publishers: CatalogTaxon[]
  steamAppIds: number[]
}
```

```ts
// apps/web/test/lib/igdb/normalize.test.ts
import { expect, it } from 'vitest'
import { normalizeIgdbGame } from '@/lib/igdb/normalize'

it('keeps missing images absent and interprets release time as seconds', () => {
  const game = normalizeIgdbGame({
    id: 1, name: 'Example', slug: 'example',
    first_release_date: 86400,
  }, verifiedLookups) // fixture or lookup tables resolved by the provider
  expect(game.released).toBe('1970-01-02')
  expect(game.coverImageUrl).toBeNull()
  expect(game.artworkImageUrl).toBeNull()
  expect(game.screenshots).toEqual([])
})
```

Add this regression to the existing loader suite, which already defines q and its DB-boundary mocks:

```ts
it('does not report a database outage as an unknown game', async () => {
  q.getGameBySlug.mockRejectedValueOnce(new Error('database unavailable'))
  await expect(loadGamePage('example', null)).rejects.toThrow('database unavailable')
})
```

Run real-database acceptance tests against a dedicated TEST_DATABASE_URL. Never reuse DATABASE_POOL_URL implicitly for tests. The test runner must refuse a missing test URL and use isolated fixtures/cleanup; it must not reset a user's database.

## Task 1 — Establish inventory, credentials and a measurable mapping baseline

**Completed 2026-10-08.** Evidence and reproduction commands are in [the runbook](../../igdb-migration-runbook.md). Private baseline artifacts are outside git at ~/screenpeak-igdb-baseline-2026-10-08/. No database mutation/reset occurred.

**Files:** apps/web/scripts/audit-igdb.ts, igdb-audit.ts, inventory-igdb-baseline.ts; associated test/scripts tests; docs/igdb-migration-runbook.md; audit:igdb workspace command.

**Interfaces:** Provider audit accepts { appid, name? } arrays or Steam GetOwnedGames JSON and measures external-ID coverage/metadata separately. Inventory uses DATABASE_POOL_URL in a read-only repeatable-read transaction and exports public data/schema metadata with checksums. It is not a full disaster-recovery backup.

- [x] Inventory catalogue/taxonomy counts, references, slugs, Steam mappings and migration state. Baseline: 502 games, 395 Steam mappings; zero duplicate slugs in all five catalogue tables. No recognized database migration journal exists; reconcile schema/history before migration application.
- [x] Record confirmed fresh catalogue/game-linked-data reset and You / Community decisions, exact database identity in private snapshot, export destination and dry-run loss counts. Retain Auth/accounts/settings/social/list definitions; no game-linked salvage under the user's latest decision.
- [x] Configure Twitch credentials outside source control and verify explicit missing-credential errors. Local game-page rendering has no new credential dependency.
- [x] Run authorized representative library (428 apps), plus explicit demo/DLC/delisted probes and manually reviewed remake/edition/non-ASCII/shared-ID cases. Standalone audit is complete before Task 2; repeat through the production adapter after Task 2.
- [x] Measure external-ID lookup (1,304ms), metadata hydration (14,286ms), total (16,620ms). Name matching was not run. Manually inspect 24 direct mappings; zero ambiguous mappings existed. Demo-to-full-game exception is recorded for Task 6.
- [x] Record 423/428 direct matches (98.83%), five misses, no API/metadata errors, 15 API requests plus OAuth. Accept Hitman's absent Steam link as an unresolved/manual case. Provider association alone does not prove semantic correctness.
- [x] Verify tooling, review changes and commit only audit code/tests and redacted documentation; private inputs/reports stay outside git.

**Exit:** Known catalogue baseline and reproducible live mapping experiment complete. Actual backup/restore rehearsal, reset, application ingestion, and migration-history reconciliation remain in their implementation tasks.

## Task 2 — Build the authenticated, rate-coordinated IGDB adapter

**Completed 2026-10-08:** 33 adapter unit tests, four real-Postgres integration tests (including independent Node processes), and live 428-app audit. 423 exact matches, 421 normalized games, no errors/retries. See runbook for reproduction and migration-application boundaries.

**Create:** apps/web/lib/igdb/{auth,client,schema,normalize}.ts, apps/web/lib/igdb/{http,provider}.ts, apps/web/lib/catalog/types.ts, apps/web/lib/queries/igdb-budget.ts, apps/web/test/lib/igdb/{auth,client,normalize}.test.ts.
**Modify:** apps/web/db/schema.ts and the next available Drizzle migration for private throttle state; apps/web/lib/logger.ts only if secret redaction needs coverage.

**Interfaces:**
- getIgdbToken(): Promise<string>
- igdbRequest<T>(endpoint: string, body: string, schema: ZodType<T>): Promise<T> (server-internal transport; product callers use validated provider query builders)
- normalizeIgdbGame(input: validated provider game, lookups: IgdbLookups): CatalogGame
- CatalogGame is defined by the starter contract below; it is server-only and contains no viewer data. Task 2 creates lib/catalog/types.ts before Task 3 consumes it.

- [x] Add HTTP-boundary tests for cached tokens, expiry skew, simultaneous token requests sharing one refresh, one retry after 401, 429 handling, timeout, non-JSON and invalid schema. Ordinary validation/4xx errors do not retry.
- [x] Add normalizer fixtures for missing cover/date, epoch seconds, dual-role companies, absent taxonomy, ESRB versus PEGI and landscape fallbacks.
- [x] Run the failing tests with npm test -w @screenpeak/web -- test/lib/igdb.
- [x] Implement server-only authentication with a 60-second expiry margin, 10-second request abort, at most three attempts for transient errors, exponential backoff with jitter, and bounded Retry-After handling.
- [x] Coordinate the request budget across web processes and seed scripts sharing the same credentials. Use a private Postgres lease/reservation mechanism: reserve grants 650ms apart with a conservative 350ms local dispatch deadline (including DB round trip), guaranteeing at least 300ms between dispatch windows; cap active leases at four, expire abandoned leases after 15 seconds versus the 10-second HTTP deadline, and never hold a transaction open across HTTP. Reject/retry acquisition if the DB is unavailable; do not bypass the budget. Keep tables inaccessible to anon/authenticated roles.
- [x] Test two independent clients sharing the same budget with a real disposable Postgres instance; assert no rolling second exceeds four starts, no more than four active requests, and abandoned leases recover. Unit tests with one in-memory counter are insufficient.
- [x] Only accept allowlisted endpoints and construct bodies internally. Validate integer IDs; JSON-escape search strings. Never accept raw APICalypse from a client.
- [x] Fetch and validate current lookup tables for source/type/age-rating identifiers. Do not copy deprecated numeric enum meanings into new code.
- [x] Run tests, then the live audit from Task 1. Commit.

**Exit:** Seed/import share one bounded, validated transport. Logs contain status, endpoint and timing without tokens.

**Rulings:** Use the already requested Task 2 branch in the current checkout; preserve unrelated edits. Use an isolated local Postgres 17 cluster because TEST_DATABASE_URL was not configured; never implicitly reuse DATABASE_POOL_URL for tests. Migration 0003 is hand-authored and journaled under repository convention, with private Drizzle schema definitions. Schema-history reconciliation for the existing Supabase DB remains a prerequisite to applying it there. Lookup labels come from live tables (including Subreddit), and historical release timestamps may be negative. Existing standalone Task 1 audit remains independent; do not run its process-local limiter concurrently with production ingestion.

## Task 3 — Prepare IGDB-only catalogue storage and transactional ingestion

**Modify:** apps/web/db/schema.ts, apps/web/db/relations.ts, apps/web/db/migrations/meta/_journal.json.
**Create:** next numbered preparation migration and guarded final cleanup draft (journal with Task 5/8 RPC cleanup); apps/web/lib/catalog/upsert.ts; apps/web/test/lib/catalog/upsert.test.ts; apps/web/test/integration/catalog-migration.test.ts.

- [x] Reconcile the actual schema and absent database migration journals on an isolated copy; do not blindly replay or mark 0000–0002 applied.
- [x] Prepare a temporary unique nullable igdb_id on each of the five catalogue tables and relax rawg_id during the reset transition. The final cleanup migration requires positive unique IGDB IDs and removes rawg_id plus its constraints. Never populate igdb_id by copying a RAWG value.
- [x] Add games.artwork_image_url, provider_slug, provider_updated_at, metadata_synced_at and updated_at. The final catalogue enforces unique game slugs. The first writer always appended `-igdb-<id>`; the Task 3 follow-up below replaces that rule.
- [x] Create game_external_ids with provider, external_id (text), game_id, match_method, verified_at, unique(provider, external_id), and an index on game_id. Retain old games.steam_appid only in the backup; rebuild live mappings from verified IGDB data. Remove the old games.steam_appid column after all readers use this mapping table.
- [x] Create server-only match-cache storage keyed by Steam app ID and matcher version, with status, checked_at and retry_after. Enable RLS and revoke browser mutation access to ingestion-only tables. Keep developers and publishers as separate role tables, both using IGDB company IDs.
- [x] Expose upsertCatalogGame(game: CatalogGame): Promise<{ id: string; slug: string }>. Upsert by igdb_id; allocate a new local UUID on insert. No caller-supplied restoration UUID.
- [x] Fetch/validate outside transactions; write the game, fresh taxonomy and complete relation sets atomically. Recover concurrent inserts through unique provider IDs. Failed imports preserve the last good IGDB snapshot.
- [x] Test repeat imports, transaction rollback, simultaneous upserts, distinct games with identical names and browser write denial.
- [x] Test the preparation migration against a copy of current data. Test final cleanup against an empty/new database and a successfully rebuilt database; it must refuse null/invalid IGDB IDs. Never silently delete unmapped rows inside a schema migration.
- [x] Add private catalog_reset_runs storage with run_id primary key, manifest checksum and committed_at, accessible only to the operational role. Write its completion row in the same reset transaction; Task 4 uses it to reject destructive replay.
- [x] Keep the destructive data-reset operation explicit in Task 4. Schema migrations must not hide a test-data wipe inside an ordinary deployment command.
- [x] Verify final constraints/grants and absence of all five rawg_id columns, games.metacritic_score and games.steam_appid on cleaned fixtures; verify them again on the selected development DB after Task 8's cleanup. Commit.

**Task 3 execution notes (2026-10-09):** Preparation is 0004. Cleanup remains an unjournaled guarded draft until Tasks 5/8 replace RPCs and allocate the final sequence. No live migration/reset or journal stamping occurred. Shared taxonomy freshness uses each entity’s own provider timestamp. See the runbook/report for verified baseline equivalence, preservation rehearsal and file inventory.

**Exit:** Tested preparation and final-schema paths, with the reset kept explicit and no production compatibility layer.

## Task 3 follow-up — Local slugs and unique taxonomy slugs

**Owner ruling 2026-10-10.** Task 4's seed and reset both call `writeCatalogGame`, so this follow-up lands with Task 4 rather than waiting for a later pass. Do not edit 0004; add the taxonomy uniqueness constraint in the next journaled migration and abort if duplicate slugs already exist. Do not rename rows inside that migration.

- [x] Change `catalogSlug()` so the default local slug is the sanitized provider slug with no suffix. On a `games.slug` conflict, append that row's internal `games.id` (the UUID). The suffix does not contain `igdb`. Keep a published local slug when the provider slug later changes.
- [x] Add a unique slug constraint on genres, platforms, developers and publishers. The writer uses the preferred slug when it is free or already owned by that IGDB id. Otherwise it stores `igdb-<igdbId>`, and `${preferred}-igdb-<igdbId>` only if that fallback is also taken.
- [x] Test unsuffixed game slugs, the UUID suffix, taxonomy slug collisions, a missing `providerUpdatedAt` leaving the stored snapshot in place, and a Steam app id shared by two staged games being removed before `writeCatalogGame`. A direct write that still carries a foreign app id continues to throw and roll back.

## Task 4 — Stage a fresh catalogue and reset game-linked test data

**Create:** apps/web/scripts/reset-catalog-to-igdb.ts, apps/web/scripts/inspect-igdb.ts, apps/web/test/integration/catalog-reset.test.ts.
**Modify:** apps/web/scripts/seed-games.ts, apps/web/package.json, docs/igdb-migration-runbook.md.

**Interfaces:** Reset CLI supports --dry-run (default), --apply and an explicit staged manifest path. A committed run must never be replayed. No reconcile module, salvage map, restoreGameId parameter or per-row restoration path. Migration and reset commands take an explicit database env var, accept only a localhost URL whose database name ends in `_test` or `_copy`, and never fall back to `DATABASE_POOL_URL`.

- [x] **Gate — migration tracking, before 0003/0004.** The development database records neither `drizzle.__drizzle_migrations` nor a Supabase migration journal. Add a script that creates Drizzle's `drizzle.__drizzle_migrations` table (`hash` is the SHA-256 of the migration file, `created_at` is the journal `when`). Rehearse on an isolated copy: verify the 0000–0002 baseline (tables, `games.rawg_id` / `metacritic_score` / `steam_appid`, no `igdb_id`, no `igdb_private`, and `get_feed` still contains the 0002 `library_public` check). Record 0000–0002 as already applied without replaying them. Refuse to apply 0003 or later until those three hashes are recorded. A mismatch aborts. An empty database may run the full chain and record each file as it runs. Do not point this script at the hosted development database; the owner runs it, after a backup, using the runbook commands.
- [ ] Take a fresh restorable schema/data backup and record database identity, code revision, checksum and migration state outside git. The in-repo rehearsal copies the affected tables inside the disposable database. The hosted database still needs a real `pg_dump` taken by the owner. Reconcile the Task 1 finding of absent database migration history before applying new migrations, using the gate above.
- [x] Add `scripts/seed-igdb.ts`, using the same adapter, shared rate limiter and catalogue writer as Steam ingestion. It never clears user data. `--ids` seeds explicit IGDB ids. `--top` (default 2000, allowed 1–5000) seeds the top main games (`game_type = 0`) that have both `rating` and `rating_count`, ordered by `rating_count` descending, then `rating` descending, then id. Paginate until a tie on `rating_count` at the cutoff cannot change the selection. Do not store IGDB ratings as ScreenPeak ratings. Enforce `game_type = 0` for this non-Steam bulk hydration; Steam import must not apply that filter to legitimate editions. Detach Steam app ids shared inside the batch, and omit ids already mapped to a different local game, before `writeCatalogGame`. An empty catalogue remains valid when this seed is not selected.
- [x] When optional seed data is selected for cutover, fetch and validate it before deletion; any provider failure aborts preparation. An explicitly empty initial catalogue needs no provider call.
- [x] Produce a dry-run report with current catalogue/taxonomy and new staged counts, exact library/review/list-membership/favourite counts to clear, and Auth/account/list/social/settings identities to retain.
- [x] Stop the app and DB writers, verify snapshot fingerprints, and use one transaction to clear game-linked children, favourites, catalogue joins and all five catalogue tables in dependency order; load staged IGDB records with fresh UUIDs. Clear obsolete external mappings/cache when present. Do not use TRUNCATE CASCADE or delete Auth/accounts/list definitions/social tables.
- [x] Clear generated Loadout identity/timestamp. Preserve authored bios, selected titles and account settings. Retained lists are empty; library/review-derived stats and rating averages reflect the empty state.
- [x] Persist run ID/manifest checksum/completion atomically in private reset state. Refuse completed-run replay; a new reset requires a new snapshot/manifest. Ordinary seed/import runs never clear user data.
- [x] Test dry-run writes nothing, provider failures cause no deletion, mid-apply failure rolls back, committed apply cannot run twice, and changed source data rejects a stale manifest.
- [x] Assert Auth/account/social/list-definition identities/content are unchanged, game-linked tables are empty, favourites/generated Loadout fields are cleared, all catalogue relations point to new valid rows, and no RAWG-only records remain.
- [x] Rehearse reset and full-backup recovery on an isolated database. Document results and commit. The hosted `pg_dump` and a restore of that dump stay with the owner; the automated rehearsal uses a disposable local database and its in-database `reset_backup` schema.

**Exit:** Tested fresh-catalogue reset with explicit linked-data loss and preserved independent data. No old-game reconciliation or partial data restoration.

**Task 4 execution notes (2026-10-10):** Local only. `0005_taxonomy_slug_unique.sql` is journaled after 0004 and was applied only inside disposable Postgres databases created by the integration suite. The hosted development database was not stamped, migrated, seeded, or reset. The remaining unchecked backup item is the owner's `pg_dump` plus a restore onto a local `_copy` before they run the runbook commands. Expo Image has no host allowlist, so `images.igdb.com` needed no mobile config change.

## Task 5 — Remove Metacritic and three-score branding; build the two-score game page

**Create:** apps/web/test/components/StatCompare.test.tsx; apps/web/test/lib/hero-game.test.ts.
**Modify:** packages/shared/api/games.ts; packages/shared/types/{game,feed,explore,stats}.ts; apps/web/lib/loaders/game-page.ts; apps/web/lib/queries/{game,list,game-search}.ts; apps/web/app/components/game/{StatCompare,GameCard,GameFilters}.tsx; apps/web/app/components/library/LibraryFilters.tsx; apps/web/app/components/feed/{FeedGameCard,FeedItem}.tsx; apps/web/app/{page,opengraph-image}.tsx; apps/web/app/games/page.tsx; apps/web/app/games/[slug]/{page,opengraph-image}.tsx; apps/web/app/explore/page.tsx; apps/web/app/user/[username]/{page,library/page,loadout/page}.tsx; apps/mobile/src/components/game-card.tsx; apps/web/lib/og.tsx; apps/web/app/globals.css; packages/shared/tokens.ts; DESIGN.md; README.md; AGENTS.md. Audit apps/web/app/layout.tsx and other metadata/copy for stale branding.

**Interfaces:** Keep StatCompare as a two-score component with { you?: number | null; community?: number | null; communityCount?: number; signedIn: boolean }. Remove its critic prop and critic comparison branches. Callers obtain signedIn from the authenticated viewer and reuse the existing personal rating and community stats. Do not add a Following query or API field.

- [x] Apply the coordinated prelaunch contract change: remove rawg_id and all Metacritic fields from shared types, explicit query selects, loader output, API fixtures and current consumers. Add required igdb_id to game detail plus image/source fields field by field. Update the contract documentation with this one-time prelaunch reset; future shipped contracts remain additive.
- [x] Add component tests asserting exactly two score labels (You and Community), the common /10 scale, community count and no Critic/Following/Metacritic column. Cover signed-out, signed-in unrated, no community ratings, one community rating, both ratings and a missing aggregate with a personal rating.
- [x] Refactor StatCompare and the game-page Scoreboard to the two-column direction above. Remove the vacant critic slot; rebalance width and spacing around the two remaining values, with the existing rate/review action adjacent and cyan emphasis on You. Preserve the game details/review flow.
- [x] Keep personal-versus-community gap copy only when both scores are present. Remove critic comparisons and /100 conversions. Verify missing scores never display as zero and a missing aggregate never falsely implies the viewer is first.
- [x] Remove MC fallback badges across web/native. Cards keep their existing personal/community roles; unrated cards display no fabricated replacement. Do not add a third score from follows or IGDB.
- [x] Replace getHeroGame with the public rule above. Update homepage featured and fallback copy to the nonnumeric branding direction. Update both OG routes and their alt text to community-only public score content. Test rating-count ties, the three-rating eligibility threshold and an empty community; this minimum is a ranking rule, not three-score branding.
- [x] Audit active UI, metadata, accessible labels, image text, design docs and component comments for "three scores," "three-score," critic/community/you messaging and three-player explanations. Remove those claims, including the existing homepage and site OG fallbacks. Preserve historical migrations and audit records as history.
- [x] Prepare a final cleanup migration updating query_games default/allowed ordering with a total order and removing Metacritic outputs from query_games, get_feed, get_follow_recommendations, get_loadout_rating_highlights and get_trending_games. Changed RETURNS TABLE shapes require explicit drop/recreate with exact signatures, not CREATE OR REPLACE alone. Inventory dependants first, recreate them in order, and restore grants/security settings in the same transaction; never use unreviewed DROP CASCADE. Base get_feed on 0002's privacy-corrected definition. Apply this migration after the staged reset in Task 8, then drop obsolete columns. Do not rewrite 0001/0002.
- [x] Preserve recommendation eligibility/ranking and its existing recommendation-only averages; do not repurpose them as a new score panel. Its existing private-library behavior is a known separate issue: any function body changed here must enforce the documented library/list privacy gates.
- [x] Implement strict API / lenient web sort parsing in a shared module for these callers; test old Metacritic URLs and stable ties.
- [x] Remove unused --color-critic, tokens.colors.critic and og.critic after removing their consumers. Update globals.css/shared tokens together, and revise DESIGN.md/AGENTS.md from three-player color roles to You/Community roles. Retain existing community/you colors, wordmark and cyan seam. Run the shared-token test.
- [x] Inspect the game page at narrow phone and desktop widths, including long labels and every empty/auth state. Verify the homepage and generated share images have no residual three-score pitch. Update the future mobile design guidance to use the same two-score model without building unrelated screens.
- [x] Run the tests above, existing loader/API JSON-round-trip tests and web/mobile typechecks. Commit.

**Task 5 execution notes (2026-10-10):** Local only. `0006_two_score_rpcs.sql` is journaled and applied only inside disposable Postgres databases. It does **not** drop `games.metacritic_score`. The column drop stays in the unjournaled `db/cutover/igdb-catalog-cleanup.sql` until Task 7 changes `app/sitemap.ts` and Task 8 journals the drop. 0001 and 0002 were not rewritten.

Deviations from the task text:

- The RPC rewrite landed in Task 5 as journaled `0006`, so the empty-database chain matches the app. The task text said to apply that migration after the Task 8 reset and then drop the column. The drop did not move. Task 8 must not restore the 0001 return shapes.
- `GameDetail.igdb_id` is `number | null` with the key always present. The column stays nullable until the Task 8 cleanup sets it `NOT NULL`.
- `get_follow_recommendations` and `get_trending_games` now require `users.library_public` because their bodies changed. Recommendation eligibility (a followed user's completed game rated at least 7) and loadout highlight ranking are otherwise unchanged. Averages stay recommendation-only.
- Library `date_added` is ordered in the library page from `library_entries.created_at`. `query_games` has no `date_added` branch.
- RAWG runtime, `db/schema.ts` legacy columns, and `app/sitemap.ts` were left for Tasks 7 and 8. `tierColor` still accepts a /100 scale as a numeric helper; no UI passes 100.
- Sort parsing lives in `apps/web/lib/game-catalog-sort.ts`. There is no games-list API yet, so the strict parser is exported and unit-tested for that caller rather than placed in `packages/shared`.
- The signed-out game page and homepage were checked in a local browser against disposable Postgres (desktop and a 390px-wide phone viewport). Signed-in empty states are covered by the StatCompare component tests. There is no local Auth session, and the hosted project was not used.
- Review follow-up: changing the catalogue or library sort key resets the direction (`name` ascending, every other key descending). `0006` revokes every non-owner grant before restoring the saved ACL, and sets `search_path` to `public, pg_temp` on the five functions. `compareCatalogGames` was removed; `query_games` is the ordering tested against Postgres.

**Exit:** The game page shows only You and Community. No active UI, sort default, hero selection or branding depends on Metacritic or three scores. Public images never depend on a viewer.

## Task 6 — Replace live Steam ingestion with resumable IGDB matching

**Create:** apps/web/lib/catalog/steam-import.ts, apps/web/test/lib/catalog/steam-import.test.ts, apps/web/test/integration/steam-import.test.ts.
**Modify:** apps/web/app/steamlink/page.tsx, apps/web/app/steam-actions.ts, apps/web/lib/queries/game.ts, apps/web/app/components/settings/SteamLinkGamesSection.tsx, apps/web/app/components/game/GameFromSteam.tsx, apps/web/app/library-actions.ts, apps/web/lib/queries/library.ts, packages/shared/types/steam.ts.

**Interfaces:** resolveSteamBatch(games: { appid: number; name: string }[]): Promise<{ matched: { appid: number; gameId: string }[]; unmatched: number[]; ambiguous: number[]; retryable: number[] }>. Errors are not collapsed into unmatched.

- [x] Test multiple app IDs for one local game, repeated imports, ambiguous provider mappings, genuine misses, timeout/429, transient DB failures and a name-only remake collision.
- [x] Use stored mappings first. Query external_games with the resolved Steam source and batches of 100 uid strings, explicit result limit and pagination; hydrate unique game IDs in batches. Do not assume one returned external record per input app.
- [x] Leave absent external-ID mappings unmatched (user-confirmed Hitman example); manual additions can be a later follow-up. Do not add automated fuzzy fallback as a requirement for this migration. Before `writeCatalogGame`, drop Steam app ids that are ambiguous, shared by more than one staged IGDB game, or already mapped to a different local game, and report them. The writer still throws if a caller passes a foreign app id, so one bad mapping must not be handed to it and must not abort the rest of the import.
- [x] Cache a genuine no-match for seven days, keyed by Steam app id and matcher version, and cache an ambiguous result the same way. Write that row only after an authoritative HTTP 200. A 401, a 429, any other non-200, and a transport failure write no `steam_match_cache` row. Explicit retry bypasses only the miss cache, not rate limits.
- [x] Test and reject known demo/software/launcher ownership inputs before full-game import, including Steam 247750 mapping to IGDB 3035. External-ID uniqueness and IGDB game_type alone do not prove the Steam app is a full game. Do not apply game_type = 0 globally to legitimate Steam editions/expansions.
- [x] Remove catalogue mutation from GET rendering. Render local matches, then use authenticated bounded server-action batches to resolve missing app IDs, with progress/retry UI. Re-fetch or cache server-side the caller's owned Steam games; do not trust arbitrary app IDs or a user ID from client input. Stop between batches and resume from persistent mappings/cache. No fire-and-forget promise after the request ends.
- [x] Collapse multiple owned app IDs into one editable ScreenPeak game entry before final import. Sum playtime once across distinct app IDs, preserve existing manually chosen library values, and use the existing "any owned app fully completed" behavior explicitly for achievements. Count unmatched Steam apps separately from unique matched games.
- [x] Deduplicate again by game UUID in the final server mutation. Retry must not inflate playtime or create duplicate (user_id, game_id) rows. Preserve user-confirmed library edits; matching alone must not write library entries.
- [x] Test spoofed Steam IDs, signed-out actions, another user's job/input, and repeated/concurrent submissions. Invalid input returns a visible error; partial provider outages keep known matches available.
- [x] Run the live benchmark with Task 1 input and report end-to-end requests/time; compare second sync behavior. Commit.

**Task 6 execution notes (2026-10-10):** Local only. `/steamlink` renders stored `game_external_ids` matches and does not call RAWG or write the catalogue. `resolveSteamImportBatch` re-fetches the signed-in user's owned games and resolves at most 50 apps per request through `igdbProvider` (shared rate-limit budget, external lookup pages of 100). Resume state is the mapping table plus `igdb_private.steam_match_cache`. `writeSteamMatchCache` is the only cache writer. `games.metacritic_score` was not dropped. RAWG files were not removed.

Deviations from the task text:

- The live Task 1 library benchmark was not re-run. The private 428-app input and a local budget database were not both available without risking `DATABASE_POOL_URL`, which can point at hosted Supabase. Unit and integration tests cover the matcher with a fake provider. The owner can repeat `audit:igdb:adapter` against `TEST_DATABASE_URL` when they want a fresh timing report. Task 2 already recorded 423/428 through the production adapter.
- Ineligible demo, software, and launcher apps are reported as unmatched and are not negative-cached. The decision is local (known app 247750, plus a name check). An HTTP 200 candidate is not stored as "no match".
- `getGamesFromSteamIds` still falls back to `games.steam_appid` so the existing catalogue test and any legacy row keep resolving. The Steam page, batch resolver, and library confirm path do not read that column.
- `--confirm-before-task-6` is now ignored. Disposable-database guards remain. The hosted development reset is still an owner step in Task 8.
- `images.igdb.com` is allowed in `next.config.ts` so the import preview can render IGDB covers. `media.rawg.io` stays until Task 7.
- There is no import-job table. A signed-out caller and a posted user id or app list cannot select someone else's library. Invalid input returns `{ error }` from the server action so the message stays visible.
- First paint does not call Steam for achievement completion. Newly matched apps are checked inside the batch action, at most the apps that batch just matched. Hours already stored on a library row are kept when they were chosen by hand. When `steam_playtime_minutes` shows the stored hours are still the previous automatic sum, the next sync refreshes them. Otherwise hours are `floor(sum of distinct app minutes / 60)`.
- Name text rejects demos, playtests, launchers, and dedicated servers. It does not reject titles that merely contain "software", "benchmark", or "sdk", and it is not a matcher. A same-name remake with no external id stays unmatched. Import stores only the owned app ids it accepted, so an extra demo id on the IGDB payload does not become a mapping.
- Review follow-up: a retry click walks pending apps, then each cached miss once, and the retry control stays while work remains. One library holds an advisory lock for the batch and waits out a one-second gap before the next IGDB batch. A unique-constraint loser is not cached as ambiguous. `writeCatalogGame` can retain unlisted Steam rows for the import path. Confirm re-reads the library and will not overwrite an existing row with the automatic Steam hours when the read fails or the client still shows those defaults.
- The integration spec is `apps/web/test/integration/steam-import.integration.ts`, matching the other disposable-Postgres specs, instead of `steam-import.test.ts`.

**Exit:** Exact-ID matching is primary, imports survive partial failures, and page rendering has no catalogue-write side effects.

## Task 7 — Update imagery, attribution and sitemap

**Modify:** apps/web/next.config.ts; apps/web/app/components/game/{GameCard,FavoriteGamePicker}.tsx; apps/web/app/components/lists/AddToListFromListButton.tsx; apps/web/app/components/util/Footer.tsx; apps/web/app/sitemap.ts; game-page and OG files from Task 5; apps/mobile/src/components/game-card.tsx and apps/mobile/src/app/index.tsx. Create apps/mobile/src/components/data-attribution.tsx; the current mobile app has no settings/about screen.
**Create:** apps/web/test/lib/catalog/images.test.ts; apps/web/test/lib/sitemap.test.ts.

- [x] Permit only the required HTTPS IGDB CDN host/path in Next image configuration alongside the existing avatar host. Remove media.rawg.io in the final application configuration; verify the fresh catalogue contains no rendered RAWG image references.
- [x] Use portrait covers for cards/pickers and landscape artwork/screenshots for heroes/social images. Use cover_big at 2x where resolution is needed; retain a deliberate 3:4 frame or fit treatment and inspect the slight crop. Do not stretch a portrait into a 1200×630 share image.
- [x] Audit feed, lists, reviews, search pickers, favourites, game page and Steam tiles; align skeleton aspect ratios and sizes. Inspect web narrow/wide layouts and mobile on-device rendering.
- [x] Add visible "Game data and images from IGDB" attribution with a link in the web footer and a visible reusable mobile attribution component on the existing index screen; later settings work may move it to a persistent About location. All live catalogue metadata after the reset is IGDB-sourced; no mixed-provider attribution path is required.
- [x] Fix sitemap with a dedicated Drizzle query selecting actual schema columns, stable order and explicit error propagation; use parseDbTimestamp for database timestamps. Keep private lists out. Handle PostgREST row-cap assumptions by using explicit DB pagination rather than assuming .limit(5000) guarantees 5000 rows. This change has to land before `metacritic_score` is dropped: `app/sitemap.ts` currently orders by `metacritic_score` and selects `updated_at` (added in 0004, absent before preparation).
- [x] Expo Image on SDK 57 has no remote-host allowlist (confirmed against the v57 image docs: a remote HTTPS URL is a valid source, and `app.json` does not name hosts). `images.igdb.com` is therefore already loadable on device. Do not add a host allowlist. Next.js `images.remotePatterns` is still required for the web app and remains part of this task.
- [x] Test sitemap contains the freshly seeded game slugs, omits private lists, uses valid lastModified dates, pages deterministically and does not emit a successful empty game section on DB failure. Old test URLs need no redirects.
- [x] Apply the same DB-error rule to changed game-page reads: API outages become 500, not a plausible missing game or empty taxonomy; web-only forgiving behavior belongs at the call site.
- [x] Verify real rendered OG images and missing-image fallbacks. Commit.

**Task 7 execution notes (2026-10-10):** Local only. No migration was added and `games.metacritic_score` was not dropped. RAWG runtime files were not removed. The hosted development database was not contacted.

Deviations from the task text:

- Sitemap order is `games.updated_at` descending, then `games.id` ascending, in pages of 1000. The integration fixture inserts catalogue rows in disposable Postgres, including a high Metacritic score on an older row, and asserts that score does not win. It does not call the live top-N IGDB seed.
- `getGameBySlug`, `getGameIdBySlug`, `getGameTaxonomy`, `getGameRatingsStats`, and `getUserRatingReviewForGame` now reject on a database error. The game page still catches the paged review query and shows an empty list; that remains the web-only call site. `getLibraryEntry` and `getUserLists` also reject, so a signed-in game page does not draw an empty save during an outage. `getHeroGame` still returns null, so the public homepage keeps its branded fallback, and a failed hero query is logged.
- The game gallery shows every valid landscape screenshot. It no longer drops the first shot, because that shot is not the page hero.
- The homepage uses landscape artwork in a 16:9 frame when those bytes load, and the portrait cover in a 3:4 frame when the landscape URL is missing or does not return an image. Share images use a 16:9 panel. A portrait cover is never the 1200×630 source. A missing or failed landscape fetch is the branded card. Titles are wrapped to the text column.
- Sitemap files are split with `generateSitemaps`. Each document stays at or under 50,000 URLs.
- Large covers request `cover_big_2x`. Thumbs request `cover_big`. A URL that is not `https://images.igdb.com/igdb/image/upload/` is not rendered.
- Grid skeletons were already 3:4. Cards, pickers, feed thumbs, review rows, list fans, and Steam tiles now use that frame. `cover_big` is 264×374, so the 3:4 frame crops a little height.
- Expo Image still has no host allowlist. The mobile card accepts the same IGDB urls as the web parser, including a protocol-relative form, and refuses anything else. `Linking.openURL` failures are swallowed. On-device rendering was not available in this environment.
- `ship-readiness.html` still documents `RAWG_API_KEY` and RAWG covers. It is on the Task 8 cleanup list and was not rewritten here.

**Exit:** Images, attribution and discoverability work for the fresh IGDB catalogue, including empty user libraries and unrated games after reset.

## Task 8 — Rehearse the development reset, finish cleanup and unblock other work

**Modify:** README.md, AGENTS.md, DESIGN.md, apps/web/test/README.md, backlog.txt, build-plan.md, docs/igdb-migration-runbook.md, and ship-readiness.html (it still documents `RAWG_API_KEY` and RAWG cover images on game pages).
**Retire:** apps/web/lib/rawg.ts, apps/web/scripts/inspect-rawg.ts, apps/web/test/lib/rawg.test.ts after its useful matching fixtures have moved.

- [x] Re-read git status and migration state before execution; allocate migration numbers then. Preserve unrelated work and existing migration history.
- [ ] Rehearse preparation schema → staged reset → final SQL/function/column cleanup on an isolated copy of the test database. Also run the complete migration chain and seed from an empty database.
- [ ] Verify retained account/social/list-definition data by identity and content, empty game-linked tables and cleared favourite arrays against the approved loss report, and zero dangling favourites/references. Old game URLs are not an acceptance requirement.
- [x] Run npm test, npm run lint, npx tsc --noEmit -p apps/web, npx tsc --noEmit -p apps/mobile, npm run lint -w @screenpeak/mobile, and npm run build. Repeat only for new edits/failures.
- [ ] Smoke-test login, local search, filters, game detail/API, ratings, library edits, list membership, feed, Loadout, Steam preview/confirmation, images, OG and sitemap.
- [ ] Test provider outages with local browsing intact, and DB outages as explicit failures. Verify the current web/mobile API contract together; no legacy-client test matrix is needed.
- [ ] Confirm credentials and live mapping report. Before public launch, secure an IGDB commercial partnership with written terms for storage, caching and attribution. The Twitch Developer Agreement defaults to 24-hour caching; the free noncommercial documentation is not permission to ship. An unshipped development reset does not itself require a public deployment, and it does not satisfy this gate.
- [ ] For the actual selected development database, stop app/writers, take the restorable snapshot, display the staged retention/loss report, apply preparation schema and the reset transaction, then apply final cleanup. Keep the app stopped until the new code/schema checks pass.
- [x] In final cleanup, verify all five tables have valid required igdb_id values, and drop rawg_id, metacritic_score and games.steam_appid with their obsolete constraints. The score RPCs were already recreated without Metacritic outputs in journaled 0006 (Task 5); do not restore the 0001 return shapes. No dual-provider compatibility columns remain.
- [x] Remove RAWG runtime/seed code and credentials; audit remaining rawg/metacritic references, including `ship-readiness.html` (`RAWG_API_KEY` and the RAWG cover-image note). Allow only historical migrations, backups/audit descriptions and deliberate removed-input validation tests, not active schema/types/queries/UI/provider calls.
- [ ] Run a seed, Steam resync and metadata refresh against the rebuilt catalogue. Verify normal repeated runs preserve newly created user rows and never perform a reset.
- [ ] Record actual reset/validation results and retained/cleared counts. Keep the backup until the rebuilt app has been checked. Remove the blocking banner in build-plan.md and update its provider/score assumptions.

### Recovery procedure

1. On a failed reset transaction, roll back and keep the app stopped; inspect the failure before retrying the same staged manifest.
2. If cleanup or smoke checks fail before new writes resume, restore the complete pre-reset development snapshot with its matching schema/migration state and code revision.
3. Once testing resumes, take a new snapshot before any recovery. Do not silently overwrite newly written test reviews or libraries with the older backup.
4. Prefer fixing forward for small issues. If a full rollback is chosen, account for newer test writes explicitly; no old RAWG compatibility path is maintained in the new application.
5. The backup supports full rollback, not a planned per-game salvage feature. Do not recreate old linked records during normal seed/import runs.

## Completion checklist

- [ ] Five catalogue tables and taxonomy joins rebuilt from IGDB; no old RAWG-only game/taxon rows remain.
- [ ] Accounts, list definitions, follows, likes, Steam links and settings retained.
- [ ] All old library entries, ratings/reviews, list memberships and favourite references cleared; generated Loadouts invalidated; no dangling references.
- [x] RAWG/Metacritic columns and obsolete single Steam-ID field removed from the final schema and current contracts; no legacy URL guarantees.
- [x] Seed and Steam flows use IGDB only; no live RAWG key required.
- [x] Miss caching distinguishes absence from outage; one game supports multiple Steam IDs.
- [ ] Game-page panel shows only You / Community; cards and public OG use appropriate community/personal data, with no critic replacement.
- [ ] All active three-score branding, MC badges, critic comparison copy and unused critic-specific presentation tokens removed.
- [ ] Coordinated prelaunch contract change completed and current web/mobile callers tested together.
- [x] Artwork/portrait behavior and attribution verified.
- [ ] IGDB commercial partnership recorded in writing (storage, caching, attribution) before public launch. Twitch's default 24-hour cache is not the shipped policy unless that agreement says so.
- [x] Sitemap bug fixed and DB errors visible.
- [ ] Full checks, live coverage experiment and recovery rehearsal documented.
- [ ] Mobile roadmap provider assumptions updated; migration prerequisite cleared.

## Estimate and execution sequence

Scope reduced 2026-10-08: remove the salvage matcher, manual crosswalk adjudication, UUID reuse, per-row restoration and their tests. The app is not shipped. Do not add a deploy window, a compatibility release, or a period where old and new contracts run together.

Code order for the remaining work:

1. Task 4 — migration journal on a database copy, then 0003/0004, the slug follow-up, the top-N seed, and the reset rehearsal. Local/test databases only.
2. Task 6 — Steam import, including the pre-write shared-id filter and the negative-cache rule. Ingestion does not depend on the score UI.
3. Task 5 — two-score UI and the contract/RPC rewrites. Leave the `metacritic_score` column in place.
4. Task 7 — done. The sitemap orders by `games.updated_at`, then id. `metacritic_score` can be dropped in Task 8.
5. Task 8 — isolated full rehearsal, drop `metacritic_score` and the RAWG columns, remove RAWG, and the commercial-partnership gate. The owner then applies the reviewed reset to the development database.

Task 1 credentials and the standalone live baseline are validated. Task 6 did not repeat the 428-app timing run. README and AGENTS.md describe the IGDB seed. The owner cutover order is `docs/igdb-cutover-checklist.md`.

**Task 8 code notes (2026-10-10):** Local only. The hosted development database was not contacted. `0007_igdb_catalog_cleanup.sql` is journaled with the draft's safety checks. `db/schema.ts` drops `rawg_id`, `metacritic_score`, and `steam_appid`, and marks `igdb_id` NOT NULL. `apps/web/lib/rawg.ts`, `scripts/seed-games.ts`, `scripts/inspect-rawg.ts`, `test/lib/rawg.test.ts`, and the `seed` npm script are gone. `--apply-pending` applies 0007 in the same transaction as any other pending file, so a legacy copy must use `--through 0006_two_score_rpcs` before the reset. `build-plan.md` had no separate blocking banner; its image row now says IGDB, and the hosted cutover stays on the checklist. One-time cutover scripts stay. The commercial-partnership gate and the hosted reset are still open. Verification on 2026-10-10: unit tests 49 files / 373 passed, integration tests 7 files / 53 passed (`TEST_DATABASE_URL` on local Postgres), web eslint, `tsc --noEmit` for `apps/web` and `apps/mobile`, and mobile `expo lint` all passed. `npm run build -w @screenpeak/web` passed against a local `_test` database after applying 0000–0007 (the sitemap collects `games` at build time).

Recommended execution: implement this task by task, with a reviewable commit at each task boundary. Tasks 1–6 are complete on `igdb-integration`. Task 7 is complete on its branch. Merge completed task branches into `igdb-integration`; do not merge to `main` until the full migration is accepted.
