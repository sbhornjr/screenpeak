# Followers/Following List — Design

**Intent:** Make the "X Followers | Y Following" text on a profile clickable,
opening a scrollable list of the actual people, on web and mobile. Today
those counts are inert text; there's no way to see who they refer to.

**Goals:**
- Tapping either count opens a list of that relationship (followers or
  following) for that profile.
- Each row shows avatar + username, links to that player's profile (closing
  the list), and carries its own Follow/Unfollow button for the viewer's
  relationship to that row — reusing the existing `FollowButton` behavior
  (web) / follow-toggle behavior (mobile), not a new interaction.
- If the profile owner has blocked the viewer, the viewer cannot open or see
  either list.

**Non-goals:**
- No pagination/infinite scroll — single fetch, capped at 500 rows per list.
- No new privacy toggle for follower/following visibility. Counts are
  visible to everyone today, including signed-out viewers; that doesn't
  change. The only gate is the existing block relationship.

**Anti-goal:** This must not become a second code path for "who can see
what" — the block check is the same `isBlockedEitherWay` check the rest of
the moderation feature already uses, not a new ad hoc query.

**Constraints:**
- Reuses the `follows` table as-is; no schema changes.
- New reads follow the loader/API conventions in `AGENTS.md`: throw on a DB
  error (no silent `[]`), response types declared in `@screenpeak/shared/api/*`,
  `Cache-Control: private, no-store`.
- Mirrors the existing `/api/v1/user/[username]/...` route family — the
  segment is the username, like `/library` and `/lists`, not an account id
  like `/block`.

## Approaches considered

- **Unpaginated, capped list (chosen) vs. real offset/cursor pagination.**
  Pagination means total-order query params and infinite-scroll state
  inside a modal/sheet — real machinery for a scale problem this app
  doesn't have yet. A single query with a 500-row cap, ordered by
  `username, id` (same shape as `getBlockedUsers`), is simpler and safe. If
  a profile ever needs more than 500 shown, that's a later change.
- **Shared cross-platform row component vs. a small dedicated row per
  list.** `UnifiedSearch.tsx`'s `UserRow` is a private 8-line function
  already coupled to that component. Extracting it for one more call site
  isn't worth the coupling; the new list gets its own minimal row (avatar,
  username, link) modeled on the same shape instead.

## Decisions already made (by the product owner)

- UI is a modal (web) / sheet (mobile) with a scrollable list, not a
  dedicated page.
- Hidden entirely from a blocked viewer.
- No other privacy gating.

## What's left to the builder

### Data layer (`apps/web/lib/queries/user.ts`)

- `getFollowerProfiles(userId: string, viewerId: string | null): Promise<FollowListEntry[]>`
  and `getFollowingProfiles(userId: string, viewerId: string | null): Promise<FollowListEntry[]>`
  — join `follows` to `users`, select `{ id, username, avatar_url }` plus a
  per-row `is_following` (whether `viewerId` follows that row's user —
  `false` when `viewerId` is null, same `exists(...)` shape
  `getProfileFollowStats` already uses, correlated per row instead of once),
  `ORDER BY username, id`, `LIMIT 500`. Both throw on a DB error (these back
  an API route, unlike the existing `getFollowers`/`getFollowing` which stay
  as they are for their current forgiving callers).
- `FollowListEntry` type (`{ id, username, avatar_url, is_following }`) lives
  in `@screenpeak/shared/api/profile.ts` (or a new small file there if that
  one is already crowded — builder's call).
- Signed-out viewers never see a Follow button at all (same as the profile
  page today); a row for the viewer's own id never shows one either — both
  guards live in the row component, keyed off a `viewerId` the modal/sheet
  already has, not in the query (the query just always computes
  `is_following` correctly; rendering decides whether to show the button).

### Routes

- `GET /api/v1/user/[username]/followers` and
  `GET /api/v1/user/[username]/following`: `withAuth` → `getBearerUser()`
  (optional — signed-out allowed, matching the profile page itself) →
  resolve username to id (404 if missing) → if a viewer is signed in and
  `isBlockedEitherWay(viewer.id, profile.id)`, 404 (same "not found" signal
  the private-library/private-list precedent uses) → otherwise call the
  matching query → `Response.json({ users: [...] })`.
- Both are reads — no rate-limit/write-budget concerns beyond the existing
  read path.

### Web (`apps/web/app/components/user/`)

- New `FollowListModal.tsx`: props `username`, `kind: 'followers' | 'following'`,
  `onClose`. Fetches via a new Server Action (`listFollowers`/`listFollowing`
  in `app/user-actions.ts`, no `requireUser()` needed — public read, same as
  the profile page, but it reads the current viewer via `getOptionalUser()`
  to pass `viewerId` through). Renders with `Modal`; each row links to
  `/user/[username]`, closes the modal on click, and mounts the existing
  `FollowButton` (`targetUserId={row.id}`, `initialIsFollowing={row.is_following}`)
  unless the row is the viewer's own id or there's no signed-in viewer.
  Visually modeled on `UnifiedSearch.tsx`'s row shape, as its own component
  (see Approaches).
- `page.tsx:92`'s "X Followers | Y Following" line becomes two separate
  buttons that open the modal with the matching `kind`.

### Mobile (`apps/mobile/src/components/`)

- New `follow-list-sheet.tsx`: same shape as web, built on `Sheet` with a
  scrollable list, fetching via new `api.users.followers(username)` /
  `api.users.following(username)` methods on `packages/shared/api/client.ts`'s
  `users` group (response includes each row's `is_following`, resolved
  server-side from the caller's bearer token same as web).
- Each row gets a small follow-toggle control calling the existing
  `api.users.follow(userId)` / `unfollow(userId)` — mobile has no standalone
  `FollowButton` component today (`profile-hub.tsx`'s toggle is inline,
  wired to that screen's own TanStack Query cache for the single profile
  being viewed), so this is a new small self-contained control local to
  `follow-list-sheet.tsx`: own loading state, no cache integration with the
  profile screen's query — it only needs to update its own row after a
  toggle, not the profile page underneath. Hidden for the viewer's own row
  and when signed out, same as web.
- `profile-hub.tsx`'s `countLine` (currently one static `Text`, line 204)
  becomes two pressable spans that open the sheet with the matching `kind`.

### Tests

- Query tests: the 500 cap, ordering, and that a blocked viewer's request
  404s.
- `test/api/v1-routes-auth.test.ts` / `v1-reads-throw.test.ts` coverage for
  the two new routes, like every other `/api/v1` GET.
- Mobile: a sheet-open/row-tap test, same shape as the existing
  `block-button`/`report-sheet` tests.
