# IGDB Task 3 implementation and inspection report

Task 2 was committed as `ec777ed` and merged with `--no-ff` into `igdb-integration` at `17fb501`. Task 3 was implemented on `codex/igdb-task-3`, based on that merge. Main remains at `67cd69e7030cb51c43a3672119606cf0af2cc8d2`; nothing was pushed. The pre-existing build-plan.md edits and private docs/audit-igdb.txt were excluded from both tasks.

## Result

Preparation schema and transactional ingestion are implemented. Existing rows keep their RAWG identity until the explicit reset. New writes use real IGDB identities and fresh UUIDs, replace complete relation/mapping sets atomically, and reject conflicting Steam mappings. The normal import API does not reset user data. The schema includes versioned match-cache and private reset-completion storage for later tasks.

The final column cleanup is a guarded, unjournaled cutover draft. It requires valid IGDB IDs and updated RPCs; no data deletion or CASCADE is hidden in it. Task 5 supplies real RPC replacements; Task 8 journals/applies cleanup and removes the transitional TypeScript schema fields. No live migration or reset has been performed.

## Verification

- 265 unit tests in 33 files passed.
- 16 real-Postgres integration tests in two files passed (12 catalogue, four shared-budget).
- Web and mobile typechecks, web ESLint and diff whitespace checks passed.
- A fresh read-only development public dump was compared with an isolated historical 0000–0002 chain: 95 columns, 57 constraints, 27 indexes, 37 policies, 17 RLS flags, two public triggers and 26 application functions match. The Auth profile-creation trigger was separately confirmed. Managed extension/helper differences were retained; no migration journals were stamped.
- Preparation 0003/0004 was rehearsed on an isolated development copy, then repeated on a new copy after the review fix. Every original public-table column value and count across all 17 tables remained unchanged.
- Two live IGDB game hydrations validated the added taxonomy timestamps: two games, 29 taxa, all 29 carrying their own source timestamp; six IGDB calls and one OAuth request succeeded. Only private local request-budget state was written, with no catalogue writes. Entity timestamps are documented in the [IGDB reference](https://api-docs.igdb.com/).
- One independent read-only Sol review found a shared-taxonomy regression. New normalization and cross-game database tests failed first; source timestamps and conditional taxonomy updates fixed it. The complete suites/typechecks/lint passed afterward.

Private local reconciliation artifacts are under `/tmp/screenpeak-igdb-task3/`; they contain test data and are not committed. The public dump is not a full Auth/storage backup. The migration strategy and reproduction commands are in the runbook.

## Decisions made

1. Work in the existing checkout on the explicitly requested task branch, without a new worktree or dependency installation. This follows the user's workflow; isolation is at the branch and local test-database level.
2. Keep final column removal outside the migration journal until Task 5/8 can coordinate RPC and consumer cleanup. Cost: final numbering and application remain later work; running it prematurely is explicitly refused.
3. Always suffix game slugs with `-igdb-ID` so import order and same-name concurrency cannot choose or rename URLs. Cost: slightly longer URLs.
4. Temporarily permit null `rawg_id` in the unshipped game-detail contract to reflect preparation honestly. Cost: this intermediate contract must not be shipped separately; Task 5 removes the field.

The reviewer set aside existing game-page/API error propagation (Task 7), reset execution/replay protection (Task 4), and RPC replacement/live cutover (Tasks 5/8). These remain assigned to those later tasks; the new writer already propagates errors, stores private completion state and supplies guarded cleanup. No minor findings were deferred.

## Task 3 created files

- [apps/web/db/migrations/0004_igdb_catalog_preparation.sql](/Users/stevenhorn/workspace/screenpeak/apps/web/db/migrations/0004_igdb_catalog_preparation.sql)
- [apps/web/db/cutover/igdb-catalog-cleanup.sql](/Users/stevenhorn/workspace/screenpeak/apps/web/db/cutover/igdb-catalog-cleanup.sql)
- [apps/web/lib/catalog/upsert.ts](/Users/stevenhorn/workspace/screenpeak/apps/web/lib/catalog/upsert.ts)
- [apps/web/test/lib/catalog/upsert.test.ts](/Users/stevenhorn/workspace/screenpeak/apps/web/test/lib/catalog/upsert.test.ts)
- [apps/web/test/integration/catalog-migration.integration.ts](/Users/stevenhorn/workspace/screenpeak/apps/web/test/integration/catalog-migration.integration.ts)
- [docs/igdb-task-3-report.md](/Users/stevenhorn/workspace/screenpeak/docs/igdb-task-3-report.md)

## Task 3 changed files

- [apps/web/db/schema.ts](/Users/stevenhorn/workspace/screenpeak/apps/web/db/schema.ts)
- [apps/web/db/relations.ts](/Users/stevenhorn/workspace/screenpeak/apps/web/db/relations.ts)
- [apps/web/db/migrations/meta/_journal.json](/Users/stevenhorn/workspace/screenpeak/apps/web/db/migrations/meta/_journal.json)
- [apps/web/lib/catalog/types.ts](/Users/stevenhorn/workspace/screenpeak/apps/web/lib/catalog/types.ts)
- [apps/web/lib/igdb/schema.ts](/Users/stevenhorn/workspace/screenpeak/apps/web/lib/igdb/schema.ts)
- [apps/web/lib/igdb/normalize.ts](/Users/stevenhorn/workspace/screenpeak/apps/web/lib/igdb/normalize.ts)
- [apps/web/test/lib/igdb/normalize.test.ts](/Users/stevenhorn/workspace/screenpeak/apps/web/test/lib/igdb/normalize.test.ts)
- [apps/web/test/README.md](/Users/stevenhorn/workspace/screenpeak/apps/web/test/README.md)
- [apps/web/vitest.igdb-integration.config.mts](/Users/stevenhorn/workspace/screenpeak/apps/web/vitest.igdb-integration.config.mts)
- [packages/shared/api/games.ts](/Users/stevenhorn/workspace/screenpeak/packages/shared/api/games.ts)
- [docs/igdb-migration-runbook.md](/Users/stevenhorn/workspace/screenpeak/docs/igdb-migration-runbook.md)
- [docs/superpowers/plans/2026-10-06-rawg-to-igdb.md](/Users/stevenhorn/workspace/screenpeak/docs/superpowers/plans/2026-10-06-rawg-to-igdb.md)

## Task 2 created files

- [apps/web/db/migrations/0003_igdb_request_budget.sql](/Users/stevenhorn/workspace/screenpeak/apps/web/db/migrations/0003_igdb_request_budget.sql)
- [apps/web/lib/catalog/types.ts](/Users/stevenhorn/workspace/screenpeak/apps/web/lib/catalog/types.ts)
- [apps/web/lib/igdb/auth.ts](/Users/stevenhorn/workspace/screenpeak/apps/web/lib/igdb/auth.ts)
- [apps/web/lib/igdb/client.ts](/Users/stevenhorn/workspace/screenpeak/apps/web/lib/igdb/client.ts)
- [apps/web/lib/igdb/http.ts](/Users/stevenhorn/workspace/screenpeak/apps/web/lib/igdb/http.ts)
- [apps/web/lib/igdb/normalize.ts](/Users/stevenhorn/workspace/screenpeak/apps/web/lib/igdb/normalize.ts)
- [apps/web/lib/igdb/provider.ts](/Users/stevenhorn/workspace/screenpeak/apps/web/lib/igdb/provider.ts)
- [apps/web/lib/igdb/schema.ts](/Users/stevenhorn/workspace/screenpeak/apps/web/lib/igdb/schema.ts)
- [apps/web/lib/queries/igdb-budget.ts](/Users/stevenhorn/workspace/screenpeak/apps/web/lib/queries/igdb-budget.ts)
- [apps/web/scripts/audit-igdb-adapter.ts](/Users/stevenhorn/workspace/screenpeak/apps/web/scripts/audit-igdb-adapter.ts)
- [apps/web/test/integration/igdb-budget-worker.ts](/Users/stevenhorn/workspace/screenpeak/apps/web/test/integration/igdb-budget-worker.ts)
- [apps/web/test/integration/igdb-budget.integration.ts](/Users/stevenhorn/workspace/screenpeak/apps/web/test/integration/igdb-budget.integration.ts)
- [apps/web/test/lib/igdb/auth.test.ts](/Users/stevenhorn/workspace/screenpeak/apps/web/test/lib/igdb/auth.test.ts)
- [apps/web/test/lib/igdb/client.test.ts](/Users/stevenhorn/workspace/screenpeak/apps/web/test/lib/igdb/client.test.ts)
- [apps/web/test/lib/igdb/normalize.test.ts](/Users/stevenhorn/workspace/screenpeak/apps/web/test/lib/igdb/normalize.test.ts)
- [apps/web/test/lib/igdb/provider.test.ts](/Users/stevenhorn/workspace/screenpeak/apps/web/test/lib/igdb/provider.test.ts)
- [apps/web/vitest.igdb-integration.config.mts](/Users/stevenhorn/workspace/screenpeak/apps/web/vitest.igdb-integration.config.mts)

## Task 2 changed files

- [apps/web/db/migrations/meta/_journal.json](/Users/stevenhorn/workspace/screenpeak/apps/web/db/migrations/meta/_journal.json)
- [apps/web/db/schema.ts](/Users/stevenhorn/workspace/screenpeak/apps/web/db/schema.ts)
- [apps/web/drizzle.config.ts](/Users/stevenhorn/workspace/screenpeak/apps/web/drizzle.config.ts)
- [apps/web/package.json](/Users/stevenhorn/workspace/screenpeak/apps/web/package.json)
- [apps/web/test/README.md](/Users/stevenhorn/workspace/screenpeak/apps/web/test/README.md)
- [docs/igdb-migration-runbook.md](/Users/stevenhorn/workspace/screenpeak/docs/igdb-migration-runbook.md)
- [docs/superpowers/plans/2026-10-06-rawg-to-igdb.md](/Users/stevenhorn/workspace/screenpeak/docs/superpowers/plans/2026-10-06-rawg-to-igdb.md)
