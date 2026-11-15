# User search (games, lists, people) — design

## Intent and why

ScreenPeak has no way to find a specific person by username. "Find people to
follow" (the empty-feed button) just opens Explore's trending/recommended
sections — browsing, not search. If you know a friend's handle, there is no
way to go straight to their profile short of guessing the URL. That gap is
the reason for this feature.

While designing it, it became clear the natural home for people-search is
alongside a search for games and lists, as one unified control on Explore —
rather than a separate, disconnected "find a person" box.

## Current state (verified against the code, not assumed)

- **Web's Explore page has no search bar at all.** `apps/web/app/explore/page.tsx`
  is a time-range filter (week/month/year/all-time) plus three sections
  ("Peak right now," "Recommended For You," "Lists peaking now"). This is new
  UI on web, not an extension.
- **Mobile's Explore already has a working games-only search**
  (`apps/mobile/src/components/explore-screen.tsx`): a text input
  (placeholder "Search games"), **submit-triggered — Return key or a
  "Search" button press, not live-as-you-type.** (Earlier draft of this doc
  incorrectly said "debounced," conflating this with `SearchableDropdown.tsx`
  on web, which *is* debounced for a different feature — developer/publisher
  taxonomy filters. Corrected.) Results render as a list of compact rows
  (`SearchHitRow`: small cover thumbnail, title, year/rating) that appear
  inline below the input — not an overlay — plus a "Browse all" button that
  opens the full game catalogue (`/games`) pre-filtered by the query. No type
  filter exists; it is hardcoded to games.
- **No backend search exists for lists by name.** Every list query
  (`apps/web/lib/queries/list.ts`) is scoped to a specific user
  (`getUserLists`, `getLikedLists`, …); none take a text query. The backing
  RPCs (`get_user_lists`, `get_liked_lists` in
  `db/migrations/0001_functions_and_triggers.sql`) don't either.
- **No cheap follower count exists.** `getProfileFollowStats`
  (`apps/web/lib/queries/user.ts`) computes it with a `COUNT(*)` subquery per
  profile view. There is no stored/denormalized count column on `users`, and
  no existing bulk version (count for N users in one query).
- **The established search pattern** (`searchGamesByName`/`searchTaxonomyTable`
  in `apps/web/lib/queries/game.ts`, called from `apps/web/app/search-actions.ts`
  and `GET /api/v1/games/search` / `GET /api/v1/taxonomy/[table]/search`) is:
  a zod-validated query, `containsPattern()` to build an escaped `ILIKE`
  pattern (`%` and `_` escaped), `consumeSearchRateLimit` called after the
  query parses, and a typed "hit" shape mapped via a `to*Hit` function. A
  repo-enforced test (`test/api/v1-routes-auth.test.ts`) fails if a new
  search-like function skips the rate limit call — any new search function
  must follow this.
- `apps/web/app/components/util/SearchableDropdown.tsx` is the one true
  overlay-dropdown component in the app (used for developer/publisher
  taxonomy filters on `/games`) — plain text rows, no images. It is **not**
  being reused here; see Decisions below.

## Goals

- Find a specific person by username, from Explore, on both platforms.
- Extend that into one combined search (games, lists, people) behind a type
  filter, since building three separate search UIs would be worse than one.
- Keep mobile's existing games-search UX (inline results, "Browse all") as
  the reference pattern for density and interaction; add lists and people as
  siblings of it, not a new visual language.

## Non-goals

- Browsing/discovery of people you *haven't* already got in mind — that's
  `docs/backlog.md` item 12, deliberately deferred to v2. Explore's existing
  recommended-users/trending-lists sections already cover this; this feature
  is strictly "I know who/what I'm looking for."
- Matching on `display_name` — it's slated for removal (`docs/backlog.md`
  item 11: always identical to `username` at signup, never editable, and
  rendered in exactly one place that would look the same showing `username`
  instead). Search is username-only.
- Fuzzy/typo-tolerant or ranked/relevance search. Plain substring match,
  consistent with the existing game/taxonomy search.
- A "Browse all" / full-results page for lists or people. Confirmed with the
  product owner: games keep it, lists and people don't get an equivalent in
  v1 — just a capped list of top matches.

## Anti-goals (would make this a failure even if it "works")

- Reinventing the overlay-dropdown pattern (`SearchableDropdown.tsx`) for
  this. Positioning decision below is inline results, not a popup — don't
  build a second, inconsistent overlay mechanism.
- Search leaking the existence of a private list to someone who isn't its
  owner. This must be enforced in the query itself (`is_public = true or
  owner = viewer`), not filtered client-side after the fact.
- A rich "card" treatment (like the favorite-game-picker's grid of cover
  art) for search results. That component exists for a different job
  (browsing/picking a handful of favorites visually); this feature is
  exact-match confirm-and-go, and should use compact single-line rows for
  all three content types, not a denser visual style.

## Decisions made (in conversation, recorded here as settled)

- **Positioning: inline, below the input, not an overlay.** Matches what
  mobile already does for games; avoids overlay complexity (z-index,
  click-outside-to-close, on-screen-keyboard occlusion) for no real benefit,
  since the Explore page already reflows fine.
- **Row style: compact, one line, for all three types** — not a grid of
  cards. Games: existing cover-thumbnail + title + year/rating row style.
  Lists: cover collage thumbnail, list name, last-updated, like count, and
  the creator's username — **the creator's name is its own tap target to
  their profile**, reusing the exact technique already shipped in
  `apps/mobile/src/components/list-card.tsx` (a separate `Pressable` on the
  owner name, given `zIndex: 1` so it reliably wins over the row's own larger
  tap area — do not reinvent this, copy it). Users: avatar (left), username,
  follower count (right).
- **Type filter:** a filter control (described as a button/menu, not
  always-visible tabs) lets the searcher choose games / lists / users before
  or while typing; results are homogeneous per search (never mixed types in
  one list).
- **Matching:** username only for people (see Non-goals). List search
  matches on list name (not description, consistent with keeping this
  narrow).
- **Privacy:** a private list is excluded from search results for everyone
  except its own owner — same rule the list pages themselves already
  enforce (404 to a non-owner).
- **"Browse all" stays games-only**, unchanged from the current mobile
  behavior (opens `/games` / the catalogue, pre-filtered by the query).
- **No parallel fan-out across types.** The type filter is chosen first;
  only the active type's query fires per search. Switching tabs after
  typing re-queries, it doesn't pre-fetch the other two in the background.
  This keeps usage of the existing shared `consumeSearchRateLimit` budget
  (120 req/60s, shared across games/taxonomy/people/lists search alike)
  roughly in line with today's per-keystroke-or-submit pattern — no new
  rate-limit bucket or schema change needed for this feature.
- **Profiles have no findability opt-out, and this feature doesn't change
  that.** `apps/web/app/sitemap.ts` already includes every user profile
  unconditionally ("there are no private profiles"), and `users`' RLS policy
  is a blanket `true`. Unlike library/loadout/default-list, there is no
  profile-level privacy flag anywhere in this app today. Search surfaces
  something that's already fully public and already unconditionally
  discoverable (sitemap, direct URL) — it doesn't introduce a new exposure
  or require a new privacy mechanism.
- **The "Find people to follow" empty-feed CTA gets updated** to deep-link
  into this search, pre-filtered to people, instead of opening plain
  `/explore` as it does today (`FEED_EMPTY.actionLabel` in
  `packages/shared/feed-copy.ts`, rendered in `apps/web/app/page.tsx` and its
  mobile equivalent). Otherwise this feature ships without actually closing
  the gap that motivated it. Exact deep-link mechanism (a query param such as
  `?type=users`, read by Explore to pre-select the filter) is left to the
  builder.
- **Search fires as-you-type (debounced), not on submit.** This is a
  deliberate departure from mobile's existing games-search behavior (see
  Current state above), confirmed with the product owner after the
  builder-check surfaced the discrepancy. All three types (games, lists,
  people) get the new debounced behavior, replacing mobile's current
  submit-triggered games search rather than leaving it inconsistent with the
  other two. Debounce timing, the loading-state treatment while a request is
  in flight, and in-flight request cancellation when the query changes again
  are left to the builder.

## Constraints / existing conventions this must follow

- `AGENTS.md`: a new client-callable query function goes in the
  domain-appropriate file (`lib/queries/user.ts` for people search,
  `lib/queries/list.ts` for list search) — not a new shared file, and not
  mixed into a file that also exports `supabase-js`-only functions.
- Any new search function must call `consumeSearchRateLimit` after its query
  parses, in the same function `test/api/v1-routes-auth.test.ts` scans for —
  both the Server Action and the `/api/v1` route version.
- New `/api/v1` routes follow `GET /api/v1/games/search`'s exact shape:
  `withAuth`, `getBearerUser()`, a small zod query-parser module (pattern:
  `lib/game-reviews-query.ts` / the implicit one behind
  `parseGameSearchQuery`), `ApiError(400, 'invalid_request', …)` on a bad
  param, `consumeSearchRateLimit`, `Cache-Control: private, no-store`.
- Response/request types belong in `@screenpeak/shared/api/*` (extend
  `packages/shared/api/search.ts`), and the shared client
  (`packages/shared/api/client.ts`) gets new `api.users.search(...)` /
  `api.lists.search(...)` methods following the existing
  `api.games.search(...)` / `api.taxonomy.search(...)` shape.
- Reuse `containsPattern()` (exported from `lib/queries/game.ts`) for the
  `ILIKE` pattern rather than re-deriving the escaping logic.
- Bulk follower counts: the existing `getProfileFollowStats` per-profile
  `COUNT(*)` is not reusable as-is for N search results in one query — this
  needs its own aggregate (e.g. one query joining `follows` grouped by
  `following_id` for the set of matched user ids), not N queries.

## What's left to the builder

- Exact new DB query function signatures and SQL (follow `searchGamesByName`
  as the template).
- Minimum query length, if any (match whatever `searchGamesByName` already
  enforces, unless there's a reason to diverge).
- The exact filter-control UI (button vs. segmented control) and its visual
  design, within existing design tokens (`app/globals.css` custom
  properties) — no hardcoded hex.
- New route file paths: `GET /api/v1/users/search`, `GET /api/v1/lists/search`.
- Mobile wiring: extending `explore-screen.tsx` with the type filter and the
  two new row components (list row, user row), reusing `SearchHitRow`'s
  existing visual language.
- Web: building the Explore search UI from scratch, matching mobile's
  interaction model exactly (no divergent web-only design).
- Tests, following this codebase's existing search test conventions
  (`test/lib/search.test.ts`, `test/lib/search-actions.test.ts`,
  `test/api/search-routes.test.ts` are the reference files for the new
  people/list equivalents).
