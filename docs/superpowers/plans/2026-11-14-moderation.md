# Moderation: Report and Block Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in player report a review, a list's name/description, or a profile's username/bio/avatar (recorded durably and emailed to `support@screenpeak.gg`), and block another user (removing/preventing a follow relationship, with no content hiding and no notification to the blocked user) — on web and mobile together, satisfying Apple Guideline 1.2.

**Architecture:** Two new Drizzle-bypasses-RLS tables (`reports`, `blocks`), locked down the same way `push_tokens`/`steam_link_intents` already are (`.enableRLS()`, no permissive policies — app code is the only caller, there is no PostgREST path to them). `blockUser` integrates directly into the existing `followUser` (silent no-op between blocked parties, matching the no-notification anti-goal). Report gets its own dedicated, much tighter rate-limit bucket (`consumeApiRateLimit` under a new `report:<reporterId>` key) separate from the shared write budget. New transactional email (Resend) sends the report notice; the DB row always lands even if the email send fails.

**Tech Stack:** Next.js 16 Server Actions + Route Handlers, Drizzle ORM, Postgres, Resend (new dependency), React Native / Expo Router.

**Spec:** [docs/superpowers/specs/2026-11-14-moderation-design.md](../specs/2026-11-14-moderation-design.md)

## Global Constraints

- Block semantics: one-directional initiation, symmetric effect (either party already following the other loses that follow; neither can follow the other again until unblocked). No content hiding anywhere. No notification to the blocked user, ever — a `followUser` call between blocked parties is a **silent no-op**, never a visible error.
- Report: signed-in only, rate-limited on its own tight bucket (not the shared 60/60s write budget), reporter identity always included (never anonymous), writes a DB row **and** emails `support@screenpeak.gg` — both happen, and an email-provider outage must not drop the DB row.
- `reports.target_type` is `review` | `list` | `profile` (not a separate type per username/bio/avatar — those are `reason` values under `profile`), with a polymorphic `target_id`.
- `blocks`/`reports` follow the Drizzle-bypasses-RLS model: ownership/authorization checks live in the query functions and route handlers, not in Postgres policies.
- Both the web Server Action and the mobile `/api/v1` route must call their rate limiter explicitly for block/unblock/report — `test/api/v1-routes-auth.test.ts` only scans `app/api/v1/`, and the existing `followUser` web path has no rate limit today, so this needs a new, explicit test rather than relying on the existing one to generalize.
- Ship web and mobile together — no task in this plan is "done" until both platforms' UI tasks for it land.

## Review Focus

- Blocking someone you already follow (or who already follows you) actually removes the existing follow row in both directions, not just prevents a new one (Task 3).
- After A blocks B, a `followUser(B, A)` or `followUser(A, B)` call is a silent no-op — no thrown error, no row inserted, no push notification — in both directions (Task 3).
- A `report` row is still written when the Resend call throws, times out, or the API key is missing/invalid (Task 5, Task 6).
- A report targeting a review/list/user id that doesn't exist (already deleted, or never existed) is rejected with a 400/404, not written as an orphaned row with no FK to catch it, since `target_id` is intentionally polymorphic/unconstrained (Task 4, Task 7).
- Report rate limiting actually blocks the 6th report in an hour from the same reporter against the same or a different target (single-digit-per-hour budget is per-reporter, not per-reporter-per-target) — and this is enforced on *both* the web Server Action and the mobile route, not just one (Task 2, Task 7, Task 8).

---

## Task 1: `blocks` and `reports` tables

**Files:**
- Modify: `apps/web/db/schema.ts`
- Create: `apps/web/db/migrations/0014_blocks_and_reports.sql`
- Modify: `apps/web/db/migrations/meta/_journal.json`

**Interfaces:**
- Produces: `blocks` table (`blockerId`, `blockedId`, `createdAt`), `reports` table (`id`, `reporterId`, `targetType`, `targetId`, `reason`, `details`, `createdAt`) — Drizzle exports `blocks`, `reports` from `@/db/schema`, consumed by Task 3 and Task 4.

- [ ] **Step 1: Add both tables to `apps/web/db/schema.ts`**

```ts
export const blocks = pgTable('blocks', {
    blockerId: uuid('blocker_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    blockedId: uuid('blocked_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, table => [
    primaryKey({ columns: [table.blockerId, table.blockedId] }),
    check('blocks_check', sql`${table.blockerId} <> ${table.blockedId}`),
]).enableRLS()

export const reports = pgTable('reports', {
    id: uuid().defaultRandom().primaryKey(),
    reporterId: uuid('reporter_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    targetType: text('target_type').notNull(),
    targetId: uuid('target_id').notNull(),
    reason: text().notNull(),
    details: text(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, table => [
    index('reports_reporter_id_idx').on(table.reporterId),
    check('reports_target_type_check', sql`${table.targetType} in ('review', 'list', 'profile')`),
    check('reports_reason_length', sql`char_length(${table.reason}) between 1 and 200`),
    check('reports_details_length', sql`char_length(coalesce(${table.details}, '')) <= 2000`),
]).enableRLS()
```

Place both beside `pushTokens` at the bottom of the file, following that table's comment style (one line on why it's locked down: no PostgREST path, app code is the only caller — same reasoning as `push_tokens`/`steam_link_intents`, *not* `follows`' public-read-policy precedent, since those predate the Drizzle-bypasses-RLS rearchitecture and `blocks`/`reports` don't need to repeat that now-stale pattern).

`target_id` is deliberately not a foreign key (it addresses a review, a list, or a user depending on `target_type`) — the Review Focus item about a report against a nonexistent target is handled in Task 4/7's application code, not a DB constraint.

- [ ] **Step 2: Write the migration SQL**

`0014_blocks_and_reports.sql` — the `CREATE TABLE` statements Drizzle-kit would generate for the two tables above, plus `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` for both (no `CREATE POLICY` statements). Use `0013_push_tokens.sql` as the structural template for formatting.

- [ ] **Step 3: Add the journal entry**

Append to `apps/web/db/migrations/meta/_journal.json`'s `entries` array: `{ "idx": 14, "version": "7", "when": <a timestamp greater than entry 13's>, "tag": "0014_blocks_and_reports", "breakpoints": true }`.

- [ ] **Step 4: Apply the migration locally and verify**

```bash
npm run migrate:journal -w @screenpeak/web -- --database-env LOCAL_DATABASE_URL --apply-pending
psql "$LOCAL_DATABASE_URL" -c "\d blocks" -c "\d reports"
```

Expected: both tables exist with the columns/constraints above.

- [ ] **Step 5: Commit**

```bash
git add apps/web/db/schema.ts apps/web/db/migrations/0014_blocks_and_reports.sql apps/web/db/migrations/meta/_journal.json
git commit -m "feat: add blocks and reports tables"
```

---

## Task 2: Dedicated report rate-limit bucket

**Files:**
- Modify: `apps/web/lib/rate-limit.ts`
- Test: `apps/web/test/lib/rate-limit.test.ts` (extend if it exists, else create `apps/web/test/lib/report-rate-limit.test.ts`)

**Interfaces:**
- Produces: `export const REPORT_RATE_LIMIT = 5`, `export const REPORT_RATE_WINDOW_SECONDS = 3600`, `export async function consumeReportRateLimit(reporterId: string): Promise<void>` — consumed by Task 4 (report query function is not the right layer for this — it belongs at the Server Action / route layer, same as `consumeWriteRateLimit` is called by actions/routes rather than by `lib/queries/*`), Task 7, Task 8.

- [ ] **Step 1: Write the failing test**

Mirror however the existing `consumeWriteRateLimit`/`consumeSearchRateLimit` are tested (check for an existing `rate-limit.test.ts` first and match its mocked-`db` style). Assert `consumeReportRateLimit(id)` calls `consumeApiRateLimit` with bucket `report:<id lowercased>`, limit `5`, window `3600`.

- [ ] **Step 2: Run to verify it fails**

- [ ] **Step 3: Implement `consumeReportRateLimit`**

```ts
export const REPORT_RATE_LIMIT = 5
export const REPORT_RATE_WINDOW_SECONDS = 3600

export async function consumeReportRateLimit(reporterId: string): Promise<void> {
    await consumeApiRateLimit(`report:${reporterId.toLowerCase()}`, REPORT_RATE_LIMIT, REPORT_RATE_WINDOW_SECONDS)
}
```

(Per-reporter, not per-reporter-per-target, per the Review Focus item — a single bucket keyed only on the reporter id, reused regardless of what they're reporting.)

- [ ] **Step 4: Run to verify it passes**

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/rate-limit.ts apps/web/test/lib/report-rate-limit.test.ts
git commit -m "feat: add a dedicated report rate-limit bucket"
```

---

## Task 3: Block query functions, integrated into `followUser`

**Files:**
- Modify: `apps/web/lib/queries/user.ts`
- Test: `apps/web/test/lib/queries/block.test.ts` (new)
- Test: `apps/web/test/lib/queries/follow-notifies.test.ts` (extend — the no-op-when-blocked case belongs beside the existing follow-notification tests)

**Interfaces:**
- Consumes: `blocks`, `follows`, `users` from `@/db/schema`; `db` from `@/lib/db`.
- Produces: `export async function blockUser(blockerId: string, blockedId: string): Promise<void>`, `export async function unblockUser(blockerId: string, blockedId: string): Promise<void>`, `export async function isBlockedEitherWay(a: string, b: string): Promise<boolean>`, `export async function getBlockedUsers(blockerId: string): Promise<{ id: string, username: string, avatar_url: string | null }[]>` — and a modified `followUser` that no-ops when blocked. Consumed by Task 7 (routes), Task 8 (web action).

- [ ] **Step 1: Write the failing tests**

```ts
// block.test.ts
it('blockUser inserts the block row and removes any existing follow in either direction', async () => {
  await blockUser(A, B)
  // assert the blocks insert happened and the follows delete's where-clause covers
  // (follower=A,following=B) OR (follower=B,following=A)
})

it('unblockUser deletes the block row scoped to the blocker', async () => {
  await unblockUser(A, B)
})

it('isBlockedEitherWay is true whichever direction the block was made', async () => {
  // mock one blocks row (blockerId=A, blockedId=B); assert true for (A,B) and (B,A)
})

it('getBlockedUsers returns the blocker\'s blocked users, not who blocked them', async () => {
})
```

```ts
// follow-notifies.test.ts addition
it('followUser is a silent no-op between blocked parties, in either direction', async () => {
  // mock isBlockedEitherWay (or its underlying db call) to resolve true
  await followUser(A, B)
  expect(insertSpy).not.toHaveBeenCalled()
  await followUser(B, A)
  expect(insertSpy).not.toHaveBeenCalled()
  expect(sendPushNotification).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run both to verify they fail**

- [ ] **Step 3: Implement**

`blockUser`: `db.insert(blocks).values({ blockerId, blockedId }).onConflictDoNothing()`, then `db.delete(follows).where(or(and(eq(follows.followerId, blockerId), eq(follows.followingId, blockedId)), and(eq(follows.followerId, blockedId), eq(follows.followingId, blockerId))))` — both in one `db.transaction`. `unblockUser`: `db.delete(blocks).where(and(eq(blocks.blockerId, blockerId), eq(blocks.blockedId, blockedId)))`. `isBlockedEitherWay`: one `exists(...)`-style query checking both `(blockerId=a,blockedId=b)` and `(blockerId=b,blockedId=a)`. `getBlockedUsers`: join `blocks` to `users` on `blockedId`, filtered by `blockerId`.

Modify `followUser` (currently `apps/web/lib/queries/user.ts:304`) to check `isBlockedEitherWay(followerId, followingId)` first and return immediately (before the insert) if true — no error, no notification, matching the exact shape of any other silently-ignored call in this file.

Self-block (`blockerId === blockedId`) is rejected at the route/action layer, the same way self-follow is checked in `app/api/v1/user/[username]/follow/route.ts`'s `targetId()` helper, not inside `blockUser` itself — the DB `CHECK` constraint from Task 1 is the backstop.

- [ ] **Step 4: Run both to verify they pass**

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/queries/user.ts apps/web/test/lib/queries/block.test.ts apps/web/test/lib/queries/follow-notifies.test.ts
git commit -m "feat: add block/unblock queries and make followUser a no-op when blocked"
```

---

## Task 4: Report query function and shared types

**Files:**
- Create: `apps/web/lib/queries/report.ts`
- Modify: `packages/shared/schemas.ts`
- Modify: `packages/shared/constants.ts`
- Modify: `packages/shared/api/moderation.ts` (new file)
- Test: `apps/web/test/lib/queries/report.test.ts` (new)

**Interfaces:**
- Produces:
  - `packages/shared/constants.ts`: `export const REPORT_REASONS: Record<'review' | 'list' | 'profile', readonly string[]>` — `review: ['Inappropriate language', 'Harassment or hate speech', 'Spam', 'Other']`, `list: ['Inappropriate list name', 'Inappropriate list description', 'Spam', 'Other']`, `profile: ['Inappropriate username', 'Inappropriate bio', 'Inappropriate avatar', 'Harassment or hate speech', 'Other']`.
  - `packages/shared/schemas.ts`: `export const reportTargetTypeSchema = z.enum(['review', 'list', 'profile'])` and `export const reportSchema = z.object({ targetType: reportTargetTypeSchema, targetId: uuidIdSchema, reason: z.string().trim().min(1, 'Choose a reason.').max(200, 'Reason is limited to 200 characters.'), details: z.string().max(2000, 'Details are limited to 2000 characters.').optional() }).strict()`.
  - `packages/shared/api/moderation.ts`: `export type ReportInput = z.infer<typeof reportSchema>` (re-exported type only — this file stays dependency-free like the rest of `api/*`, so define the plain type shape here rather than importing zod; see Step 1), `export type BlockedUser = { id: string, username: string, avatar_url: string | null }`, `export type BlockedUsersPage = { users: BlockedUser[] }`.
  - `apps/web/lib/queries/report.ts`: `export async function createReport(input: { reporterId: string, targetType: 'review' | 'list' | 'profile', targetId: string, reason: string, details?: string }): Promise<void>` — throws on a foreign-key violation (unknown `targetId` for the given `targetType`, checked against the matching table before the insert, since there's no DB FK) or any other DB error. Consumed by Task 6 (email), Task 7 (route), Task 8 (web action).

- [ ] **Step 1: Add the shared constant, schema, and types**

In `packages/shared/api/moderation.ts`, write `ReportInput` as a plain object type (not `z.infer`) to keep this file zod-free: `export type ReportInput = { targetType: 'review' | 'list' | 'profile', targetId: string, reason: string, details?: string }`. `reportSchema` in `schemas.ts` validates against this same shape.

- [ ] **Step 2: Write the failing test for `createReport`**

```ts
it('rejects a targetId that does not exist for the given targetType', async () => {
  // mock the existence check (select from reviews/lists/users by id) to return no row
  await expect(createReport({ reporterId: R, targetType: 'review', targetId: MISSING, reason: 'Spam' }))
    .rejects.toThrow(/not found/i)
})

it('writes a reports row for a valid target', async () => {
  // mock the existence check to return a row, then assert db.insert(reports).values(...) was called
  // with reporterId, targetType, targetId, reason, details
})
```

- [ ] **Step 3: Run to verify it fails**

- [ ] **Step 4: Implement `createReport`**

Before inserting, check the target exists in the table `targetType` names (`ratingsReviews`, `lists`, or `users` respectively) by id — a cheap `select id ... limit 1`, not a join, since there's no FK to lean on. If missing, throw a distinguishable error (e.g. `new Error('target_not_found')`) the route layer (Task 7) maps to 404. Otherwise `db.insert(reports).values({...})`.

- [ ] **Step 5: Run to verify it passes**

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/queries/report.ts packages/shared/schemas.ts packages/shared/constants.ts packages/shared/api/moderation.ts apps/web/test/lib/queries/report.test.ts
git commit -m "feat: add createReport and the shared report schema/types"
```

---

## Task 5: Resend email integration

**Files:**
- Create: `apps/web/lib/email.ts`
- Modify: `apps/web/package.json` (add `resend` dependency)
- Modify: `apps/web/AGENTS.md`'s Env Vars section would normally get `RESEND_API_KEY` added — this repo's env var docs live in the root `AGENTS.md`'s Env Vars section; add it there.
- Test: `apps/web/test/lib/email.test.ts` (new)

**Interfaces:**
- Produces: `export async function sendReportEmail(report: { reporterUsername: string, targetType: 'review' | 'list' | 'profile', reason: string, details: string | null, link: string }): Promise<{ ok: true } | { ok: false, error: string }>` — never throws; consumed by Task 8 (the Server Action / route decides whether a failure here is fatal — it isn't, per the Global Constraints).

- [ ] **Step 1: Add the `resend` dependency**

```bash
cd apps/web && npm install resend
```

- [ ] **Step 2: Write the failing test**

Mock the `resend` package's `Resend` class (`vi.mock('resend', ...)`). Assert: a successful send resolves `{ ok: true }`; a thrown/rejected send resolves `{ ok: false, error: '...' }` (never rejects); a missing `RESEND_API_KEY` env var also resolves `{ ok: false, error: '...' }` without throwing (read at call time, same as `lib/r2.ts`'s `requireEnv` pattern, but caught here rather than propagated — this function's whole contract is "never throws").

- [ ] **Step 3: Run to verify it fails**

- [ ] **Step 4: Implement `sendReportEmail` in `apps/web/lib/email.ts`**

Read `RESEND_API_KEY` at call time (not module load — same reasoning `lib/r2.ts:16-18` documents: a missing key must not take down whatever else shares this module's import graph). Build a plain-text (not templated — see "What's left to the builder" in the design doc; plain text is the simpler default and nothing in the design doc asks for HTML) email to `support@screenpeak.gg` containing the reporter's username, the reason, the details, and the direct link. Wrap the whole thing in try/catch; return `{ ok: false, error }` on any failure instead of throwing.

- [ ] **Step 5: Run to verify it passes**

- [ ] **Step 6: Add `RESEND_API_KEY` to the root `AGENTS.md`'s Env Vars list, then commit**

```bash
git add apps/web/lib/email.ts apps/web/package.json package-lock.json AGENTS.md apps/web/test/lib/email.test.ts
git commit -m "feat: add Resend-backed report email notifications"
```

---

## Task 6: Wire email into report creation without losing the DB row on failure

**Files:**
- Modify: `apps/web/lib/queries/report.ts` (or wherever `createReport`'s caller sits — see decision below)

**Interfaces:**
- Produces: a single entry point both the route (Task 7) and the web action (Task 8) call, so the "DB row survives an email outage" behavior isn't duplicated in two places.

Decide once, here, rather than in both callers: should the DB-write-then-best-effort-email sequencing live inside `createReport` itself, or in a thin wrapper both the route and the action call? Put it in `createReport` itself — `lib/queries/report.ts` already owns the write, and co-locating "write, then best-effort notify" keeps both call sites (Task 7, Task 8) trivial and identical, the same way `followUser`/`likeList` already bundle their own push-notification side effect rather than making every caller remember to trigger it.

- [ ] **Step 1: Write the failing test**

```ts
it('still records the report when the email send fails', async () => {
  sendReportEmail.mockResolvedValueOnce({ ok: false, error: 'network' })
  await createReport({ reporterId: R, targetType: 'review', targetId: EXISTING, reason: 'Spam' })
  expect(insertSpy).toHaveBeenCalled() // the row was written regardless
})
```

- [ ] **Step 2: Run to verify it fails** (today `createReport` doesn't call email at all)

- [ ] **Step 3: Implement**

After the insert succeeds, call `sendReportEmail(...)` and ignore (log, don't throw on) a `{ ok: false }` result. Build the `link` field from `targetType`/`targetId` — review → the game page the review is on (needs a lookup; reuse an existing query rather than adding a new one if one already maps a review id to its game slug — check `lib/queries/review.ts` first), list → the list's page (`/user/<owner>/lists/<id>`), profile → `/user/<username>`.

- [ ] **Step 4: Run to verify it passes**

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/queries/report.ts apps/web/test/lib/queries/report.test.ts
git commit -m "feat: send a best-effort report email without risking the DB row"
```

---

## Task 7: `/api/v1` routes — block, unblock, blocked list, report

**Files:**
- Create: `apps/web/app/api/v1/user/[username]/block/route.ts`
- Create: `apps/web/app/api/v1/me/blocked/route.ts`
- Create: `apps/web/app/api/v1/reports/route.ts`
- Modify: `packages/shared/api/writes.ts` (add `BlockResult`)
- Test: `apps/web/test/api/moderation-routes.test.ts` (new)

**Interfaces:**
- Consumes: `blockUser`, `unblockUser`, `getBlockedUsers`, `userExists` (Task 3); `createReport` (Task 4, Task 6); `consumeWriteRateLimit`, `consumeReportRateLimit` (Task 2); `requireBearerUser`, `withAuth`, `ApiError`, `jsonPrivate`, `uuidParam`, `parseBody`, `reportSchema`.
- Produces: `POST`/`DELETE /api/v1/user/[username]/block`, `GET /api/v1/me/blocked`, `POST /api/v1/reports` — consumed by Task 9 (client), Task 12/13 (mobile UI).

- [ ] **Step 1: Write the failing tests**

Mirror `test/lib/search.test.ts`... no — mirror the structure of `app/api/v1/user/[username]/follow/route.ts`'s own (uninspected-but-inferable) test, or `test/api/v1-routes-auth.test.ts`'s expectations for a write route: `POST`/`DELETE` call `requireBearerUser` and `consumeWriteRateLimit`; a self-block is 400; blocking a nonexistent user is 404. For `POST /api/v1/reports`: `requireBearerUser` and `consumeReportRateLimit` (not `consumeWriteRateLimit`); a 6th call within the window from the same reporter is 429 (assert `consumeReportRateLimit` was actually called, and that a rejected promise from it short-circuits before `createReport`); an unknown `targetId` is 404 (propagated from Task 4's `target_not_found` error, mapped by this route). For `GET /api/v1/me/blocked`: `requireBearerUser`, no write-budget spend.

- [ ] **Step 2: Run to verify they fail**

- [ ] **Step 3: Implement the three route files**

`block/route.ts`: copy `follow/route.ts`'s structure — `targetId()` helper rejects self-block and a missing user the same way, `POST` calls `requireBearerUser` → `consumeWriteRateLimit` → `blockUser`, `DELETE` → `unblockUser`, both return `{ blocked: true/false } satisfies BlockResult`.

`me/blocked/route.ts`: `requireBearerUser` (no write-budget call — this is a read, same as `GET /api/v1/me/library/[gameId]`), `getBlockedUsers(user.id)`, `Response.json({ users: [...] } satisfies BlockedUsersPage, PRIVATE)`.

`reports/route.ts`: `requireBearerUser` → `parseBody(reportSchema, await readJson(req))` → `consumeReportRateLimit(user.id)` → look up the reporter's username (needed for the email; reuse `getProfileById` or similar rather than adding a new query) → `createReport({ reporterId: user.id, ...parsed })`, catching a `target_not_found` error from Task 4/6 into `ApiError(404, 'not_found', ...)` → `jsonPrivate({ ok: true })`.

- [ ] **Step 4: Run to verify they pass**

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/v1/user/[username]/block apps/web/app/api/v1/me/blocked apps/web/app/api/v1/reports packages/shared/api/writes.ts apps/web/test/api/moderation-routes.test.ts
git commit -m "feat: add block, unblock, blocked-list, and report API routes"
```

---

## Task 8: Web Server Actions, with explicit rate limiting

**Files:**
- Modify: `apps/web/app/user-actions.ts`
- Create: `apps/web/app/report-actions.ts`
- Test: `apps/web/test/app/moderation-actions-rate-limit.test.ts` (new — this is the Global Constraints item: a cross-cutting static check that both the web action and the `/api/v1` route rate-limit block/report, since the existing `v1-routes-auth.test.ts` only scans `app/api/v1/`)

**Interfaces:**
- Produces: `export async function toggleBlock(targetUserId: string, isBlocked: boolean)` (in `user-actions.ts`, mirroring `toggleFollow`'s shape exactly — but unlike `toggleFollow`, this **must** call `consumeWriteRateLimit(user.id)` itself, since this web action path has no other enforcement); `export async function submitReport(input: ReportInput): Promise<{ error: string | null }>` (new `report-actions.ts`, calling `consumeReportRateLimit(user.id)` before `createReport`). Consumed by Task 11 (web block UI), Task 10 (web report UI).

- [ ] **Step 1: Write the failing tests**

For `toggleBlock`: assert `requireUser` → `consumeWriteRateLimit(user.id)` → `blockUser`/`unblockUser`, and that a rejected rate-limit call prevents the block/unblock call. For `submitReport`: assert `requireUser` → `consumeReportRateLimit(user.id)` → `createReport`, same short-circuit-on-reject behavior; a schema-invalid input returns `{ error: '...' }` without calling either.

For the cross-cutting static test: write it as a small TypeScript-AST scan (reuse the `callsName`/`namedImport` style already in `v1-routes-auth.test.ts`, or import and reuse those helpers if they're exported — check before duplicating them) over `apps/web/app/user-actions.ts` and `apps/web/app/report-actions.ts`, asserting `toggleBlock` calls the imported `consumeWriteRateLimit` and `submitReport` calls the imported `consumeReportRateLimit`.

- [ ] **Step 2: Run to verify they fail**

- [ ] **Step 3: Implement**

```ts
// user-actions.ts
export async function toggleBlock(targetUserId: string, isBlocked: boolean) {
    const user = await requireUser()
    await consumeWriteRateLimit(user.id)
    return isBlocked ? unblockUser(user.id, targetUserId) : blockUser(user.id, targetUserId)
}
```

```ts
// report-actions.ts
'use server'
export async function submitReport(input: ReportInput) {
    const parsed = reportSchema.safeParse(input)
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' }
    const user = await requireUser()
    await consumeReportRateLimit(user.id)
    await createReport({ reporterId: user.id, ...parsed.data })
    return { error: null }
}
```

- [ ] **Step 4: Run to verify they pass, including the static scan**

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/user-actions.ts apps/web/app/report-actions.ts apps/web/test/app/moderation-actions-rate-limit.test.ts
git commit -m "feat: add toggleBlock and submitReport server actions with explicit rate limits"
```

---

## Task 9: Shared API client methods

**Files:**
- Modify: `packages/shared/api/client.ts`

**Interfaces:**
- Consumes: `BlockResult`, `BlockedUsersPage`, `ReportInput` (Tasks 4, 7).
- Produces: `api.users.block(userId)`, `api.users.unblock(userId)`, `api.me.blocked()`, `api.reports.create(input)` — consumed by Task 12, Task 13 (mobile UI).

- [ ] **Step 1: Add the four client methods**

```ts
users: {
    // ...existing entries, plus:
    block: (userId: string) => send<BlockResult>('POST', `/api/v1/user/${encodeURIComponent(userId)}/block`),
    unblock: (userId: string) => send<BlockResult>('DELETE', `/api/v1/user/${encodeURIComponent(userId)}/block`),
},
me: {
    // ...existing entries, plus:
    blocked: () => get<BlockedUsersPage>('/api/v1/me/blocked'),
},
reports: {
    create: (body: ReportInput) => send<OkResult>('POST', '/api/v1/reports', body),
},
```

- [ ] **Step 2: Run `npx tsc --noEmit -p packages/shared` and `npx tsc --noEmit -p apps/mobile` to verify both compile**

- [ ] **Step 3: Commit**

```bash
git add packages/shared/api/client.ts
git commit -m "feat: add block, unblock, blocked-list, and report methods to the shared API client"
```

---

## Task 10: Web — Report entry points and modal

**Files:**
- Create: `apps/web/app/components/util/ReportModal.tsx`
- Modify: `apps/web/app/components/game/Review.tsx` (flag icon, top-right, "Report" on hover)
- Modify: the list page/preview component that renders a list's name/description (`apps/web/app/components/lists/ListPreview.tsx` — confirm this is the right one by checking which component renders on `apps/web/app/user/[username]/lists/[listId]/page.tsx` before wiring it there)
- Modify: `apps/web/app/user/[username]/page.tsx` (profile Report icon, covering username/bio/avatar via the dropdown)

**Interfaces:**
- Consumes: `submitReport` (Task 8), `REPORT_REASONS` (Task 4), `Modal` (existing, `app/components/util/Modal.tsx`).
- Produces: `ReportModal`, a self-contained component taking `targetType`, `targetId`, and an `onClose` — no other task depends on its internals.

- [ ] **Step 1: Build `ReportModal`**

Wraps the existing `Modal` component. A reason `<select>` populated from `REPORT_REASONS[targetType]`, a free-text details `<textarea>`, a Report button calling `submitReport({ targetType, targetId, reason, details })`, and a submit-confirmation state (replace the form with a short "Reported" message rather than closing immediately, per the design doc's "whatever confirmation the modal itself shows on submit"). Disable the Report button while a submit is in flight.

- [ ] **Step 2: Wire the three entry points**

Review: a flag icon button, top-right of the card in `Review.tsx`, `title="Report"`, opening `<ReportModal targetType="review" targetId={rating_review.id} />` (confirm `rating_review` carries an `id` field — if not, thread it through from the caller first). List: same icon on the list-page component, `targetType="list"`. Profile: a Report icon near the existing `FollowButton`/`BioButton` area on `app/user/[username]/page.tsx`, `targetType="profile"`, `targetId={profile.id}` — separate from the Block icon (Task 11), not a combined menu, per the design doc.

- [ ] **Step 3: Start the dev server and verify by hand**

Open a review, a list, and a profile; open each Report modal, submit one, confirm the row lands in the local `reports` table (`psql ... -c "select * from reports"`) and that a missing/invalid `RESEND_API_KEY` locally doesn't block the DB write (Task 6's guarantee).

- [ ] **Step 4: Run `npx tsc --noEmit -p apps/web` and `npm run lint`, then commit**

```bash
git add apps/web/app/components/util/ReportModal.tsx apps/web/app/components/game/Review.tsx apps/web/app/components/lists/ListPreview.tsx apps/web/app/user/[username]/page.tsx
git commit -m "feat: add report entry points and modal to web reviews, lists, and profiles"
```

---

## Task 11: Web — Block button and Settings "Blocked users"

**Files:**
- Create: `apps/web/app/components/user/BlockButton.tsx`
- Modify: `apps/web/app/user/[username]/page.tsx` (mount next to Report, separate icon)
- Modify: wherever the web Settings page is composed (locate it — likely `apps/web/app/settings/page.tsx` or similar; check before assuming the path)
- Modify: `apps/web/lib/loaders/` or the settings query path, to surface `getBlockedUsers` to the Settings page

**Interfaces:**
- Consumes: `toggleBlock` (Task 8), `getBlockedUsers` (Task 3), `Modal` (for the confirm-before-blocking dialog, consistent with delete-list/delete-account/unlink-Steam's existing confirm pattern — check how one of those confirms today and match it, e.g. whatever `DeleteAccountButton`-equivalent uses).
- Produces: `BlockButton` (profile page), a "Blocked users" section on the Settings page with an Unblock action per row.

- [ ] **Step 1: Build `BlockButton`**

Mirrors `FollowButton.tsx`'s client-component shape (local `isBlocked` state, `isLoading`, calls `toggleBlock`, `router.refresh()`), but opens a confirm dialog before the *block* action specifically (unblocking needs no confirm, consistent with how this app treats destructive-vs-reversible actions elsewhere).

- [ ] **Step 2: Mount it on the profile page, separate from Report**

`app/user/[username]/page.tsx`, next to the Report icon from Task 10 but its own icon/control, not a shared menu.

- [ ] **Step 3: Add the "Blocked users" Settings section**

Fetch `getBlockedUsers(user.id)` server-side (Settings is presumably a Server Component already reading other account fields the same way — match its existing data-fetching pattern rather than introducing a client fetch). Render each as a row (avatar, username) with an Unblock button calling `toggleBlock(id, true)`.

- [ ] **Step 4: Start the dev server and verify by hand**

Block a second local user, confirm the follow (if any) disappears both ways and a refollow attempt silently no-ops; unblock from Settings and confirm a follow works again.

- [ ] **Step 5: Run `npx tsc --noEmit -p apps/web` and `npm run lint`, then commit**

```bash
git add apps/web/app/components/user/BlockButton.tsx apps/web/app/user/[username]/page.tsx
git commit -m "feat: add block button and Blocked users settings section to web"
```

---

## Task 12: Mobile — Report entry points and sheet

**Files:**
- Create: `apps/mobile/src/components/report-sheet.tsx`
- Modify: the mobile review-row component (locate the mobile equivalent of `Review.tsx` — check `apps/mobile/src/components/` for a review card before assuming a name)
- Modify: `apps/mobile/src/components/list-card.tsx` (report icon, alongside the existing owner-Pressable and Pin pattern — same `zIndex: 1` technique for a new tappable icon that must win over the card's larger tap area)
- Modify: `apps/mobile/src/components/profile-hub.tsx`

**Interfaces:**
- Consumes: `api.reports.create` (Task 9), `REPORT_REASONS` (Task 4), `Sheet` (existing, `apps/mobile/src/components/sheet.tsx`).
- Produces: `ReportSheet`, mirroring `ReportModal`'s (Task 10) props and behavior in the `Sheet` idiom instead of a web modal.

- [ ] **Step 1: Build `ReportSheet`**

Same shape as Task 10's `ReportModal`: a reason list (from `REPORT_REASONS[targetType]`, rendered as selectable rows — mirror `BrowseMenu`'s `Sheet`-of-options pattern from `explore-screen.tsx` rather than a native `<select>`, since RN has no select), a free-text details field, a Report button calling `api.reports.create`, an in-sheet confirmation state.

- [ ] **Step 2: Wire the three entry points**

Review row, list card (new icon beside the existing Pin icon's position, same `zIndex: 1` footer technique), profile hub (separate icon from Block, Task 13).

- [ ] **Step 3: Verify by hand in the simulator or Expo web**

- [ ] **Step 4: Run `npx expo lint` and `npx tsc --noEmit` in `apps/mobile`, then commit**

```bash
git add apps/mobile/src/components/report-sheet.tsx apps/mobile/src/components/list-card.tsx apps/mobile/src/components/profile-hub.tsx
git commit -m "feat: add report entry points and sheet to mobile reviews, lists, and profiles"
```

---

## Task 13: Mobile — Block button and Settings "Blocked users"

**Files:**
- Modify: `apps/mobile/src/components/profile-hub.tsx`
- Modify: `apps/mobile/src/components/settings-screen.tsx`
- Modify: `apps/mobile/src/lib/settings-page.ts` (if blocked-users data flows through here the way other settings fields do — check its current shape before assuming)

**Interfaces:**
- Consumes: `api.users.block`/`unblock`/`api.me.blocked` (Task 9).
- Produces: a Block control on the profile hub, a "Blocked users" section on the Settings screen with Unblock.

- [ ] **Step 1: Add the Block control to `profile-hub.tsx`**

Mirrors whatever Follow control already exists there (same confirm-before-block behavior as Task 11's web version).

- [ ] **Step 2: Add the "Blocked users" section to `settings-screen.tsx`**

Fetch via `api.me.blocked()`, render rows with an Unblock action calling `api.users.unblock(id)`.

- [ ] **Step 3: Verify by hand in the simulator or Expo web**

- [ ] **Step 4: Run `npx expo lint` and `npx tsc --noEmit` in `apps/mobile`, then commit**

```bash
git add apps/mobile/src/components/profile-hub.tsx apps/mobile/src/components/settings-screen.tsx apps/mobile/src/lib/settings-page.ts
git commit -m "feat: add block button and Blocked users settings section to mobile"
```

---

## Execution note

Tasks 2, 3, 4, and 5 depend only on Task 1 and can all run in parallel. Task 6 needs both Task 4 and Task 5. Task 7 needs Task 2, Task 3, and Task 6. Tasks 8 and 9 need Task 7 (and, for Task 9's types, Task 4). Tasks 10/11 (web UI) and 12/13 (mobile UI) depend on Task 9 and can all four run in parallel once it lands, but per the Global Constraints, no task in this plan should be called "done" for the user until both platforms' report UI and both platforms' block UI exist — i.e. 10+12 together, and 11+13 together.
