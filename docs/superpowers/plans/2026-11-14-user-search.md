# User Search (Games, Lists, People) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a player search games, lists, and people by name from one type-filtered, debounced-as-you-type control on Explore, on both web and mobile, and close the "Find people to follow" gap that motivated the feature.

**Architecture:** Two new query functions (`searchUsersByUsername`, `searchListsByName`) follow `searchGamesByName`'s exact contains-pattern / rate-limit template; two new `/api/v1` routes and two new `search-actions.ts` actions expose them the same way the existing game/taxonomy search does; shared types and the typed API client extend `packages/shared/api/search.ts` / `client.ts`; the Explore UI on both platforms gets a type filter plus a 300ms-debounced search, reusing existing row/card primitives (`SearchHitRow`, `ListCardView`) rather than inventing new visual language.

**Tech Stack:** Next.js 16 Server Actions + Route Handlers, Drizzle ORM raw SQL (`postgres-js`), zod, React Native / Expo Router.

**Spec:** [docs/superpowers/specs/2026-11-14-user-search-design.md](../specs/2026-11-14-user-search-design.md)

## Global Constraints

- Matching is username-only for people and list-name-only for lists — no `display_name`, no description, no fuzzy/ranked search (plain `ILIKE` substring, same as games).
- Results are homogeneous per search: the type filter picks games, lists, or users before the query fires; never mixed types in one result list.
- A private list is excluded from results for everyone except its own owner — enforced in the query itself, not filtered client-side.
- Every new search function reuses `containsPattern()` (escape `%`/`_`/`\`) and calls `consumeSearchRateLimit` after its own input parses, in both the Server Action and the `/api/v1` route — same shared `search:user:<uuid>` / `search:ip:<addr>` budget (120 req/60s) the existing game/taxonomy search already spends from.
- "Browse all" stays games-only; lists and people get a capped list of top matches with no full-results page.
- Search fires debounced (300ms) as-you-type for all three types, replacing mobile's current submit-triggered games search rather than leaving the three types inconsistent with each other.
- The "Find people to follow" empty-feed CTA deep-links into this search pre-filtered to people instead of opening plain `/explore`.

## Review Focus

- An empty, whitespace-only, or over-`SEARCH_QUERY_MAX_LENGTH` query to the new user/list search throws/400s exactly like `searchGamesByName` does today, rather than silently returning `[]` or 500ing (Task 2, Task 3, Task 6).
- A private list whose name matches the query never appears to a signed-out caller or a different signed-in user, but does appear to its own owner (Task 3).
- A `%`, `_`, or `\` in a submitted username or list-name query is escaped by `containsPattern()`, not treated as a SQL wildcard, in both new query functions (Task 2, Task 3).
- Switching the type filter immediately after typing does not render a stale response from the type that was selected before the switch, once the newer request resolves later than an older in-flight one (Task 10, Task 11).
- A new search-like function that forgets to call `consumeSearchRateLimit` fails CI, the same way `test/api/v1-routes-auth.test.ts`'s existing "search budget" check already catches this for the game/taxonomy search functions (Task 7).

---

## Task 1: Shared search types

**Files:**
- Modify: `packages/shared/api/search.ts`
- Verify: `npx tsc --noEmit -p packages/shared`

**Interfaces:**
- Produces: `UserSearchHit`, `UserSearchPage`, `ListSearchHit`, `ListSearchPage` — consumed by Task 4 (shaping), Task 6 (routes), Task 9 (client), Task 10/11 (UI).

- [ ] **Step 1: Add the four new types to `packages/shared/api/search.ts`**

```ts
export type UserSearchHit = {
    id: string
    username: string
    avatar_url: string | null
    /** Bulk-computed; 0 for a user nobody follows. */
    follower_count: number
}
export type UserSearchPage = { users: UserSearchHit[] }

export type ListSearchHit = {
    id: string
    name: string
    description: string
    owner_username: string
    last_activity: string
    game_count: number
    like_count: number
    viewer_has_liked: boolean
    covers: import('./lists').ListCover[]
}
export type ListSearchPage = { lists: ListSearchHit[] }
```

Use a top-level `import type { ListCover } from './lists'` instead of the inline `import(...)` above — the inline form is just to pin the exact type here unambiguously.

- [ ] **Step 2: Run `npx tsc --noEmit -p packages/shared` to verify it compiles**

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/api/search.ts
git commit -m "feat: add user and list search response types"
```

---

## Task 2: `searchUsersByUsername` with bulk follower counts

**Files:**
- Modify: `apps/web/lib/queries/game.ts:235` (export `searchBounds`, currently private)
- Modify: `apps/web/lib/queries/user.ts`
- Test: `apps/web/test/lib/queries/user-search.test.ts` (new)

**Interfaces:**
- Consumes: `searchBounds`, `containsPattern`, `SearchInputError` (now all exported from `@/lib/queries/game`); `db` from `@/lib/db`.
- Produces: `export type UserNameHit = { id: string, username: string, avatar_url: string | null, follower_count: number }` and `export async function searchUsersByUsername(query: string, limit = SEARCH_MAX_PAGE_SIZE): Promise<UserNameHit[]>` in `@/lib/queries/user` — consumed by Task 5 (action), Task 6 (route).

- [ ] **Step 1: Write the failing test**

```ts
// mirrors test/lib/search.test.ts's searchGamesByName tests, mocking '@/lib/db'
describe('searchUsersByUsername', () => {
  it('refuses an empty or oversized query before querying', async () => {
    await expect(searchUsersByUsername('   ')).rejects.toBeInstanceOf(SearchInputError)
    await expect(searchUsersByUsername('x'.repeat(101))).rejects.toBeInstanceOf(SearchInputError)
    await expect(searchUsersByUsername('horn', 21)).rejects.toBeInstanceOf(SearchInputError)
    expect(execute).not.toHaveBeenCalled()
  })

  it('returns follower_count as a number for a mocked row', async () => {
    execute.mockResolvedValueOnce([{ id: USER, username: 'hornflakes', avatar_url: null, follower_count: '3' }])
    const [row] = await searchUsersByUsername('horn')
    expect(row).toEqual({ id: USER, username: 'hornflakes', avatar_url: null, follower_count: 3 })
  })

  it('escapes %, _, and \\ via containsPattern rather than re-deriving the escaping', async () => {
    const containsPatternSpy = vi.spyOn(gameQueries, 'containsPattern')
    execute.mockResolvedValueOnce([])
    await searchUsersByUsername('100%_x')
    expect(containsPatternSpy).toHaveBeenCalledWith('100%_x')
  })
})
```

- [ ] **Step 2: Run `npx vitest run test/lib/queries/user-search.test.ts` to verify it fails**

Expected: FAIL — `searchUsersByUsername` is not exported.

- [ ] **Step 3: Export `searchBounds` from `apps/web/lib/queries/game.ts`, then implement `searchUsersByUsername` in `apps/web/lib/queries/user.ts`**

Add `export` to the `function searchBounds(...)` declaration at `game.ts:235` (no other change there). In `user.ts`, import `searchBounds`, `containsPattern` from `@/lib/queries/game`, `SEARCH_MAX_PAGE_SIZE` from `@screenpeak/shared/constants`. Join `users` to `follows` on `following_id`, filter `username ilike <pattern> escape '\'`, `group by u.id`, `count(f.follower_id)` as the follower count, `order by username asc, id asc limit <take>` — one raw `db.execute(sql\`...\`)` call, same shape as `searchGamesByName`. Coerce `follower_count` through `Number(...)` the same way `searchGamesByName` coerces `avg_rating`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/lib/queries/user-search.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/queries/game.ts apps/web/lib/queries/user.ts apps/web/test/lib/queries/user-search.test.ts
git commit -m "feat: add searchUsersByUsername with bulk follower counts"
```

---

## Task 3: `searchListsByName` with privacy filter and bulk covers/likes

**Files:**
- Modify: `apps/web/lib/queries/list.ts`
- Test: `apps/web/test/lib/queries/list-search.test.ts` (new)

**Interfaces:**
- Consumes: `searchBounds`, `containsPattern` from `@/lib/queries/game` (Task 2); `getListCoverMap`, `getListLikeStats` (already in this file).
- Produces: `export type ListSearchRow = { id: string, name: string, description: string | null, last_activity: string, game_count: number, owner_username: string, covers: { cover_image_url: string | null, slug: string | null }[], like_count: number, viewer_has_liked: boolean }` and `export async function searchListsByName(query: string, limit: number, viewerId: string | null): Promise<ListSearchRow[]>` — consumed by Task 4 (shaping), Task 6 (route).

- [ ] **Step 1: Write the failing test**

```ts
describe('searchListsByName', () => {
  it('refuses an empty or oversized query before querying', async () => {
    await expect(searchListsByName('  ', 20, null)).rejects.toBeInstanceOf(SearchInputError)
  })

  it('escapes %, _, and \\ via containsPattern rather than re-deriving the escaping', async () => {
    const containsPatternSpy = vi.spyOn(gameQueries, 'containsPattern')
    execute.mockResolvedValueOnce([])
    await searchListsByName('100%_x', 20, null)
    expect(containsPatternSpy).toHaveBeenCalledWith('100%_x')
  })

  it('excludes a private list from a non-owner but includes it for its owner', async () => {
    // mock the base-row execute() to return one is_public=false row owned by OWNER;
    // assert the base query's where-clause parameters passed to execute() include
    // viewerId, and that calling with viewerId=OWNER vs viewerId=OTHER produces
    // different mocked results per call (base row execute is driven by the mock,
    // not by real privacy logic — this test is pinning that viewerId reaches the
    // query, not re-deriving Postgres's filtering).
  })

  it('merges in covers and like stats for the matched ids', async () => {
    // mock the base-row execute() with one row id=LIST; mock getListCoverMap and
    // getListLikeStats (vi.mock them from this same module isn't possible since
    // they're same-file — instead assert via the base execute mock plus a second
    // execute mock matching getListLikeStats'/getListCoverMap's own raw SQL
    // shape, OR restructure so covers/likes are fetched via db.select — mirror
    // getListCoverMap/getListLikeStats's own existing mocked-db test style)
  })
})
```

The privacy and merge assertions need the same `vi.mock('@/lib/db', ...)` shape `getListCoverMap`/`getListLikeStats` already use elsewhere in this file's existing tests (if any) — check for an existing `test/lib/queries/list.test.ts` before writing a parallel mock scheme from scratch, and match it.

- [ ] **Step 2: Run `npx vitest run test/lib/queries/list-search.test.ts` to verify it fails**

Expected: FAIL — `searchListsByName` is not exported.

- [ ] **Step 3: Implement `searchListsByName` in `apps/web/lib/queries/list.ts`**

Base query: `lists` joined to `users` (for `owner_username`), filtered by `name ilike <pattern> escape '\'` and `(is_public = true or user_id = <viewerId>)` (the `viewerId is null` case must still exclude private lists — omitting the viewer clause rather than comparing against `null`), ordered `name asc, id asc`, limited. For `game_count` and `last_activity`'s exact derivation, mirror `get_user_lists` (`db/migrations/0001_functions_and_triggers.sql:680`) rather than re-deriving them — read that function before writing the SQL. Once you have the matched ids, call `getListCoverMap(ids)` and `getListLikeStats(ids, viewerId)` (both already exported from this file) and merge, the same way `lib/loaders/lists-page.ts:37-41` merges them for a user's list tab.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/lib/queries/list-search.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/queries/list.ts apps/web/test/lib/queries/list-search.test.ts
git commit -m "feat: add searchListsByName with privacy filter and bulk covers/likes"
```

---

## Task 4: Shape user/list search rows into the API contract

**Files:**
- Modify: `apps/web/lib/search-shape.ts`
- Test: `apps/web/test/lib/search-shape.test.ts` (new, or extend an existing one if `toGameSearchHit`/`toTaxonomyHit` already have a test file — check first)

**Interfaces:**
- Consumes: `UserNameHit` (Task 2), `ListSearchRow` (Task 3); `cover`, `num`, `text` from `@/lib/loaders/shape`.
- Produces: `export function toUserSearchHit(row: UserNameHit): UserSearchHit` and `export function toListSearchHit(row: ListSearchRow): ListSearchHit` — consumed by Task 5, Task 6.

- [ ] **Step 1: Write the failing test**

```ts
it('toUserSearchHit coerces follower_count and passes avatar_url through unrewritten', () => {
  expect(toUserSearchHit({ id: USER, username: 'peek', avatar_url: 'https://…', follower_count: 3 }))
    .toEqual({ id: USER, username: 'peek', avatar_url: 'https://…', follower_count: 3 })
})

it('toListSearchHit rewrites covers to display-ready URLs', () => {
  const hit = toListSearchHit({
    id: LIST, name: 'Horror', description: null, last_activity: '2026-01-01',
    game_count: 2, owner_username: 'peek', like_count: 1, viewer_has_liked: false,
    covers: [{ cover_image_url: 'co123', slug: 'resident-evil' }],
  })
  expect(hit.covers[0].cover_image_url).not.toBe('co123') // rewritten by cover()
  expect(hit.description).toBe('')
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/lib/search-shape.test.ts`
Expected: FAIL — exports missing.

- [ ] **Step 3: Implement `toUserSearchHit` and `toListSearchHit` in `apps/web/lib/search-shape.ts`**

Field-by-field, same style as `toGameSearchHit` — `cover(url, 'small')` per cover (matching `lists-page.ts`'s choice of size for list rows), `text(description) ?? ''`.

- [ ] **Step 4: Run to verify it passes**

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/search-shape.ts apps/web/test/lib/search-shape.test.ts
git commit -m "feat: shape user and list search rows for the API contract"
```

---

## Task 5: Server Actions `searchUsers` / `searchLists`

**Files:**
- Modify: `apps/web/app/search-actions.ts`
- Modify: `packages/shared/schemas.ts` (reuse `gameSearchSchema`'s `{ q, limit }` shape — no new schema needed; see Step 3)
- Test: `apps/web/test/lib/search-actions.test.ts` (extend existing)

**Interfaces:**
- Consumes: `searchUsersByUsername` (Task 2), `searchListsByName` (Task 3), `toUserSearchHit`/`toListSearchHit` (Task 4), `getOptionalUser`, `consumeSearchRateLimit`.
- Produces: `export async function searchUsers(query: string): Promise<UserSearchHit[]>` and `export async function searchLists(query: string): Promise<ListSearchHit[]>` — consumed by Task 10 (web UI). *(Mobile does not call Server Actions; it uses the `/api/v1` routes from Task 6.)*

- [ ] **Step 1: Write the failing test**

Mirror the existing `searchGamesByName`/`searchTaxonomyTable` action tests in this file: a bad/empty query returns `[]` without touching the rate limiter or the query function; a good query calls `consumeSearchRateLimit(user?.id ?? null, headers)` then the query function then the shaper.

- [ ] **Step 2: Run to verify it fails**

- [ ] **Step 3: Implement `searchUsers` and `searchLists` in `apps/web/app/search-actions.ts`**

Validate `query` with `gameSearchSchema.safeParse({ q: query })` (its `{ q, limit }` shape fits unchanged — don't add a near-duplicate schema for the same two fields). On a parse failure return `[]`, exactly like `searchGamesByName` does. On success: `getOptionalUser()` → `consumeSearchRateLimit(user?.id ?? null, await headers())` → the query function → `.map(toXSearchHit)`. `searchLists` passes `user?.id ?? null` as `viewerId`.

- [ ] **Step 4: Run to verify it passes**

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/search-actions.ts apps/web/test/lib/search-actions.test.ts
git commit -m "feat: add searchUsers and searchLists server actions"
```

---

## Task 6: `/api/v1` search routes

**Files:**
- Create: `apps/web/app/api/v1/users/search/route.ts`
- Create: `apps/web/app/api/v1/lists/search/route.ts`
- Test: `apps/web/test/api/search-routes.test.ts` (extend existing)

**Interfaces:**
- Consumes: `searchUsersByUsername`, `searchListsByName`, `toUserSearchHit`, `toListSearchHit`, `getBearerUser`, `consumeSearchRateLimit`, `withAuth`, `ApiError`, `gameSearchSchema` (reused for query parsing — add a `parseUserSearchQuery`/`parseListSearchQuery` pair to `apps/web/lib/screen-query.ts` alongside the existing `parseGameSearchQuery`, following its exact strict-parse-then-400 shape).

- [ ] **Step 1: Write the failing test**

Mirror the existing `GET /api/v1/games/search` tests in `search-routes.test.ts`: 200 + `private, no-store` for a good query; 400 before the rate limit or the query function for an empty/oversized query; 401/429 passthrough on a bad bearer or a spent budget. For the lists route, also assert it calls `getBearerUser()` and forwards the resulting id (or `null`) as `viewerId`.

- [ ] **Step 2: Run to verify it fails**

- [ ] **Step 3: Implement both routes**

Copy `apps/web/app/api/v1/games/search/route.ts`'s structure exactly: `withAuth(async (req) => { const user = await getBearerUser(); parse query params; 400 on bad; consumeSearchRateLimit(user?.id ?? null, req.headers); call the query function (lists route passes `user?.id ?? null` as `viewerId`); map through the shaper; `Response.json({ users: [...] } satisfies UserSearchPage, PRIVATE)` })`.

- [ ] **Step 4: Run to verify it passes**

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/v1/users/search apps/web/app/api/v1/lists/search apps/web/lib/screen-query.ts apps/web/test/api/search-routes.test.ts
git commit -m "feat: add GET /api/v1/users/search and GET /api/v1/lists/search"
```

---

## Task 7: Close the rate-limit safety-net gap for the new search functions

**Files:**
- Modify: `apps/web/test/api/v1-routes-auth.test.ts`

**Interfaces:**
- Consumes: nothing new — this generalizes the existing `search budget` describe block's static analysis.

This is the Review Focus item: the existing `SEARCH_QUERY_EXPORTS` constant (`v1-routes-auth.test.ts:224`) only scans callers of `searchGamesByName`/`searchTaxonomyTable`/`searchLibraryTaxonomy` imported from `@/lib/queries/game`. `searchUsersByUsername` (Task 2, from `@/lib/queries/user`) and `searchListsByName` (Task 3, from `@/lib/queries/list`) are invisible to it today — a caller of either that skipped `consumeSearchRateLimit` would pass CI.

- [ ] **Step 1: Write the failing test**

Add a fixture mirroring `test/api/fixtures/nested-search-limit.ts`, but calling `searchUsersByUsername` without the imported `consumeSearchRateLimit`. Add a test asserting the generalized check still flags it.

- [ ] **Step 2: Run to verify it fails**

Expected: FAIL — the current check doesn't know about `@/lib/queries/user`'s exports, so the fixture passes when it shouldn't.

- [ ] **Step 3: Generalize `SEARCH_QUERY_EXPORTS` to a module→exports map**

Change the single `SEARCH_QUERY_EXPORTS` array + hardcoded `'@/lib/queries/game'` (lines 224, 241) into a list of `{ module: string, exports: readonly string[] }` entries covering `@/lib/queries/game` (existing three) and `@/lib/queries/user` (`searchUsersByUsername`), `@/lib/queries/list` (`searchListsByName`). Update `searchBudgetProblems` to loop over the modules instead of assuming one.

- [ ] **Step 4: Run to verify it passes, then run the full suite**

Run: `npx vitest run test/api/v1-routes-auth.test.ts`
Expected: PASS. Then run `npm test` from the repo root to confirm nothing else regressed.

- [ ] **Step 5: Commit**

```bash
git add apps/web/test/api/v1-routes-auth.test.ts apps/web/test/api/fixtures/nested-search-limit-user.ts
git commit -m "test: extend the search rate-limit safety net to user and list search"
```

---

## Task 8: Shared API client methods

**Files:**
- Modify: `packages/shared/api/client.ts`

**Interfaces:**
- Consumes: `UserSearchPage`, `ListSearchPage` (Task 1).
- Produces: `api.users.search(q, limit?)` and a new `api.lists` group with `api.lists.search(q, limit?)` — consumed by Task 9, Task 10.

- [ ] **Step 1: Add the two client methods**

```ts
users: {
    // ...existing entries...
    search: (q: string, limit?: number) => get<UserSearchPage>(`/api/v1/users/search${qs({ q, limit })}`),
},
lists: {
    // ...existing entries...
    search: (q: string, limit?: number) => get<ListSearchPage>(`/api/v1/lists/search${qs({ q, limit })}`),
},
```

(`api.lists` does not exist yet as a group — add it alongside the existing top-level groups, following the same shape as `taxonomy`.)

- [ ] **Step 2: Run `npx tsc --noEmit -p packages/shared` and `npx tsc --noEmit -p apps/mobile` to verify both compile**

- [ ] **Step 3: Commit**

```bash
git add packages/shared/api/client.ts
git commit -m "feat: add users.search and lists.search to the shared API client"
```

---

## Task 9: Deep-link the "Find people to follow" CTA

**Files:**
- Modify: `apps/web/app/page.tsx:174` (`actionHref="/explore"` → `actionHref="/explore?type=users"`)
- Modify: `apps/mobile/src/components/feed-screen.tsx:229` (`onOpen('/explore')` → `onOpen('/explore?type=users')`)

This task has no new logic of its own — Task 10/11 are what make `?type=users` actually pre-select the people filter. Land it in the same commit as whichever of Task 10/11 lands last, or as a trivial follow-up once both exist; either order is fine since an unrecognized `?type=` param is harmless (Explore just ignores it until Task 10/11 land).

- [ ] **Step 1: Make both one-line changes**
- [ ] **Step 2: Commit**

```bash
git add apps/web/app/page.tsx apps/mobile/src/components/feed-screen.tsx
git commit -m "feat: deep-link the empty-feed CTA into people search"
```

---

## Task 10: Mobile Explore — type filter, debounce, three result rows

**Files:**
- Modify: `apps/mobile/src/components/explore-screen.tsx`
- Modify: `apps/mobile/src/app/(tabs)/explore.tsx` or wherever `ExploreScreen` is wired to data-fetching (locate it first — it's the file that currently owns `onSearch`/`results`/`searching`/`searchError` state and calls the games-search API)
- Test: `apps/mobile/src/components/explore-screen.test.tsx` (new, or extend if one exists)

**Interfaces:**
- Consumes: `api.games.search`, `api.users.search`, `api.lists.search` (Task 8); `ListCardView` (existing, `apps/mobile/src/components/list-card.tsx`, with `canLike={false}` `canPin={false}`).
- Produces: a new `UserHitRow` component (same file or a sibling, mirroring `SearchHitRow`'s shape: avatar left, username, follower count right) and an extended `ExploreScreenProps` carrying a `searchType: 'games' | 'lists' | 'users'` plus its setter — consumed by Task 9's deep link (reading the initial `type` param) and by the screen's own filter control.

- [ ] **Step 1: Write the failing test for the debounce + stale-response race (the Review Focus item)**

Using fake timers: type a query, advance 300ms, assert the games search fired once; switch the type filter to `users` before the games response resolves, then resolve the stale games response — assert the screen does not render it (it either discards a response whose type no longer matches the current filter, or cancels/ignores it by sequence number). Also test: 300ms of no typing fires exactly one request per keystroke-settle, not one per keystroke.

- [ ] **Step 2: Run to verify it fails**

- [ ] **Step 3: Implement**

Replace the current submit-triggered `onSubmitEditing`/`Search`-button flow with a `useEffect` debounce (300ms, `setTimeout`/`clearTimeout`, the same inline pattern `apps/web/app/components/util/SearchableDropdown.tsx:27-44` already uses — no new shared hook). Add a type-filter control (reuse the `BrowseMenu`/segmented-button pattern already in this file, or a simple three-way `Button` row — this file already has `Chips`/`Button` primitives). Guard stale responses with a ref-held request sequence number, incremented on every fire, compared on resolution. Render: games → existing `SearchHitRow` list; lists → `ListCardView` per hit (`canLike={false}`, `canPin={false}`, `username={hit.owner_username}`); users → new `UserHitRow` list. Read an initial `?type=` param (from Task 9's deep link) to preselect the filter when the screen mounts from that link.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run apps/mobile/src/components/explore-screen.test.tsx` (or the project's RN test command — check `apps/mobile/package.json` for the actual script name first)

- [ ] **Step 5: Run `npx expo lint` and `npx tsc --noEmit` in `apps/mobile`, then commit**

```bash
git add apps/mobile/src/components/explore-screen.tsx apps/mobile/src/components/explore-screen.test.tsx
git commit -m "feat: add debounced type-filtered search to mobile Explore"
```

---

## Task 11: Web Explore — unified search UI

**Files:**
- Create: `apps/web/app/components/explore/UnifiedSearch.tsx` (client component)
- Modify: `apps/web/app/explore/page.tsx` to mount it
- Test: a component test if this codebase has a web component-test convention already (check `apps/web/test/` for an existing `.tsx` test using React Testing Library before deciding whether to add one here, or lean on the behavioral unit test below plus manual verification)

**Interfaces:**
- Consumes: `searchUsers`, `searchLists` (Task 5, for signed-in-aware rate-limit-sharing — call these Server Actions directly from the client component, the same way `SearchableDropdown.tsx` calls `searchTaxonomyTable` directly), the existing `searchGamesByName` action.
- Produces: `UnifiedSearch`, a self-contained component Explore mounts once — no other task depends on its internals.

- [ ] **Step 1: Write a failing test for the debounce + stale-response race**

Same two behaviors as Task 10 Step 1, adapted to this component (fake timers + React Testing Library, or whatever harness this codebase's existing client-component tests use — there may not be one yet for a component this interactive; if so, write this as a plain function-level test of the debounce/sequencing logic extracted into a small testable helper, and verify the rest by hand in the browser per the task's last step).

- [ ] **Step 2: Run to verify it fails**

- [ ] **Step 3: Implement `UnifiedSearch`**

A type filter (three buttons/tabs: Games / Lists / Users — this page currently has none; follow the existing Tailwind-token conventions in `app/globals.css`, no hardcoded hex), a text input, a 300ms debounce (same inline `setTimeout` pattern as `SearchableDropdown.tsx`), and inline compact-row results per type: games reuse the existing game search-hit row style already used elsewhere on this page if one exists (check before inventing one), lists get a compact row (cover thumbnails, name, last-updated, like count, owner-username link — new markup, since the web has no `ListCardView` equivalent; keep it a single-line row, not a card grid, per the design doc's anti-goal), users get a compact row (avatar, username, follower count). All three link out: game → `/games/[slug]`, list → the list's page, user → `/user/[username]`. Read `?type=` from the URL (via `useSearchParams`) to preselect the filter on mount. "Browse all" stays games-only, pointing at `/games?q=<query>`.

- [ ] **Step 4: Run to verify it passes**

- [ ] **Step 5: Start the dev server and verify by hand in the browser**

Use `preview_start` on the web app, open `/explore`, try all three types, try `/explore?type=users` directly, and confirm a private list you don't own never appears.

- [ ] **Step 6: Run `npx tsc --noEmit -p apps/web` and `npm run lint`, then commit**

```bash
git add apps/web/app/components/explore/UnifiedSearch.tsx apps/web/app/explore/page.tsx
git commit -m "feat: add unified type-filtered search to web Explore"
```

---

## Execution note

Tasks 1–9 are backend/shared and have a strict dependency order (1→2,3→4→5,6→7,8→9). Tasks 10 and 11 both depend on Task 8 (and, for the deep link to do anything, Task 9) but not on each other — they can run in parallel once Task 8 lands.
