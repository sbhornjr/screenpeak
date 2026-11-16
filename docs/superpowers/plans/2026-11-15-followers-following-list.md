# Followers/Following List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the "X Followers | Y Following" counts on a profile clickable, opening a scrollable list of the actual people — with a Follow/Unfollow button per row — on web and mobile.

**Architecture:** One new query pair returns `{ id, username, avatar_url, is_following }` rows for a user's followers or following, capped at 500 and ordered by `username, id`. A small loader resolves a username to that list, returning `null` for a missing user or a viewer the profile owner has blocked (the same signal, so neither leaks which case it was). Two new `/api/v1/user/[username]/followers|following` GET routes expose it to mobile; the web page fetches the same loader directly through a new pair of Server Actions. Each row reuses the existing Follow/Unfollow behavior — web's `FollowButton` component as-is, a small new row-local toggle on mobile (which has no standalone equivalent today).

**Tech Stack:** Next.js 16 App Router (web), Expo/React Native + TanStack Query (mobile), Drizzle/postgres-js, Vitest.

**Spec:** docs/superpowers/specs/2026-11-15-followers-following-list-design.md

## Global Constraints

- Single fetch per list, capped at 500 rows, ordered by `username, id` (no pagination).
- The privacy gate is the existing `isBlockedEitherWay` check and nothing else — no new ad hoc privacy logic.
- A missing user and a blocked viewer produce the identical outward result (null from the loader, empty list to the UI) — the feature must never let a viewer distinguish "no followers" from "you're blocked."
- `/api/v1` routes: `withAuth` → `getBearerUser()` (optional — signed out is allowed) → loader → 404 `not_found` or `Response.json(...)`, `Cache-Control: private, no-store`. Segment is the username, like `/library` and `/lists`.
- Reads throw on a DB error (no silent `[]`/`null` standing in for an outage) — the loader's `null` return is reserved for "not found or blocked," never for a failed query.
- No Follow/Unfollow confirmation — tapping toggles directly, matching the existing behavior everywhere else in the app.
- Reuse `FollowButton` (web) as-is; mobile gets one new small row-local toggle, not wired into the profile screen's own query cache.

## Review Focus

- A signed-out viewer opens either list: no row shows a Follow button, and every row's `is_following` is `false` (there's no viewer to be following anyone).
- The viewer's own row appears in someone else's list (they follow you, or you follow them and you're looking at that list from a third angle isn't possible, but you being in your own followers/following when you view someone else's is): that row must never show a Follow button.
- The profile owner has blocked the viewer: the list is empty to that viewer, indistinguishable from a real empty list — not an error, not a distinct "blocked" message.
- The target username doesn't exist: same empty/404 outcome as the blocked case, not a 500.
- A list with more than 500 rows: capped, not an error, and the fixed `ORDER BY username, id` keeps results stable and duplicate-free across repeated opens.

---

### Task 1: Follower/following query functions

**Files:**
- Modify: `apps/web/lib/queries/user.ts`
- Modify: `packages/shared/api/profile.ts`
- Test: `apps/web/test/lib/queries/follow-list.test.ts`

**Interfaces:**
- Produces: `FollowListEntry = { id: string, username: string, avatar_url: string | null, is_following: boolean }` (exported from `@screenpeak/shared/api/profile`); `getFollowerProfiles(userId: string, viewerId: string | null): Promise<FollowListEntry[]>` and `getFollowingProfiles(userId: string, viewerId: string | null): Promise<FollowListEntry[]>` (exported from `lib/queries/user.ts`).

- [ ] **Step 1: Add the `FollowListEntry` type**

In `packages/shared/api/profile.ts`, add:
```ts
export type FollowListEntry = {
    id: string
    username: string
    avatar_url: string | null
    is_following: boolean
}
```

- [ ] **Step 2: Write the failing tests**

In `apps/web/test/lib/queries/follow-list.test.ts`, mock `@/lib/db` the way other direct-`db.execute` functions are mocked (a `vi.fn()` for `execute`), then:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const execute = vi.hoisted(() => vi.fn())
vi.mock('@/lib/db', () => ({ db: { execute } }))

import { getFollowerProfiles, getFollowingProfiles } from '@/lib/queries/user'

describe.each([
    ['getFollowerProfiles', getFollowerProfiles],
    ['getFollowingProfiles', getFollowingProfiles],
] as const)('%s', (_name, fn) => {
    beforeEach(() => execute.mockReset())

    it('maps is_following to a real boolean', async () => {
        execute.mockResolvedValue([
            { id: 'u1', username: 'ada', avatar_url: null, is_following: true },
            { id: 'u2', username: 'bea', avatar_url: 'https://x/y.png', is_following: false },
        ])
        const rows = await fn('target-id', 'viewer-id')
        expect(rows).toEqual([
            { id: 'u1', username: 'ada', avatar_url: null, is_following: true },
            { id: 'u2', username: 'bea', avatar_url: 'https://x/y.png', is_following: false },
        ])
    })

    it('rejects on a database error', async () => {
        execute.mockRejectedValue(new Error('down'))
        await expect(fn('target-id', 'viewer-id')).rejects.toThrow('down')
    })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run apps/web/test/lib/queries/follow-list.test.ts`
Expected: FAIL — `getFollowerProfiles`/`getFollowingProfiles` not exported yet.

- [ ] **Step 4: Implement `getFollowerProfiles` and `getFollowingProfiles` in `apps/web/lib/queries/user.ts`**

Add near `getProfileFollowStats` (same file, same `db.execute(sql...)` style, same `=== true` boolean coercion as that function):

```ts
const FOLLOW_LIST_MAX = 500

export async function getFollowerProfiles(userId: string, viewerId: string | null): Promise<FollowListEntry[]> {
    const isFollowing = viewerId
        ? sql`exists (select 1 from follows vf where vf.following_id = u.id and vf.follower_id = ${viewerId})`
        : sql`false`
    const rows = await db.execute(sql`
        select u.id as id, u.username as username, u.avatar_url as avatar_url, ${isFollowing} as is_following
        from follows f
        join users u on u.id = f.follower_id
        where f.following_id = ${userId}
        order by u.username, u.id
        limit ${FOLLOW_LIST_MAX}
    `) as unknown as FollowListEntry[]
    return rows.map(r => ({ ...r, is_following: r.is_following === true }))
}

export async function getFollowingProfiles(userId: string, viewerId: string | null): Promise<FollowListEntry[]> {
    const isFollowing = viewerId
        ? sql`exists (select 1 from follows vf where vf.following_id = u.id and vf.follower_id = ${viewerId})`
        : sql`false`
    const rows = await db.execute(sql`
        select u.id as id, u.username as username, u.avatar_url as avatar_url, ${isFollowing} as is_following
        from follows f
        join users u on u.id = f.following_id
        where f.follower_id = ${userId}
        order by u.username, u.id
        limit ${FOLLOW_LIST_MAX}
    `) as unknown as FollowListEntry[]
    return rows.map(r => ({ ...r, is_following: r.is_following === true }))
}
```

Import `FollowListEntry` from `@screenpeak/shared/api/profile` at the top of `user.ts`.

Note for the task reviewer: this correlated-subquery shape has no existing unit test in this codebase that exercises real SQL (the adjacent `getProfileFollowStats` is only ever tested through a mock), so the cap, ordering, and join direction need a careful read against a real `follows`/`users` schema rather than relying on the mocked test above to catch a wrong join.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run apps/web/test/lib/queries/follow-list.test.ts`
Expected: PASS

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit -p apps/web` and `npx tsc --noEmit -p packages/shared`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/queries/user.ts packages/shared/api/profile.ts apps/web/test/lib/queries/follow-list.test.ts
git commit -m "feat: add getFollowerProfiles/getFollowingProfiles queries"
```

---

### Task 2: Follow-list loader

**Files:**
- Create: `apps/web/lib/loaders/follow-list.ts`
- Modify: `packages/shared/api/profile.ts`
- Test: `apps/web/test/lib/loaders/follow-list.test.ts`

**Interfaces:**
- Consumes: `getFollowerProfiles`, `getFollowingProfiles` (Task 1); existing `getUserIdFromUsername(username: string): Promise<{ id: string } | null>` and `isBlockedEitherWay(a: string, b: string): Promise<boolean>` from `lib/queries/user.ts`.
- Produces: `FollowListPage = { users: FollowListEntry[] }` (exported from `@screenpeak/shared/api/profile`); `type FollowListKind = 'followers' | 'following'` and `loadFollowList(username: string, kind: FollowListKind, viewerId: string | null): Promise<FollowListEntry[] | null>` (exported from `lib/loaders/follow-list.ts`). `null` means "not found or blocked" — both callers (Task 3's routes, Task 4's Server Actions) treat it as "nothing to show," never surfacing which case it was.

- [ ] **Step 1: Add the `FollowListPage` type**

In `packages/shared/api/profile.ts`:
```ts
export type FollowListPage = { users: FollowListEntry[] }
```

- [ ] **Step 2: Write the failing tests**

In `apps/web/test/lib/loaders/follow-list.test.ts`, mock `@/lib/queries/user` the way `read-pages.test.ts` mocks it (an object of `vi.fn()`s), in this file only:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const userQ = {
    getUserIdFromUsername: vi.fn(),
    isBlockedEitherWay: vi.fn(),
    getFollowerProfiles: vi.fn(),
    getFollowingProfiles: vi.fn(),
}
vi.mock('@/lib/queries/user', () => userQ)

import { loadFollowList } from '@/lib/loaders/follow-list'

const TARGET = { id: 'target-id' }
const ENTRIES = [{ id: 'u1', username: 'ada', avatar_url: null, is_following: true }]

describe('loadFollowList', () => {
    beforeEach(() => {
        userQ.getUserIdFromUsername.mockReset()
        userQ.isBlockedEitherWay.mockReset()
        userQ.getFollowerProfiles.mockReset()
        userQ.getFollowingProfiles.mockReset()
    })

    it('returns null when the username does not exist', async () => {
        userQ.getUserIdFromUsername.mockResolvedValue(null)
        expect(await loadFollowList('nobody', 'followers', 'viewer-id')).toBeNull()
        expect(userQ.isBlockedEitherWay).not.toHaveBeenCalled()
    })

    it('returns null when the viewer is blocked by the target, either direction', async () => {
        userQ.getUserIdFromUsername.mockResolvedValue(TARGET)
        userQ.isBlockedEitherWay.mockResolvedValue(true)
        expect(await loadFollowList('ada', 'followers', 'viewer-id')).toBeNull()
    })

    it('skips the block check for a signed-out viewer and returns the list', async () => {
        userQ.getUserIdFromUsername.mockResolvedValue(TARGET)
        userQ.getFollowerProfiles.mockResolvedValue(ENTRIES)
        const result = await loadFollowList('ada', 'followers', null)
        expect(result).toBe(ENTRIES)
        expect(userQ.isBlockedEitherWay).not.toHaveBeenCalled()
    })

    it('calls getFollowerProfiles for kind "followers"', async () => {
        userQ.getUserIdFromUsername.mockResolvedValue(TARGET)
        userQ.isBlockedEitherWay.mockResolvedValue(false)
        userQ.getFollowerProfiles.mockResolvedValue(ENTRIES)
        await loadFollowList('ada', 'followers', 'viewer-id')
        expect(userQ.getFollowerProfiles).toHaveBeenCalledWith(TARGET.id, 'viewer-id')
    })

    it('calls getFollowingProfiles for kind "following"', async () => {
        userQ.getUserIdFromUsername.mockResolvedValue(TARGET)
        userQ.isBlockedEitherWay.mockResolvedValue(false)
        userQ.getFollowingProfiles.mockResolvedValue(ENTRIES)
        await loadFollowList('ada', 'following', 'viewer-id')
        expect(userQ.getFollowingProfiles).toHaveBeenCalledWith(TARGET.id, 'viewer-id')
    })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run apps/web/test/lib/loaders/follow-list.test.ts`
Expected: FAIL — `lib/loaders/follow-list.ts` doesn't exist yet.

- [ ] **Step 4: Implement `loadFollowList` in `apps/web/lib/loaders/follow-list.ts`**

```ts
import { getFollowerProfiles, getFollowingProfiles, getUserIdFromUsername, isBlockedEitherWay } from '@/lib/queries/user'
import type { FollowListEntry } from '@screenpeak/shared/api/profile'

export type FollowListKind = 'followers' | 'following'

export async function loadFollowList(
    username: string,
    kind: FollowListKind,
    viewerId: string | null,
): Promise<FollowListEntry[] | null> {
    const target = await getUserIdFromUsername(username)
    if (!target) return null
    if (viewerId && await isBlockedEitherWay(viewerId, target.id)) return null
    return kind === 'followers'
        ? getFollowerProfiles(target.id, viewerId)
        : getFollowingProfiles(target.id, viewerId)
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run apps/web/test/lib/loaders/follow-list.test.ts`
Expected: PASS

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit -p apps/web`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/loaders/follow-list.ts packages/shared/api/profile.ts apps/web/test/lib/loaders/follow-list.test.ts
git commit -m "feat: add loadFollowList loader"
```

---

### Task 3: API routes

**Files:**
- Create: `apps/web/app/api/v1/user/[username]/followers/route.ts`
- Create: `apps/web/app/api/v1/user/[username]/following/route.ts`

**Interfaces:**
- Consumes: `loadFollowList` (Task 2); `FollowListPage` (Task 2); existing `ApiError`, `withAuth` from `@/lib/api`; existing `getBearerUser` from `@/lib/auth`.
- Produces: `GET /api/v1/user/[username]/followers` and `GET /api/v1/user/[username]/following`, each returning `FollowListPage` as JSON or a 404.

- [ ] **Step 1: Implement the followers route**

In `apps/web/app/api/v1/user/[username]/followers/route.ts`, modeled exactly on the shape of `apps/web/app/api/v1/user/[username]/library/route.ts` (same imports, same `PRIVATE` header constant, same "missing and gated are the same 404" comment style):

```ts
import type { NextRequest } from 'next/server'
import type { FollowListPage } from '@screenpeak/shared/api/profile'
import { ApiError, withAuth } from '@/lib/api'
import { getBearerUser } from '@/lib/auth'
import { loadFollowList } from '@/lib/loaders/follow-list'

const PRIVATE = { headers: { 'Cache-Control': 'private, no-store' } }

// A missing player and a viewer the player has blocked are the same 404.
export const GET = withAuth(async (req: NextRequest, ctx: RouteContext<'/api/v1/user/[username]/followers'>) => {
    const { username } = await ctx.params
    const user = await getBearerUser()
    const users = await loadFollowList(username, 'followers', user?.id ?? null)
    if (!users) throw new ApiError(404, 'not_found', 'Not found.')
    return Response.json({ users } satisfies FollowListPage, PRIVATE)
})
```

- [ ] **Step 2: Implement the following route**

In `apps/web/app/api/v1/user/[username]/following/route.ts`, identical to Step 1 except the route context path is `'/api/v1/user/[username]/following'` and the `loadFollowList` call passes `'following'`.

- [ ] **Step 3: Run the existing route-contract tests**

Run: `npx vitest run apps/web/test/api/v1-routes-auth.test.ts apps/web/test/api/v1-reads-throw.test.ts`
Expected: PASS — both new routes use `withAuth` + `getBearerUser` (no cookie auth) and their only `@/lib` call (`loadFollowList`, one level deep into `getUserIdFromUsername`/`isBlockedEitherWay`/`getFollowerProfiles`/`getFollowingProfiles`) throws on a DB error rather than swallowing it, satisfying both blanket tests with no changes needed to either test file.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p apps/web`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/v1/user/\[username\]/followers/route.ts apps/web/app/api/v1/user/\[username\]/following/route.ts
git commit -m "feat: add followers/following API routes"
```

---

### Task 4: Web UI — modal, trigger, and Server Actions

**Files:**
- Create: `apps/web/app/components/user/FollowListModal.tsx`
- Modify: `apps/web/app/user-actions.ts`
- Modify: `apps/web/app/user/[username]/page.tsx`

**Interfaces:**
- Consumes: `loadFollowList` (Task 2); `FollowListEntry` (Task 1); existing `Modal` (`@/app/components/util/Modal`), `Avatar` (`@/app/components/user/Avatar`), `FollowButton` (`@/app/components/user/FollowButton`, props `targetUserId: string`, `initialIsFollowing: boolean`); existing `getOptionalUser` from `@/lib/auth`.
- Produces: `listFollowers(username: string): Promise<FollowListEntry[]>` and `listFollowing(username: string): Promise<FollowListEntry[]>` (exported from `app/user-actions.ts`); `FollowCounts` (default export of `FollowListModal.tsx`, the trigger `page.tsx` renders in place of its current plain text).

This task has no new unit test file — this codebase has no component-level tests for web UI (confirmed: `ReportModal`, `FollowButton`, and `BlockButton` have none either; web UI correctness is verified by `verify-screenpeak`, not Vitest component tests). Steps below are implementation plus the project's standard verification commands.

- [ ] **Step 1: Add the Server Actions**

In `apps/web/app/user-actions.ts`, add (alongside the existing imports — add `getOptionalUser` from `@/lib/auth` and `loadFollowList` from `@/lib/loaders/follow-list`):

```ts
export async function listFollowers(username: string) {
    const viewer = await getOptionalUser()
    return (await loadFollowList(username, 'followers', viewer?.id ?? null)) ?? []
}

export async function listFollowing(username: string) {
    const viewer = await getOptionalUser()
    return (await loadFollowList(username, 'following', viewer?.id ?? null)) ?? []
}
```

- [ ] **Step 2: Implement `FollowListModal.tsx`**

One file, two exports, mirroring how `ReportModal.tsx` co-locates its modal body with the trigger that owns its open state (`ReportModal` + `ReportButton`):

- A non-exported `FollowListModal` component: props `username: string`, `kind: 'followers' | 'following'`, `viewerId: string | null`, `onClose: () => void`. On mount, calls `listFollowers(username)` or `listFollowing(username)` (from `@/app/user-actions`) depending on `kind`, tracking `'loading' | 'loaded' | 'error'` state the way `ReportModal.tsx` tracks its own `error` state (a thrown rejection — only a genuine DB outage, per Task 2 — sets `'error'` with the copy `"Couldn't load this list. Try again in a moment."`, matching `ReportModal.tsx`'s existing wording style). Renders inside `Modal` with title `"Followers"` or `"Following"`. An empty resolved list (covering both a real empty list and the blocked-viewer case — Review Focus item 3, deliberately indistinguishable) shows `"No followers yet."` / `"Not following anyone yet."`. Each loaded row: `Avatar` (`size="sm"`), a `Link` to `/user/${entry.username}` that also calls `onClose` on click, and — only when `viewerId` is set and `viewerId !== entry.id` (Review Focus items 1 and 2) — a `FollowButton` with `targetUserId={entry.id}` and `initialIsFollowing={entry.is_following}`.
- An exported default `FollowCounts` component: props `username: string`, `followerCount: number`, `followingCount: number`, `viewerId: string | null`. Renders the same text line `page.tsx` renders today ("{followerCount} Followers | {followingCount} Following") but as two buttons, each setting local state `open: 'followers' | 'following' | null` to its own kind; renders `<FollowListModal ... onClose={() => setOpen(null)} />` when `open` is set.

- [ ] **Step 3: Wire `FollowCounts` into the profile page**

In `apps/web/app/user/[username]/page.tsx`, replace the line
```tsx
<p className="text-md font-semibold font-(family-name:--font-display) text-(--color-muted)">{followersCount} Followers | {followingCount} Following</p>
```
with
```tsx
<FollowCounts username={username} followerCount={followersCount} followingCount={followingCount} viewerId={viewer?.id ?? null} />
```
and import `FollowCounts` from `@/app/components/user/FollowListModal`.

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit -p apps/web` and `npm run lint`
Expected: no errors

- [ ] **Step 5: Manually verify in the browser**

Start the dev server (`npm run dev`), open a profile with at least one follower, and confirm: both counts open a modal with the right list; a row's Follow button toggles and the row updates; your own row (when present) shows no Follow button; closing and reopening works.

- [ ] **Step 6: Update verify-screenpeak's feature map**

Per `AGENTS.md`: use the `maintain-verification-skill` skill to add this flow (opening either list, the row's Follow/Unfollow, the blocked-viewer-sees-nothing case) to `verify-screenpeak`'s feature map, and attempt a `verify-screenpeak` drive for evidence. If the local environment can't run it (no working Postgres/Chrome), note that explicitly rather than skipping the feature-map update.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/components/user/FollowListModal.tsx apps/web/app/user-actions.ts apps/web/app/user/\[username\]/page.tsx
git commit -m "feat: add followers/following list modal to the profile page"
```

---

### Task 5: Mobile UI — sheet, trigger, and row toggle

**Files:**
- Create: `apps/mobile/src/components/follow-list-sheet.tsx`
- Create: `apps/mobile/src/components/follow-list-sheet.test.tsx`
- Modify: `packages/shared/api/client.ts`
- Modify: `apps/mobile/src/lib/query-keys.ts`
- Modify: `apps/mobile/src/components/profile-hub.tsx`
- Modify: `apps/mobile/src/components/profile-hub-screen.tsx`

**Interfaces:**
- Consumes: the two routes from Task 3; `FollowListPage`/`FollowListEntry` (Task 1/2); existing `Sheet` (`./sheet`, props `visible`, `title`, `onClose`, `children`), `Avatar` (`./avatar`), `Button` (`./button`), `ActionError` (`./action-error`), `useAction` (`@/lib/use-action`), `useOnOpen` (`@/lib/use-on-open`), `api` (`@/lib/api`), `profileHref` (`@/lib/routes`), `go` (`@/lib/go`).
- Produces: `api.users.followers(username: string): Promise<FollowListPage>` and `api.users.following(username: string): Promise<FollowListPage>`; `queryKeys.followList(username: string, kind: 'followers' | 'following', viewer: string | null)`; `FollowListTrigger` (exported from `follow-list-sheet.tsx`, the counts line `ProfileHub` renders) and `FollowListSheet` (exported from the same file).

- [ ] **Step 1: Add the client methods**

In `packages/shared/api/client.ts`, inside the `users` object (alongside `follow`/`unfollow`), add:
```ts
followers: (username: string) => get<FollowListPage>(`${user(username)}/followers`),
following: (username: string) => get<FollowListPage>(`${user(username)}/following`),
```
Import `FollowListPage` from `./profile` at the top of the file (alongside the existing `ProfilePageData` import).

- [ ] **Step 2: Add the query key**

In `apps/mobile/src/lib/query-keys.ts`, add to `queryKeys`:
```ts
followList: (username: string, kind: 'followers' | 'following', viewer: Viewer) =>
    ['follow-list', username, kind, viewer] as const,
```

- [ ] **Step 3: Write the failing sheet test**

In `apps/mobile/src/components/follow-list-sheet.test.tsx`, follow the same `@vitest-environment jsdom` + mocked `react-native`/`react-native-safe-area-context` shape as `apps/mobile/src/components/report-sheet.test.tsx` (reuse that file's `react-native` mock verbatim — `Pressable`, `View`, `Text`, `ScrollView`, `Modal` at minimum; this sheet needs no `TextInput`). Mock `@/lib/api` (`api.users.followers`, `api.users.following`, `api.users.follow`, `api.users.unfollow`) and `@/lib/go` (`go`). Cover:

```ts
// renders a loaded row with avatar and username
// shows "No followers yet." for an empty resolved list (same rendering path as a blocked viewer — Review Focus item 3)
// shows an error state when the fetch rejects, with a working Retry
// shows a Follow button for a row where is_following is false, and pressing it calls api.users.follow with that row's id
// shows no Follow button on the row whose id equals the viewerId prop (Review Focus item 2)
// shows no Follow button for any row when viewerId is null (Review Focus item 1)
// tapping a row calls go(profileHref(username)) and onClose
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run apps/mobile/src/components/follow-list-sheet.test.tsx`
Expected: FAIL — `follow-list-sheet.tsx` doesn't exist yet.

- [ ] **Step 5: Implement `follow-list-sheet.tsx`**

- A non-exported `FollowListRow` component, modeled on `BlockedRow` in `apps/mobile/src/components/settings-screen.tsx:90-105` (same `Avatar` + `Text` + `Button` + per-row `useAction()` + `ActionError` shape), but the button toggles follow instead of unblock: label `"Follow"`/`"Following"`/`"Following…"`/`"Unfollowing…"` matching `ProfileHub`'s existing main Follow button's label logic, calling `api.users.follow(id)` / `api.users.unfollow(id)` and flipping its own local `is_following` state on success. Hidden entirely when `viewerId == null` or `viewerId === entry.id`.
- An exported `FollowListSheet({ visible, username, kind, viewerId, onClose }: { visible: boolean, username: string, kind: 'followers' | 'following', viewerId: string | null, onClose: () => void })`: `useQuery({ queryKey: queryKeys.followList(username, kind, viewerId), queryFn: () => kind === 'followers' ? api.users.followers(username) : api.users.following(username), enabled: visible })`. Renders a `Sheet` titled `"Followers"`/`"Following"`; while loading, nothing extra (the sheet opens empty momentarily, matching how other sheets in this app behave before their first paint of data); on error, `ActionError` with a retry calling the query's `refetch`; on an empty resolved list, `"No followers yet."` / `"Not following anyone yet."`; otherwise one `FollowListRow` per entry, each row also wrapped in a `Pressable` that calls `onClose()` then `go(profileHref(entry.username))` when tapped outside the Follow button itself.
- An exported `FollowListTrigger({ username, followerCount, followingCount, viewerId }: { username: string, followerCount: number, followingCount: number, viewerId: string | null })`: renders the same text `profile-hub.tsx`'s `countLine` renders today, as two nested `<Text accessibilityRole="button" onPress={...}>` segments inside one parent `<Text style={text.meta}>` — one setting local state to `'followers'`, one to `'following'` — and renders `<FollowListSheet visible={open != null} kind={open ?? 'followers'} username={username} viewerId={viewerId} onClose={() => setOpen(null)} />`.

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run apps/mobile/src/components/follow-list-sheet.test.tsx`
Expected: PASS

- [ ] **Step 7: Wire `FollowListTrigger` into `ProfileHub`**

In `apps/mobile/src/components/profile-hub.tsx`:
- Add a `viewerId: string | null` prop to `ProfileHub`.
- Replace the line `<Text style={text.meta}>{countLine(model.followerCount, model.followingCount)}</Text>` with `<FollowListTrigger username={model.username} followerCount={model.followerCount} followingCount={model.followingCount} viewerId={viewerId} />`, importing `FollowListTrigger` from `./follow-list-sheet`.
- Remove the now-unused `countLine` function.

- [ ] **Step 8: Pass `viewerId` from the screen**

In `apps/mobile/src/components/profile-hub-screen.tsx`, pass the already-computed `viewerId` (line 35, `remote.session?.user.id ?? null`) into `<ProfileHub ... viewerId={viewerId} />`.

- [ ] **Step 9: Typecheck and lint**

Run: `npx tsc --noEmit -p apps/mobile` and `npx expo lint` (from `apps/mobile`)
Expected: no errors

- [ ] **Step 10: Run the full mobile test suite**

Run: `npm test -w @screenpeak/mobile`
Expected: PASS, including the existing `profile-hub.tsx` / `profile-hub-screen.tsx` tests (update their mocks/snapshots if they assert on the old `countLine` text).

- [ ] **Step 11: Commit**

```bash
git add apps/mobile/src/components/follow-list-sheet.tsx apps/mobile/src/components/follow-list-sheet.test.tsx packages/shared/api/client.ts apps/mobile/src/lib/query-keys.ts apps/mobile/src/components/profile-hub.tsx apps/mobile/src/components/profile-hub-screen.tsx
git commit -m "feat: add followers/following list sheet to the mobile profile"
```
