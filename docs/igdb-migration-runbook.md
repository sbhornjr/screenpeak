# IGDB migration runbook

Updated 2026-10-10. The app is unshipped and all existing data is personal test data. Nothing in this runbook has been applied to the hosted development database.

## Available now

The read-only audit obtains its own Twitch bearer token, checks Steam app-ID coverage, expands selected game metadata, and writes an optional JSON report. It does not seed games, edit libraries, or reset the catalogue. It does write shared request-budget rows, so it needs a localhost database ending in `_test` or `_copy` via `--budget-db-env`. Pass `--confirm-local-copy` when that database has Supabase dump markers (a localhost URL can still be a tunnel).

- Audit CLI: `apps/web/scripts/audit-igdb.ts` (`npm run audit:igdb`)
- Audit/HTTP logic: `apps/web/scripts/igdb-audit.ts` (uses the shared `acquireIgdbLease` budget)
- Journal: `apps/web/scripts/establish-migration-journal.ts` (`npm run migrate:journal`)
- Seed: `apps/web/scripts/seed-igdb.ts` (`npm run seed:igdb`)
- Reset: `apps/web/scripts/reset-catalog-to-igdb.ts` (`npm run reset:catalog`)
- Tests: `apps/web/test/scripts/igdb-audit.test.ts` and `npm run test:igdb-integration`
- Full migration: [implementation plan](superpowers/plans/2026-10-06-rawg-to-igdb.md)

The read-only inventory command is unchanged (see the recorded baseline below). Journal, seed, and reset commands exist and refuse non-local URLs and database names that do not end in `_test` or `_copy`. They are for a restored local copy. Do not point them at the hosted project. `--local-auth-stubs` refuses a database that already has a Supabase auth schema, even with `--confirm-local-copy`.

## Credentials

Put these in apps/web/.env.local, or export them in the shell:

```dotenv
TWITCH_CLIENT_ID=your-client-id
TWITCH_CLIENT_SECRET=your-client-secret
```

Do not paste a bearer token into the script. Each process obtains one through POST https://id.twitch.tv/oauth2/token with URL-encoded query parameters client_id, client_secret and grant_type=client_credentials, as requested. Token expiry is tracked with a 60-second margin; an API 401 triggers one token replacement/retry. Credentials and token responses are never printed or included in reports. Existing environment values take precedence over .env.local.

No RAWG key or Steam API key is needed for file/app-ID auditing. The audit does need `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, and `--budget-db-env` pointing at a disposable localhost database that already has the shared request budget. It does not fall back to `DATABASE_POOL_URL`.

## Run from the repository root

```bash
# Usage; does not need credentials or make network calls
npm run audit:igdb -w @screenpeak/web -- --help

# Small known-ID smoke test. The budget database must already have migration 0003.
npm run audit:igdb -w @screenpeak/web -- --appids 292030,1145360 --budget-db-env TEST_DATABASE_URL

# Actual library coverage, with a report outside git
npm run audit:igdb -w @screenpeak/web -- --input /absolute/path/steam-library.json --output /tmp/screenpeak-igdb-library.json --budget-db-env TEST_DATABASE_URL

# Optional catalogue sample: main games ONLY
npm run audit:igdb -w @screenpeak/web -- --main-games 20 --output /tmp/screenpeak-igdb-main-games.json --budget-db-env TEST_DATABASE_URL
```

Choose exactly one input mode. --appids accepts comma-separated positive integer app IDs. --main-games accepts 1–100 and fetches a deterministic ID-ordered sample with game_type = 0; it is not a popular-games seed. Steam matching deliberately applies no main-game filter, since the audit must reveal edition/DLC mappings rather than hide them.

Relative input/output paths resolve against the directory from which npm was invoked (INIT_CWD), or the current directory for direct execution. The output directory must already exist. Reports are created with owner-only permissions and exclusive creation; an existing report is never overwritten. Use a new filename on subsequent runs.

Without --output, the script emits JSON to stdout. npm adds its own command banner; use --output for a clean machine-readable file instead of redirecting the entire npm output.

## Input format

Either a simplified array:

```json
[
  { "appid": 292030, "name": "The Witcher 3: Wild Hunt" },
  { "appid": 1145360, "name": "Hades" }
]
```

Or the actual JSON from Steam GetOwnedGames, wrapped in response.games (or an unwrapped games object). Use include_appinfo=true if collecting names. Export the response yourself from an authorized library; this script does not retrieve another person's library or read account credentials from the database.

Names are optional; matching uses app IDs only, with no fuzzy fallback in this audit. Duplicate app IDs are counted once. Missing/private-library responses are rejected rather than counted as zero games. An explicit game_count: 0 represents an empty library.

Input names and Steam user IDs are not copied to the report. Reports still reveal app IDs and IGDB game names, so they remain personal-library data: keep full reports outside git. The temporary docs/audit-igdb.txt is exploration material, not an input parser format or a test fixture.

## Reading the report

Steam mode reports:

| Field | Meaning |
| --- | --- |
| summary.total | Unique input Steam app IDs |
| exactMatches | Apps resolving to exactly one IGDB game; not proof every provider association is semantically correct |
| ambiguous | Apps resolving to multiple distinct IGDB games |
| unmatched | No mapping after every result page completed successfully |
| errors | Apps in mapping batches that could not be fully checked |
| coveragePercent | exactMatches / total, rounded to two decimals; null for empty input or any mapping error |
| metadataErrors | Input apps whose candidate metadata was unavailable/invalid, distinct from mapping failures |
| results | Per-app status, candidate IDs, candidate metadata and sanitized errors |
| sharedGames | Multiple input Steam app IDs mapping to the same IGDB game |
| timing | Mapping, hydration and total elapsed milliseconds |
| requests | OAuth/API attempts, retries and API counts by endpoint |

Metadata includes game type, first release date in UTC, ESRB labels/conflicts, genres/platforms, company roles, cover URL, screenshot count, landscape artwork count and missing-field flags. ESRB absence is not an HTTP failure. Multiple distinct ESRB labels are flagged; no arbitrary first rating is chosen. A missing game_type stays null rather than being assumed main-game.

Images request both url and image_id. Reports retain normalized HTTPS source URLs and derived display URLs; validate the IGDB CDN/path and flag mismatched IDs or absent/invalid URLs. Source thumbnail URLs are changed to suitable cover/screenshot renditions. This checks URL structure, not image availability or artistic suitability; no image downloads occur. Artworks are only potential landscape assets; a count does not establish visual suitability. Summary is checked for availability; storyline, external scores, keywords and other future-feature data are not imported.

A matched mapping with a metadata error remains an exact mapping for coverage, but is not ready to ingest. Never turn 429/5xx/schema failures into permanent no-match entries.

Exit codes:
- 0: Audit completed (unmatched/ambiguous games or missing optional fields are findings, not process failures).
- 1: Invalid arguments/input, missing credentials, global setup/source-verification failure, failed main-game query or output write failure.
- 2: Steam audit wrote a partial report with mapping or metadata failures. Fix/retry before treating it as a coverage baseline.

## Request behavior and limits

The script verifies external_game_sources ID 1 is Steam, looks up external_games.uid in batches of 100, follows 500-row pages in stable ID order, deduplicates game candidates, and hydrates 50 games at a time with explicit nested fields. Company role flags and the referenced company are expanded together; cover, genres, platforms and ESRB references do not each trigger per-record HTTP calls.

Requests run sequentially through the shared Postgres request budget (`acquireIgdbLease`), with a 10-second HTTP timeout. The 350ms dispatch window starts after the lease grant returns, and the next reservation is pushed by the observed round trip plus 650ms, so a slow tunnel does not expire the lease or collapse the gap between dispatches. Transient network/429/5xx failures retry at most three attempts per operation, with backoff and Retry-After support. Cooldowns over 30 seconds fail visibly instead of retrying early. Unexpected statuses or malformed JSON/schema data produce sanitized errors. There is a 50,000-result safety ceiling per external-ID batch.

The audit and the application importer share one budget database for the same Twitch credentials. Do not run a second IGDB client outside that budget. No token/data/miss cache persists between audit processes; reruns deliberately measure fresh reads.

A one-game smoke test cannot establish real-library coverage. For the baseline, inspect at least 20 exact mappings when available, every ambiguous mapping, same-name remakes, editions, missing metadata and sharedGames. Compare IDs/game types rather than trusting names alone. Record input count, exact/ambiguous/unmatched/errors, metadata errors, call counts, runtime and the manual review findings.

## Catalogue import policy

For future non-Steam bulk catalogue imports, use game_type = 0 (main game), including filters on any curated seed hydration. DLC and expansions are also game records; endpoint selection alone cannot exclude them. Never silently relax this filter for remakes, remasters or editions. Specific Steam-ID matching remains separate and audits all returned types.

Use first_release_date for ScreenPeak's single date, not the first release_dates array element. Missing remains null. Region/platform dates and partial-date precision are a later explicit policy. Resolve age-rating organization/category references; preserve company developer/publisher roles independently.

Defer bundles, DLC relationships, franchises, engines, modes, themes, perspectives, keywords and similar-game features. Keep the IGDB ID so these can be retrieved later. All displayed scores remain You / Community; IGDB user/critic scores are not replacements.

## Subsequent migration procedure

Confirmed 2026-10-08: reset the catalogue and all game-linked test data; retain accounts, settings and social data. There is no salvage requirement. The commands below exist. Run them only on a restored local copy, after a real `pg_dump`. The hosted development database has not been reset.

1. Inventory the exact development DB, reconcile absent migration history, and create a fresh restorable schema/data backup outside git.
2. Restore that dump into a new local database whose name ends in `_copy`. Choose an empty initial catalogue (Steam import populates it later), or stage/validate optional main-game seed records before deleting anything. Taxonomy is ingested with each game; no independent taxonomy seed is required.
3. Dry-run the loss report. The reset clears library entries, ratings/reviews, list memberships, favourites, and generated Loadout text. It keeps Auth, profiles/settings, list definitions, follows, likes, Steam links, and authored bios. The dry-run prints current counts and how many staged games would be written.
4. Stop writers. The manifest fingerprint covers every deleted and retained row, and the manifest stores those dry-run counts. `--apply` refuses when either has changed, when the manifest is empty or implausibly small, or when it was already committed. It takes a new `reset_backup` schema and does not drop an earlier one. That schema is a rehearsal aid, not a substitute for `pg_dump`.
5. Apply coordinated API/SQL cleanup later (Tasks 5–8): required IGDB IDs, no RAWG/Metacritic or obsolete single Steam-ID fields. Update web/mobile consumers together. Do not reset the database the app still serves until Task 6 replaces the rest of the Steam import. `--apply` requires `--confirm-before-task-6`.
6. Verify preserved independent data, empty linked tables, valid new relations, UI empty states, imports, images and sitemap. Rehearse full-backup recovery before actual cutover.
7. Resume the mobile roadmap only after the full plan passes acceptance checks.

Owner commands for the local copy are in [Task 4](#task-4-migration-journal-slugs-seed-and-reset--owner-steps). Task 1 did not perform a reset.

## Verification

```bash
npm test -w @screenpeak/web -- test/scripts/igdb-audit.test.ts
npx tsc --noEmit --incremental false -p apps/web
npm run lint
```

Official references: [IGDB API and expansion](https://api-docs.igdb.com/#expander), [Twitch client credentials](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#client-credentials-grant-flow).

## Recorded smoke checks — 2026-10-07

Live requests used the configured Twitch app credentials; no catalogue/database writes occurred.

- Steam sample: 292030 (The Witcher 3: Wild Hunt → IGDB 1942) and 1145360 (Hades → IGDB 113112). Both matched exactly; no ambiguity, mapping errors or metadata errors.
- Steam sample request counts: one token request, one source verification, one external-ID batch and one expanded games batch. No retries.
- Image checks: supplied cover/screenshot URLs and image IDs agreed for both games; reports contain both normalized source URLs and larger display renditions. This does not assert CDN availability or visual quality.
- Main-game sample: IGDB IDs 1, 2 and 3, each game_type 0; one token request and one expanded games request.
- These initial samples validate the live endpoint fields and query shapes. The subsequent representative-library baseline is recorded below.


## Task 1 library baseline and manual review — 2026-10-08

The authorized library export contained 428 unique Steam apps. Direct external-ID lookup matched 423 (98.83%), with zero ambiguous mappings, zero mapping errors, zero metadata errors and five misses. Those 423 apps resolve to 421 distinct IGDB games. This is measured coverage for this library, not a guarantee for other libraries or proof of semantic correctness for every provider mapping.

- Requests: one OAuth request and 15 IGDB requests (one source check, five external-ID batches, nine metadata batches); zero retries.
- Elapsed: external-ID mapping 1,304ms; metadata hydration 14,286ms; total 16,620ms (includes setup).
- Name matching: not run; zero name-search requests. Missing mappings do not block the migration.
- Missing fields across 421 unique games: ESRB 50, developer six, publisher six, release date one, platforms one. All had genres, covers and screenshots. Ten lacked landscape artwork. No image URL validation issues or conflicting ESRB labels. CDN availability and visual suitability are not tested.
- Manually inspected 24 direct mappings against the Steam export, IGDB identity, edition/type, release date and PC platform. The private review records each pair and outcome. Examples include the Resident Evil remakes, a Resident Evil remaster, ABZÛ/Abzu, Nongünz/Nongunz, Öoo, editions, and both shared-game groups. No ambiguous mappings required adjudication.
- Multiple app IDs: 2520/2525 resolve to IGDB 15623; 412020/1449560 resolve to IGDB 37016. Preserve external mappings separately and deduplicate local library entries.
- Sixty distinct matches have a nonzero game type. Do not apply the main-game-only seed filter to Steam matching.
- Five misses: Hitman: Sniper Challenge, Aseprite, Wallpaper Engine, 1BITDRAGON, The Jackbox Megapicker. The user supplied IGDB game 5567 for Hitman with no Steam external mapping and accepts leaving it unmatched, with manual addition later if needed. No guessed crosswalk was installed.

Additional explicit edge probes, separate from the library denominator:

| Steam app | IGDB result | Review outcome |
| --- | --- | --- |
| 247750, The Stanley Parable Demo | 3035, The Stanley Parable, type 10 | **Semantic exception:** Steam identifies this as a demo, but IGDB associates it with the full game. Do not interpret this mapping as full-game ownership. |
| 378648, The Witcher 3: Blood and Wine | 13166, type 2 | DLC/expansion lookup works without the main-game filter. |
| 211420, Dark Souls: Prepare to Die Edition | 21040, type 3 | Delisted edition still resolves directly. |

All three probes returned one candidate each, with no API/metadata errors, one OAuth plus three IGDB requests, zero retries, and 1,211ms total. Thus 100% external-ID coverage here is explicitly NOT 100% accepted full-game matches. Task 6 must test the demo case and reject known demo/software/launcher inputs before adding full-game ownership, even when the returned IGDB record looks like a normal game. GetOwnedGames is the normal source; arbitrary app-ID probes deliberately exercise cases outside that normal list.

Primary evidence for probe classification: [Steam demo metadata](https://store.steampowered.com/api/appdetails?appids=247750), [Steam DLC metadata](https://store.steampowered.com/api/appdetails?appids=378648), [Steam delisting notice](https://store.steampowered.com/app/211420/).

## Task 1 database baseline — 2026-10-08

Read the development database selected by apps/web/.env.local DATABASE_POOL_URL. Its project identity was cross-checked with NEXT_PUBLIC_SUPABASE_URL. Exact host/project/role are in the private snapshot, not source control. The export verified PostgreSQL read_only=on and repeatable read isolation. No database rows, schema, credentials or migration history were changed.

Reproduce from the repository root (choose a new output directory each time; its parent must exist):

```bash
node --import tsx apps/web/scripts/inventory-igdb-baseline.ts \
  --output-dir "$HOME/screenpeak-igdb-baseline-YYYY-MM-DD-new"
```

The command refuses exports inside this checkout, resolves parent symlinks, creates a new owner-only directory, and writes snapshot.json plus manifest.json with owner-only permissions. The manifest records a SHA-256 checksum, row counts and local migration hashes. It exports all public-schema table rows, column/constraint/index/policy/trigger metadata, and any recognized database migration journals. Auth users are counted only; their credentials and sessions are not exported. The command has no reset or restoration operation.

Private artifacts are in `~/screenpeak-igdb-baseline-2026-10-08/`:

- snapshot.json, manifest.json: consistent database baseline and checksum.
- steam-library.json, igdb-coverage.json, edge-cases.json: preserved inputs/results, originally under /tmp.
- manual-mapping-review.json: 24 inspected direct mappings and explicit exceptions.
- retention-review.mjs, retention-loss.json: reproducible offline planning dry run. Run `node "$HOME/screenpeak-igdb-baseline-2026-10-08/retention-review.mjs" retention-loss-new.json` to recompute from the saved snapshot/report; it verifies the snapshot checksum and refuses overwrite.
- artifact-checksums.json: hashes for the saved artifacts.

Snapshot SHA-256: `2fa953dc34e6f47ab72f92129a76940e4e801badb0ef786f5ec076fd2d89f967`.

**This is an inventory/data export, not a complete disaster-recovery backup.** Auth data, storage and complete executable schema definitions are not backed up here. Task 4/8 still require a fresh, restorable backup and recovery rehearsal before any destructive cutover. The Task 1 snapshot will also become stale if test data changes.

| Data | Baseline count |
| --- | ---: |
| Games | 502 |
| Genres / platforms | 19 / 37 |
| Developers / publishers | 527 / 363 |
| Genre / platform joins | 1,288 / 2,109 |
| Developer / publisher joins | 802 / 760 |
| Library entries / ratings and reviews / list memberships | 420 / 35 / 29 |
| Public profiles / Auth users | 4 / 4 |
| List definitions / follows / list likes / Steam links | 11 / 5 / 7 / 1 |
| Favourite references / generated Loadout values | 2 / 2 |

All five catalogue tables have no duplicate slugs in this snapshot. Of 502 games, 395 have Steam IDs, all present in the audited library; 107 have none. Actual foreign keys confirm that deleting games cascades into library_entries, ratings_reviews, list_games and the four taxonomy joins. Favourite UUID arrays need explicit cleanup. List definitions and their likes have no dependency on game rows.

**Migration-history finding:** neither drizzle.__drizzle_migrations nor supabase_migrations.schema_migrations exists in this database. The repository has three journaled SQL files (0000 through 0002); hashes are captured in the manifest. Their presence in source control does not prove they were applied. Before running migrations, Tasks 3/8 must compare the actual schema/functions with the baseline and establish a migration strategy on an isolated copy. Do not replay 0000 against this existing database or stamp history blindly.

## Superseded preservation analysis and confirmed reset loss

The user subsequently chose to discard all game-linked test data. The following candidate analysis is retained only as historical audit evidence; do not implement it as a restoration requirement.

The initial preservation analysis found 372 old games with a unique external-ID candidate and matching normalized names; four old games collide on two IGDB IDs, 16 need name/edition review, three have genuine provider misses, and 107 lack Steam-ID evidence. These are candidates only, not an approved restoration map.

| Game-linked data | Total at risk if reset without restoration | Candidate rows | Unresolved rows |
| --- | ---: | ---: | ---: |
| Library entries | 420 | 374 | 46 |
| Ratings/reviews | 35 | 12 | 23 |
| List memberships | 29 | 14 | 15 |
| Favourite references | 2 | 2 | 0 |

The dry run found no dangling game references in these tables/arrays. Candidate counts do not promise retention: they have not passed a staged restore. The existing catalogue contains suspected old name-matcher errors: GRID (2019) carries Steam 12750 (Race Driver: Grid), Resident Evil 2 (1998) carries the remake's 883710, and Dead Space (2008) carries the remake's 1693980. These must not be silently treated as identity-equivalent during any restoration.

The confirmed catalogue-and-game-linked-data reset will retain four profiles/Auth accounts, 11 list definitions, five follows, seven list likes and one Steam link independently; clear the two favourite references and invalidate two generated Loadout values. Keep the user-authored profile Loadout bio. A broader reset would have a different loss scope and must be specified separately.


## Task 1 completion and remaining boundaries

Completed: audit implementation/credentials, representative library benchmark, 24 manual mapping checks, demo/DLC/delisted probes, read-only database inventory/export, reset-loss report, and confirmed reset/score decisions. Tests: 227 passing across 28 files; web typecheck and ESLint pass. A separate code review found no important correctness/privacy/safety issues.

The latest reset decision removes all salvage work from Tasks 3/4/8. At this snapshot the approved future reset loss is 420 library entries, 35 ratings/reviews, 29 list memberships and two favourites, in addition to replacing catalogue/taxonomy and clearing two generated Loadouts. Counts must be refreshed before apply. No live data has been cleared. Adapter implementation, migration-history reconciliation, full backup/recovery rehearsal and actual reset remain later tasks.


## Task 2 production adapter — 2026-10-08

Implemented server-only authentication, bounded HTTP transport, provider schema validation, current lookup resolution, game normalization, and a shared Postgres request budget. `lib/igdb/provider.ts` exposes `getGamesByIds`, `lookupSteamApps`, `searchGames` and `getLookups`. These retrieve/normalize data only; Task 3 supplies the database writer and Task 6 wires Steam import. Search results are candidates, never automatic Steam associations. Credentials are required on requests, not module import/local rendering.

Authentication shares one refresh per process, caches until 60 seconds before expiry and conditionally refreshes a rejected token once. Requests have a ten-second deadline including response-body reading; transient network/429/5xx failures get at most three attempts with jitter and Retry-After support. Cooldowns exceeding 30 seconds fail visibly. Logs contain endpoint/status/duration only; tokens, raw errors, SQL and response bodies are not logged. Provider IDs, current table references and supplied image URLs are validated. Pre-1970 release timestamps are supported. External ratings are not part of CatalogGame.

Migration `0003_igdb_request_budget.sql` creates a non-exposed `igdb_private` schema with RLS and no PUBLIC/anon/authenticated schema, table or function privileges. Runtime queries use the existing server Drizzle client. This migration was tested on a disposable local Postgres 17 database only; **it has not been applied to the development Supabase database**. Reconcile that database's absent migration history before applying migrations; do not replay 0000 blindly. New adapter calls fail closed until the selected budget DB has this schema. No existing RAWG page/import flow has been switched yet.

Each credential scope is keyed by a SHA-256 hash of the Twitch client ID. A short database transaction reserves one of four leases; HTTP occurs after the transaction ends. Reservations are 650ms apart. The 350ms dispatch window starts when the grant returns, and the client then pushes `next_start_at` by the observed round trip plus 650ms, so a slow link does not expire the lease before it can be used and still leaves at least 300ms before the next grant. Slow/stale reservations are released and retried, never dispatched late. HTTP has ten seconds; leases expire after fifteen seconds if a process disappears. Acquisition waits at most approximately 30 seconds, with bounded SQL statements. All production imports and the standalone audit share this budget. The audit no longer keeps a process-local limiter.

### Verification and reproduction

```bash
npm test
npx tsc --noEmit --incremental false -p apps/web
npm run lint

# Separate suite: requires explicit local disposable DB ending in _test.
# Never falls back to the app's DATABASE_POOL_URL.
TEST_DATABASE_URL=postgresql://YOUR_USER@127.0.0.1:55439/screenpeak_igdb_test \
  npm run test:igdb-integration -w @screenpeak/web

# Live IGDB calls, with request-budget writes only in the selected DB.
# The budget schema must already exist. Output must be a new file.
TEST_DATABASE_URL=postgresql://YOUR_USER@127.0.0.1:55439/screenpeak_igdb_test \
  npm run audit:igdb:adapter -w @screenpeak/web -- \
  --input /absolute/path/steam-library.json \
  --output /tmp/igdb-adapter-coverage-new.json --budget-db-env TEST_DATABASE_URL
```

The integration suite applies 0003 only when `igdb_private` is absent in that dedicated test DB, creates browser-role stand-ins as needed, and removes its unique test-scope rows. It tests independent DB connections and actual adapters in separate Node processes, four active leases, abandoned-lease expiry and browser-role denial. It does not apply/reset the application's catalogue schema. A dedicated Postgres 17 instance was started under /tmp/screenpeak-igdb-task2, listening only on loopback port 55439; no persistent service was enabled.

Live production-adapter result (same authorized Task 1 library): 428 apps, 423 unique external-ID matches (98.83%), zero ambiguous mappings, five misses, 421 normalized games, no mapping/metadata errors and no retries. Total 13,231ms: lookup tables 3,241ms, mapping 3,238ms, hydration 6,752ms. One OAuth request plus 19 API requests: five lookup tables, five mapping batches, nine metadata batches. This is one measured run, not a performance guarantee. Resolved current values: Steam source 1, Main Game 0, ESRB organization 1, Subreddit website type 14. The implementation resolves these names from the tables rather than copying deprecated enums.

Report: /tmp/igdb-adapter-coverage-2026-10-08.json (private, not committed). Scope remains app-ID coverage plus normalized metadata; demo-to-full-game semantics found in Task 1 still require the Task 6 eligibility guard.

### Optional catalogue population

An empty post-reset catalogue is supported. Linking/importing the owner's Steam library can populate roughly 421 distinct games from the measured sample, including genres/platforms/company roles. Keep an optional seed script for explicit IGDB IDs and repeatable setup; it shares the adapter/writer rather than duplicating ingestion. A larger prelaunch import around 5,000 games is a reasonable later option, but should use a deliberate rating-count/popularity policy instead of ranking by raw average alone. No large import, automatic schedule or external-score UI is implemented in Task 2.

## Task 3 catalogue storage and ingestion — 2026-10-09

Preparation migration `0004_igdb_catalog_preparation.sql` adds unique positive nullable IGDB IDs to all five catalogue tables, relaxes RAWG ID nullability, and adds game source/image/sync timestamps plus unique local slugs. Taxonomy tables also retain their own provider update timestamps. It does **not** reset any data or reinterpret old IDs. `game_external_ids` stores multiple verified Steam app IDs per game; conflicts cannot reassign another game's mapping. The private schema stores versioned unmatched/ambiguous cache entries and reset-run completion records. Browser catalogue mutations and all mapping/cache/reset-state access are revoked, with RLS enabled on the new tables. The runtime/migration role must own these objects or receive explicit operational privileges and bypass RLS, as the existing server role does; no browser or public grants are added.

`upsertCatalogGame` validates a complete `CatalogGame` before opening a transaction. `writeCatalogGame(tx, game)` is the same writer for Task 4's already-open reset transaction; it is operational server code, not a Server Action. Fetch/normalize first. Writes allocate fresh game/taxonomy UUIDs, serialize a game's imports by IGDB ID, acquire shared taxonomy in fixed role/ID order, and atomically replace relations and Steam mappings. Errors propagate and roll back the entire snapshot. Older source timestamps cannot overwrite a newer stored snapshot. A missing source timestamp cannot replace a known timestamp. Shared taxonomy uses each entity’s own IGDB update timestamp, independently from its game; equal/older/missing taxonomy timestamps preserve the stored name/slug. A first timestamp-less taxon may be inserted, but later updates need a newer known timestamp. Content comparison uses the actual retained taxonomy, so rejecting stale taxon labels does not fabricate a game content change. A successful identical import advances `metadata_synced_at` and mapping verification times but leaves `updated_at` unchanged. Source timestamp alone is not a display-content change. A missing provider timestamp does not replace a stored snapshot. New game slugs use the sanitized provider slug; a conflict appends the local `games.id` and does not contain `igdb`. Taxonomy slugs are unique per table, with an `igdb-<id>` fallback. Provider renames keep an existing local game slug. The earlier always-suffix rule applied only to the Task 3 writer before this follow-up.

`db/cutover/igdb-catalog-cleanup.sql` is a **draft outside the journal**. It aborts on any missing/invalid IGDB ID or public RPC body still referencing obsolete columns. It removes RAWG, Metacritic and the single Steam-ID column without deleting rows or using CASCADE. Task 5 must replace the affected RPC definitions and restore their security/grants; Task 8 combines/journals cleanup and updates the TypeScript schema after readers have migrated. Do not run this draft against the development DB now. The unshipped game-detail contract temporarily types `rawg_id` as nullable to match preparation; Task 5 removes it.

### Migration-history reconciliation

A fresh read-only public-schema/data dump was restored to a disposable local Postgres database, with local Auth/browser-role stand-ins. A second empty database ran historical migrations 0000–0002. Comparisons used `pg_attribute`/`pg_attrdef` (types, nullability, defaults), `pg_get_constraintdef`, `pg_indexes`, `pg_policies`, table RLS flags, `pg_get_triggerdef`, and whitespace-normalized `pg_get_functiondef`.

Results: all 95 columns, 57 constraints, 27 indexes, 37 policies, 17 RLS settings, two public triggers and all 26 application functions match. The development Auth `on_auth_user_created` trigger was separately verified by a read-only metadata query. Differences are extension functions (public in the empty historical chain, outside public in the hosted project) and Supabase's managed `rls_auto_enable` helper. Preserve those managed differences. Migration journals remain absent and were **not** created or stamped.

Strategy for this existing development DB: retain a reviewed baseline-equivalence report with local migration hashes and a fresh restorable backup. Recheck identity, definitions, grants and hashes at cutover; then explicitly apply only pending preparation migrations 0003/0004 under the operational role. Do not replay 0000, transplant an empty-chain schema, move extension functions or overwrite Supabase-managed helpers. If Drizzle history is adopted at cutover, record the reviewed 0000–0002 baseline only after that recheck, with their exact journal timestamps/checksums; a mismatch aborts rather than being stamped. An empty database follows the full historical chain normally. The public-only dump is reconciliation evidence, **not** a complete Auth/storage disaster-recovery backup.

Private evidence: `/tmp/screenpeak-igdb-task3/` contains the dump, restored-copy comparisons and preparation-rehearsal report. Public dump SHA-256: `8c2977d0a4346fad26cd103c594c37fdc379d19a32cd6422b703c1495f58a622`. Preparation 0003/0004 ran only on the local copy; hashes and counts for every original column in all 17 public tables were unchanged (including 502 games, 420 library entries, 35 reviews, 29 memberships and four profiles). No live migration, reset, journal change or catalogue write occurred.

### Tests

```bash
npm test
npm run lint
npx tsc --noEmit --incremental false -p apps/web
npx tsc --noEmit --incremental false -p apps/mobile
TEST_DATABASE_URL=postgresql://YOUR_USER@127.0.0.1:55439/YOUR_DATABASE_test \
  npm run test:igdb-integration -w @screenpeak/web
```

The catalogue integration suite creates and drops a uniquely named child database, runs historical migrations with local Auth stand-ins, and exercises preparation, concurrent imports, complete relation replacement, rollback on mapping conflicts, stale game/shared-taxonomy snapshots, browser denial even with old default grants, and guarded cleanup of populated/empty catalogue fixtures. It never falls back to the app's database URL. Cleanup tests remove obsolete RPCs only in the fixture, not as a substitute for Task 5's real rewrites. The local database copies remain disposable; the shared server can be stopped with the Task 2 command after verification.

Final Task 3 verification: 265 unit tests in 33 files and 16 Postgres integration tests in two files passed; web/mobile typechecks, web ESLint and diff whitespace checks passed. One independent read-only review found a shared-taxonomy freshness issue. Regression tests reproduced it; carrying each entity's provider timestamp and conditionally updating shared rows fixed it. The final revised preparation migration was rehearsed on a new restored copy with every original public value/count preserved again. The two-game live adapter smoke check for the added timestamp fields is recorded in the Task 3 report. No Task 4 execution began.

## Task 4 migration journal, slugs, seed and reset — owner steps

Task 4's code was exercised only on disposable local Postgres. **Nothing in this task was applied to the hosted development database.** Do not point the new commands at that database. `DATABASE_POOL_URL` is not a fallback: every command requires `--database-env NAME`, and the URL must be `127.0.0.1` / `localhost` with a database name ending in `_test` or `_copy`.

### What you run, after a backup

1. Take a real restorable backup of the hosted development database (`pg_dump` custom format, including schema). Keep it outside git. Record the git revision and the dump checksum. The in-repo `reset_backup` schema is only a rehearsal aid for a local copy; it is not that backup.
2. Restore the dump into a **new local** database whose name ends in `_copy`. Do not restore it over the hosted database. A restored Supabase dump still has auth markers, so journal, seed, reset, and audit commands need `--confirm-local-copy` after you have checked the URL is that copy and not a tunnel. `--local-auth-stubs` still refuses that dump.
3. Dry-run the journal. This only reads:

```bash
TEST_DATABASE_URL=postgresql://YOUR_USER@127.0.0.1:5432/screenpeak_copy \
  npm run migrate:journal -w @screenpeak/web -- --database-env TEST_DATABASE_URL
```

4. If the report says the baseline is `ready`, stamp 0000–0002 **without replaying them**:

```bash
TEST_DATABASE_URL=postgresql://YOUR_USER@127.0.0.1:5432/screenpeak_copy \
  npm run migrate:journal -w @screenpeak/web -- --database-env TEST_DATABASE_URL --stamp-baseline
```

5. Apply 0003, 0004 and 0005 on that copy only:

```bash
TEST_DATABASE_URL=postgresql://YOUR_USER@127.0.0.1:5432/screenpeak_copy \
  npm run migrate:journal -w @screenpeak/web -- --database-env TEST_DATABASE_URL --apply-pending
```

`--apply-pending` refuses to run while 0000–0002 are unrecorded on a database that already has tables. Do not use `drizzle-kit migrate` before the stamp: an empty journal would replay `0000`. If `games.igdb_id` or `igdb_private` already exists and the journal is empty, restore a fresh copy and start again. Do not stamp over that partial state.

An empty local database (no `public` tables) can run the whole chain in one step. Pass `--local-auth-stubs` only on that empty local cluster, never on a Supabase copy:

```bash
npm run migrate:journal -w @screenpeak/web -- --database-env TEST_DATABASE_URL --apply-pending --local-auth-stubs
```

6. Optional catalogue seed, still on the local copy. It upserts games in batches of 50 and does not clear library rows, reviews, lists, or accounts. `--top` defaults to 2000 and must be from 1 to 5000. Ranking is `rating_count`, then `rating`, then id, and only `game_type = 0`. A full rating-count page is finished by id, so a tie cannot skip rows. Requests go through the shared limiter, so 0003 must already be applied and `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` must be set. A failed batch leaves earlier batches committed and prints the remaining IGDB ids. Re-run with `--resume` to skip ids already stored. Upserts without `--resume` are also safe to repeat. Add `--confirm-local-copy` when the database has Supabase dump markers.

```bash
npm run seed:igdb -w @screenpeak/web -- --database-env TEST_DATABASE_URL --top 2000
npm run seed:igdb -w @screenpeak/web -- --database-env TEST_DATABASE_URL --ids 1942,19560
npm run seed:igdb -w @screenpeak/web -- --database-env TEST_DATABASE_URL --ids 1942,19560 --resume
```

7. Reset rehearsal on the copy. Stop every app and writer first. `--write-manifest` stores the fingerprint of every deleted and retained row (catalogue, library, reviews, list memberships, favourites, generated Loadout text, accounts, lists, follows, likes, and Steam links) plus the dry-run counts. Without `--apply` the command only prints the loss report, including `writing` (games that would be inserted) and `blocked` when the manifest is empty or implausibly small.

```bash
npm run reset:catalog -w @screenpeak/web -- --database-env TEST_DATABASE_URL --staged staged.json --write-manifest manifest.json
npm run reset:catalog -w @screenpeak/web -- --database-env TEST_DATABASE_URL --manifest manifest.json
npm run reset:catalog -w @screenpeak/web -- --database-env TEST_DATABASE_URL --manifest manifest.json --apply --confirm-before-task-6
```

`--apply` requires `--confirm-before-task-6` because Steam import still reads `games.steam_appid` as a fallback until Task 6; new rows are matched from `game_external_ids`. Do not pass that flag against the database the app serves. An empty manifest over an existing catalogue is refused unless you also pass `--allow-empty`. Replacing 25 or more games with fewer than 25 and fewer than 10% of the current count is refused unless you also pass `--allow-small`. Apply copies the catalogue into a new `reset_backup` schema (`reset_backup`, then `reset_backup_2`, and so on) and does not drop an earlier copy.

A committed manifest cannot be applied again. Inserting a library row, review, or list membership after the manifest was written makes `--apply` refuse, as does changing a retained username, list, follow, like, favourite, or Steam link. Shared Steam app ids inside the staged batch are omitted before `writeCatalogGame`; a direct write that still carries a foreign app id throws and rolls the transaction back.

8. Repeat the stamp, apply, seed, and reset on a second local restore if the first rehearsal found anything. Only then, with the app stopped and a fresh `pg_dump` in hand, run the same commands against a tunnelled copy you control. This repository does not contain that hosted URL, and this task did not open one.

### Slug and cache rules now in the writer

New game URLs use the sanitized provider slug. If that slug is taken, the row's own `games.id` is appended. The suffix does not contain `igdb`. Genres, platforms, developers and publishers have unique slugs; a collision is stored as `igdb-<igdbId>`. A payload with no `providerUpdatedAt` does not replace a stored snapshot. `writeSteamMatchCache` inserts a no-match or ambiguous row only after HTTP 200. HTTP 401 and 429 insert nothing. Steam import (Task 6) must call that helper rather than writing the cache table itself.

### Mobile images

Expo Image on SDK 57 has no remote-host allowlist. An `https://images.igdb.com/...` URL is a normal image source, and `apps/mobile/app.json` does not name hosts. No mobile config change was required. Next.js `images.remotePatterns` is still Task 7.

### Verification on this branch

Disposable local Postgres only (`screenpeak_igdb_test` on 127.0.0.1). `npm test` — 276 tests in 35 files. `npm run test:igdb-integration` — 35 tests in 3 files (catalogue migration, catalogue reset, request budget). `npm run lint` passed. `npm run build` completed with placeholder `R2_PUBLIC_URL`, Supabase, and `DATABASE_POOL_URL` values pointed at that local test database. No hosted Supabase connection was opened.
