# ScreenPeak Mobile — Build Plan

A plan for shipping ScreenPeak as a native iOS + Android app alongside the
existing Next.js web app. Written 2026-09-25 against the codebase at `562ff48`.

Catalogue art and metadata come from IGDB. A game page shows You and Community, both out of 10. Ongoing catalogue notes are in `docs/igdb.md`.

**TL;DR**

- **Stack:** Expo (React Native) with Expo Router, TypeScript, TanStack Query,
  Supabase Auth on-device. One codebase, both stores.
- **Backend:** the existing Next.js app grows a versioned JSON API
  (`app/api/v1/*`). The website does **not** switch over to calling it — both
  the website and the API call the same shared server functions.
- **Repo:** convert to an npm-workspaces monorepo: `apps/web`, `apps/mobile`,
  `packages/shared`.
- **Size:** roughly 10–16 weeks of focused part-time work, most of it rebuilding
  the 14 screens as native UI. Backend work is ~20% of the total because
  `lib/queries/*` already carries the logic.

---

## Part 1 — Your open questions

### 1. Should the website's Server Actions be changed to call the API routes?

**No. Share the logic, not the transport.**

Look at what a Server Action actually is today (`app/list-actions.ts`):

```ts
export async function toggleListLike(listId: string, liked: boolean) {
    const user = await requireUser()
    return liked ? unlikeList(listId, user.id) : likeList(listId, user.id)
}
```

It's a three-line adapter: *authenticate → call `lib/queries` → return*. The
equivalent API route is the same three lines with a different wrapper:

```ts
// app/api/v1/lists/[listId]/like/route.ts
export async function POST(req: NextRequest, ctx: RouteContext<'/api/v1/lists/[listId]/like'>) {
    const user = await requireUser()          // bearer token (the app) or cookie (the site)
    const { listId } = await ctx.params
    return NextResponse.json(await likeList(listId, user.id))
}
```

So the architecture becomes:

```
  Web (Server Components / Server Actions) ─┐
                                            ├─► lib/loaders/*  +  lib/queries/*  ─► Postgres
  Mobile ──HTTP──► app/api/v1/* (route handlers) ┘
```

Why not make the website fetch its own API?

- **It adds a network hop for nothing.** Server Components run *on the server*;
  having them `fetch('https://screenpeak…/api/v1/...')` means the server calls
  itself over HTTP, re-serializes JSON, and re-authenticates — slower, and more
  failure modes.
- **You'd lose what Server Components give you** (streaming SSR, no client
  waterfall, SEO-friendly HTML) and rewrite ~20 working web components for zero
  user-visible benefit.
- **Server Actions and API routes are both just adapters.** The thing worth
  sharing — authorization + privacy gating + the query — lives below both.

What *does* change on the web side (small, and it helps both clients):

1. **Extract page loaders.** Each `page.tsx` currently does its own data
   gathering (e.g. the game page calls `getGameBySlug`, `getGameTaxonomy`,
   `getGameRatingsStats`, `getUserRatingReviewForGame`, …). Move each page's
   loading into `lib/loaders/<page>.ts` → `loadGamePage(slug, viewerId)`. The
   page and `GET /api/v1/games/[slug]` both call it. **This is also where
   privacy gating must live** — remember `db` bypasses RLS, so if the library
   page checks `library_public` in `page.tsx`, the API route would silently skip
   that check unless the check moves into the shared loader.
2. **Make auth accept a bearer token.** `requireUser()` (`lib/auth.ts`) read
   the Supabase session from cookies. The mobile app sends
   `Authorization: Bearer <access_token>` instead, so `requireUser()` /
   `getOptionalUser()` check that header first (via Next's `headers()`) and fall
   back to cookies — one pair of helpers for pages, actions and routes.

> Why can't the mobile app just call Server Actions directly? They *are* HTTP
> POST endpoints under the hood, but they're addressed by an opaque ID that
> changes every build and use React's internal wire format. They're a private
> contract between your Next.js build and its own frontend — a phone app pinned
> to last month's build would break on every deploy.

### 2. React Native / Expo vs Swift? Is React used for mobile? RN vs Expo?

**Expo (React Native) is the right call for you.**

| | Expo / React Native | Swift (SwiftUI) |
|---|---|---|
| Platforms | iOS **and** Android from one codebase | iOS only (Android = a separate Kotlin app) |
| Language | TypeScript — same as the web app | Swift — new language, new toolchain |
| Code reuse | Types, zod schemas, API contract types, design tokens, React mental model | None — every type and validation rule rewritten |
| Feel | Genuinely native views (not a WebView); ~95% of what SwiftUI can do | The gold standard for iOS polish |
| When it's worse | Heavy custom animation, AR, deep OS integrations | Almost never, if you only care about iPhone |

ScreenPeak is a data-driven social app — lists, cards, forms, feeds, a chart.
That's exactly React Native's sweet spot. Swift would only win if you were iOS-
only forever *and* wanted to learn a second language.

**Is React used for mobile a lot?** Yes — React Native is the most-used
cross-platform framework alongside Flutter. Meta (parts of Facebook,
Instagram, Messenger), Microsoft (Office, Teams pieces, Xbox app), Shopify
(moved its apps to RN), Discord, Coinbase, and Bluesky all ship it.

**React Native vs Expo** — they're layers, not competitors:

- **React Native** is the core framework: it lets React components render real
  iOS/Android views (`<View>`, `<Text>`, `<Pressable>` instead of `<div>`,
  `<span>`, `<button>`). On its own it's fairly bare — you'd wire up navigation,
  builds, native modules, and Xcode/Android Studio yourself.
- **Expo** is a framework *on top of* React Native — roughly what Next.js is to
  React. It adds:
  - **Expo Router** — file-based routing, deliberately modeled on the Next.js
    App Router. `app/games/[slug].tsx` works the way you'd expect.
  - **The Expo SDK** — maintained native modules (secure storage, image picker,
    fonts, haptics, notifications, web-browser auth sessions, …).
  - **EAS** (cloud services) — builds your `.ipa`/`.apk` in the cloud, submits
    to the stores, and ships over-the-air JS updates without a store review.
  - **Expo Go / dev builds** — scan a QR code, see your app live on your phone.

The React Native team's own docs recommend starting new apps with a framework,
and Expo is the one they point to. "Plain" RN without Expo is now the niche
choice.

### 3. Same project in a new folder, or a whole new project?

**Same repo, restructured as a monorepo:**

```
screenpeak/
├── package.json            # workspaces root: ["apps/*", "packages/*"]
├── apps/
│   ├── web/                # the current Next.js app, moved as-is
│   │   ├── app/  lib/  db/  scripts/  test/  public/ …
│   │   └── package.json
│   └── mobile/             # new Expo app
│       ├── app/            # Expo Router screens
│       ├── components/
│       ├── lib/api/        # fetch client for /api/v1 (mobile is its only user)
│       └── package.json
└── packages/
    └── shared/             # imported by BOTH apps
        ├── types/          # moved from ./types
        ├── schemas.ts      # moved from lib/schemas.ts (already client-safe)
        ├── tokens.ts       # colours/fonts/spacing from globals.css as JS
        └── api/            # request/response types for /api/v1 (the contract)
```

Why a monorepo rather than a separate repo:

- **The API contract lives in one place.** Change a response type in
  `packages/shared` and TypeScript flags *both* the route handler and the
  mobile screen in the same commit. In two repos you'd find out at runtime.
- **One PR can change backend + app together.** As a solo dev this matters a lot.
- **Expo supports it natively.** Since SDK 52, Expo auto-detects npm
  workspaces and configures Metro (its bundler) — no manual config.

Why not just add a `mobile/` folder and leave the web app at the root? The root
`package.json` would be both "the web app" and "the workspace root", which
makes dependency hoisting confusing (two React versions fighting in one
`node_modules`). Moving the web app into `apps/web` is a one-time mechanical
commit.

**The rule for `packages/shared`:** it must never import `db`, `postgres`,
`next/*`, or anything server-only. Everything in it gets bundled *into the
phone app*, and two things are true of a phone app:

1. **It can't hold database credentials.** An app binary can be unpacked by
   anyone who downloads it; a `DATABASE_POOL_URL` in there is a public,
   RLS-bypassing key to your whole database.
2. **It can't run the Postgres driver.** `postgres` needs Node's `net`/`tls`/`fs`,
   which don't exist in React Native — same failure as `Can't resolve 'fs'` on
   the web, just on a different client.

So **`db` is only ever used inside `apps/web`** — the one process that runs on a
server you control. `packages/shared/api` holds the *contract* — types only,
no queries and no fetching:

```
packages/shared/api/          ← NO db, no runtime code. Imported by both apps.
  types.ts                      GamePageData, UpdateLibraryEntryBody, ApiError …

apps/mobile/lib/api/          ← the phone's side of the contract.
  client.ts                     api.games.get(slug) → fetch(`${BASE}/api/v1/games/${slug}`)
                                (adds the bearer header, parses JSON, throws ApiError)

apps/web/                     ← the ONLY place db is imported.
  lib/queries/*.ts              Drizzle queries (unchanged)
  lib/loaders/*.ts              per-screen bundles of queries + privacy gates
  app/api/v1/**/route.ts        thin HTTP adapter → loaders/queries,
                                typed with `satisfies GamePageData`
  app/**/page.tsx               thin RSC adapter  → loaders
  app/*-actions.ts              thin action adapter → queries
```

A request from the phone:

```
Game screen ─► api.games.get('elden-ring')          (apps/mobile/lib/api/client.ts, on the phone)
            ─► HTTPS GET /api/v1/games/elden-ring
            ─► route.ts ─► loadGamePage() ─► lib/queries/* ─► db ─► Postgres   (all in apps/web, on the server)
            ◄─ JSON typed as GamePageData (the same type both sides import)
```

What's shared is the **shape of the data**, not the code that fetches it. The
route handler and the mobile screen both import `GamePageData`, so
TypeScript fails the build if they drift apart.

Harden the boundary on day one: add `import 'server-only'` as the first line of
`apps/web/lib/db.ts` (the package is already a dependency — `lib/r2.ts` uses
it). Then an accidental client import fails with *"This module cannot be
imported from a Client Component"* instead of a confusing `Can't resolve 'fs'`.

> **About the `game-search.ts` / `feed-constants.ts` precedent.** Those splits
> are really two different situations:
>
> - **`feed-constants.ts` is a genuine bundling fix.** `FeedList.tsx` needs only
>   the number `12`, but importing *anything* from `feed.ts` evaluates the whole
>   module, including `import { db } from '@/lib/db'`. This is the exact failure
>   mode `packages/shared` must avoid. (Once `packages/shared` exists,
>   `FEED_PAGE_SIZE` belongs there — the mobile feed needs it too.)
> - **`game-search.ts` is a leftover, not a necessity.** Its three functions query
>   public tables (`games`, `developers`, `publishers` have `USING (true)` read
>   policies), so when the Drizzle migration happened they were left on the
>   browser Supabase client rather than given an action. Phase 1 moves them onto
>   `db` and gives the web components **Server Actions**, the same pattern as
>   every other client component. Mobile gets `GET /api/v1/games/search` for the
>   same underlying query function. (All three components already debounce by
>   300 ms, so Next.js dispatching Server Actions one at a time doesn't matter
>   in practice — see Phase 1 step 6.)

### 4. Web vs app development — is it mostly UI?

UI is the biggest *chunk of work*, but the differences that bite are about
**distribution, state, and the platform**:

| Area | Web (what you're used to) | Mobile |
|---|---|---|
| **Shipping** | `git push` → live in a minute | Store review (hours–days). JS-only fixes can go out via EAS Update; anything touching native code needs a new store build. |
| **Old versions** | Everyone always runs the latest | **People run old versions for months.** Your API must stay backward-compatible — never rename/remove a field in `/api/v1`; add new fields, or make `/api/v2`. |
| **Navigation** | URLs, back button, links | A *stack* of screens + tabs, swipe-back gestures, state preserved when you go back. URLs only matter for deep links. |
| **Layout** | CSS, flexbox/grid, hover | Flexbox only (column by default), no CSS cascade, no hover, safe areas (notch, home indicator), the keyboard covering inputs. |
| **Lists** | Render 200 `<div>`s, fine | Must virtualize (`FlatList` / FlashList) or scrolling stutters. |
| **Network** | Assume it works | Flaky/offline is normal — cache, retry, show stale data, pull-to-refresh. |
| **Auth** | httpOnly cookies | Tokens in the device keychain (`expo-secure-store`), refreshed by the Supabase client. |
| **Data loading** | Server Components render with data | Client fetches everything → you need a cache layer (TanStack Query) and loading/empty/error states for every screen. |
| **Platform rules** | None | App Store Review Guidelines, Google Play policies, privacy nutrition labels, in-app account deletion (you already have it ✓). |
| **Device features** | Limited | Push notifications, haptics, share sheet, photo picker, biometrics — the reasons people prefer an app. |
| **Testing** | Browser devtools | Simulators *and* real devices; two OSes behave differently. |
| **Cost** | Hosting | Apple Developer Program $99/yr, Google Play $25 one-time. |

---

## Part 2 — Architecture

### Mobile stack

| Concern | Choice | Notes |
|---|---|---|
| Framework | Expo SDK 56+ (latest at start) | `npx create-expo-app@latest` |
| Routing | Expo Router | File-based; tabs + stacks |
| Server state | TanStack Query | Caching, infinite scroll (feed), optimistic updates (likes/follows), refetch on focus |
| Auth | `@supabase/supabase-js` + `expo-secure-store` | Sign in/up/out/reset happen directly against Supabase Auth, just like the web |
| Styling | **`StyleSheet` + `tokens.ts`** (decided in the Phase 0 spike — NativeWind v5 doesn't build yet; see Phase 0 step 5) | Tokens come from `packages/shared/tokens.ts`, mirroring `globals.css`; mobile imports them via `@/theme` |
| Fonts | `expo-font` + `@expo-google-fonts/{chakra-petch,ibm-plex-sans,ibm-plex-mono}` | Same three families and weights as the web; per-weight imports, weight chosen by `fontFamily` |
| Images | `expo-image` | Caching for IGDB cover art + R2 avatars |
| Charts | CSS bars on the web (`DistributionChart`) | No chart library. A native chart can wait until a screen needs one. |
| Icons | `lucide-react-native` | Same icon set the web uses |
| Errors | `@sentry/react-native` | Same Sentry org as the web |
| Builds / release | EAS Build, EAS Submit, EAS Update | |
| Tests | `jest-expo` + React Native Testing Library; Maestro for E2E flows | |

### Auth flow

```
Phone ── signInWithPassword ──► Supabase Auth ──► access + refresh token
  │                                                (kept in SecureStore,
  │                                                 auto-refreshed)
  └── fetch /api/v1/…  Authorization: Bearer <access_token>
                              │
                    requireUser() / getOptionalUser()
                      → supabase.auth.getUser(token)   (never trusts claims locally)
                      → { id, email }
```

As built in Phase 1 step 1 (`lib/auth.ts`) — two helpers, no `req` parameter,
because Next's `headers()` / `cookies()` read the current request from Server
Components, Server Actions and Route Handlers alike:

```ts
getOptionalUser(): Promise<{ id, email } | null>  // null = signed out (read endpoints: a game page, a public profile)
requireUser():     Promise<{ id, email }>         // throws UnauthenticatedError (401) when signed out
```

Both check `Authorization: Bearer` first (the app), else the session cookie (the
site), and verify with the Auth server. A bad bearer token is a 401
`invalid_token` even from `getOptionalUser()` — it never falls back to a cookie —
and an Auth outage is a 503 `auth_unavailable`, never a 401.

Route handlers are wrapped in `withAuth(handler)` (`lib/api.ts`), which turns a
thrown `ApiError` into the standard `{ error: { code, message } }` JSON response,
so every route doesn't repeat try/catch. Native apps don't enforce CORS, so no
CORS config is needed for the mobile client.

**Email links** (confirm signup, password reset) keep landing on the website's
`/auth/confirm` for v1. Later, iOS Universal Links / Android App Links can make
`screenpeak.app/auth/confirm` open the app instead.

### The one tricky flow: Steam linking

Today `GET /api/steam/link` → Steam → `GET /api/steam/callback` identifies the
user **from the session cookie**. On the phone, the Steam page opens in a
system browser sheet (`expo-web-browser` `openAuthSessionAsync`) that doesn't
have that cookie, so the callback won't know who you are.

Fix:

1. App calls `POST /api/v1/me/steam/link-intent` (bearer-authed). Server
   returns a short-lived (5 min), single-use, HMAC-signed `state` token that
   encodes the user id.
2. App opens `/api/steam/link?state=…&client=mobile`. `getSteamAuthUrl` puts
   `state` into the OpenID `return_to` URL (`lib/steam-openid.ts:8`), so Steam
   sends it back and OpenID verification covers it.
3. Callback: if `state` is present, verify it → user id; otherwise fall back to
   the cookie (web). Redirect to `screenpeak://steamlink?ok=1` for mobile, or
   `/steamlink` for web.
4. `openAuthSessionAsync` sees the `screenpeak://` redirect, closes the sheet,
   and the app navigates to its Steam import screen.

### What a loader returns

One object per screen — but a *typed, named* object shaped like the screen,
not a grab-bag. Today `app/games/[slug]/page.tsx` does eight sequential
`await`s (lines 98–134). As a loader:

```ts
// apps/web/lib/loaders/game-page.ts
import 'server-only'

export async function loadGamePage(slug: string, viewerId: string | null) {
    const game = await getGameBySlug(slug)
    if (!game) return null                       // page → notFound(); route → 404

    const [taxonomy, stats, viewer] = await Promise.all([
        getGameTaxonomy(game.id),
        getGameRatingsStats(game.id),
        viewerId ? loadViewerGameState(game.id, viewerId) : null,
    ])
    return { game, taxonomy, stats, viewer }      // satisfies GamePageData
}

async function loadViewerGameState(gameId: Game['id'], userId: string) {
    const [review, libraryEntry, lists, settings] = await Promise.all([
        getUserRatingReviewForGame(gameId, userId),
        getLibraryEntry(userId, gameId),
        getUserLists(userId, true),
        getAccountSettings(userId),
    ])
    const listIdsGameIsIn = await getGameListMembership(gameId, lists.map(l => l.id))
    return { review, libraryEntry, lists, listIdsGameIsIn, settings }
}
```

So the JSON looks like:

```jsonc
{
  "game":     { "id": "…", "name": "Elden Ring", "slug": "elden-ring", … },
  "taxonomy": { "genres": […], "platforms": […], "developers": […], … },
  "stats":    { "avg": 8.7, "count": 41, "distribution": […] },
  "viewer":   null   // signed out; otherwise { review, libraryEntry, lists, listIdsGameIsIn, settings }
}
```

Rules of thumb for where to draw the lines:

- **Group by "who can see it".** Public data at the top level, everything that
  depends on who's asking under `viewer`. It keeps the privacy logic in one
  obvious place and makes signed-out responses trivially correct.
- **Paginated or independently-changing data gets its own endpoint.** Reviews
  are paged and sorted separately, so they're
  `GET /games/[slug]/reviews?page=` — not part of the page bundle. (The web
  page can still call both loaders.)
- **Run independent queries in `Promise.all`.** A free win: the current page
  runs eight queries back-to-back; most of them don't depend on each other.
- **Don't be afraid of a big response.** A few KB of JSON in one request beats
  six round-trips on a phone network. Mobile latency, not payload size, is the
  usual bottleneck.
- **After a mutation, refetch what changed.** Rating a game invalidates the
  `['game', slug]` query in TanStack Query and it refetches the bundle — simple
  and correct. Only split `viewer` into its own endpoint later if that proves
  slow.

### API surface (`/api/v1`)

**Reads map to screens** — one call per screen via the shared loaders, rather
than 6 tiny calls. **Writes map 1:1 to the existing Server Actions.**

Reads (auth optional — the viewer changes what's included; privacy gates in the
loaders):

| Endpoint | Loader wraps | Web page |
|---|---|---|
| `GET /me` | `getOptionalUser`, `getProfileSummaryById` | layout/nav |
| `GET /feed?offset=` | `getFeed` (replaces the `fetchFeedPage` action for mobile) | `/` (signed-in) |
| `GET /explore` | `getTrendingGames`, `getTrendingLists`, `getExploreRecommendations`, `getHeroGame` | `/explore`, `/` |
| `GET /games?…filters` | `queryGames`, `getAllGenres`, `getAllPlatforms`, `getDistinctEsrbRatings` | `/games` |
| `GET /games/search?q=` | `searchGamesByName` | search boxes |
| `GET /games/[slug]` | `getGameBySlug`, `getGameTaxonomy`, `getGameRatingsStats`, viewer's rating/library entry/list membership | `/games/[slug]` |
| `GET /games/[slug]/reviews?page=` | `getGameReviewsForPage` | `/games/[slug]` |
| `GET /users/[username]` | `getFullProfile`, `getFeaturedLoadout`, `getRecentReviews`, follow state | `/user/[username]` |
| `GET /users/[username]/library?…` | `getLibraryEntries`, `getLibraryFacets` — **gate on `library_public`** | `…/library` |
| `GET /users/[username]/lists` | `getUserLists`, `getLikedLists`, `getListCoverMap` | `…/lists` |
| `GET /lists/[listId]` | `getListById`, `getListGames`, `getListLikes` — **gate on `is_public`** | `…/lists/[listId]` |
| `GET /users/[username]/reviews?page=` | `getUserRatingsReviewsPage`, `…Counts` | `…/ratings_reviews` |
| `GET /users/[username]/loadout` | `getLoadoutGenreStats`, `…DeveloperStats`, `…StatusBreakdown`, `…RatingHighlights`, `getCurrentLoadoutIdentity` | `…/loadout` |
| `GET /users/[username]/followers`, `/following` | `getFollowers`, `getFollowing` | profile |
| `GET /me/settings` | `getAccountSettings`, `getSteamAccount` | `/settings` |
| `GET /me/steam/library` | Steam owned games + `getGamesFromSteamIds` | `/steamlink` |

Writes (auth required):

| Endpoint | Replaces Server Action |
|---|---|
| `PUT /games/[gameId]/review` | `submitRatingReview` |
| `GET` / `PUT` / `DELETE /me/library/[gameId]` | `fetchLibraryEntry`, `addOrUpdateLibraryEntry`, `removeLibraryEntry` |
| `POST /me/library/import` | `importSteamLibraryEntries` |
| `POST /lists`, `PATCH /lists/[listId]` | `createOrUpdateList`, `createListAndAddGame`, `toggleListPinned` |
| `POST` / `DELETE /lists/[listId]/like` | `toggleListLike` |
| `POST` / `DELETE /lists/[listId]/games/[gameId]` | `toggleGameInList`, `removeGameFromListAction` |
| `POST /lists/[listId]/games/sync` | `syncListGamesAction` |
| `PATCH /me` `{username?, bio?, selectedTitle?, loadoutBio?, favoriteGames?, privacy?}` | `saveUsername`, `saveBio`, `saveSelectedTitle`, `saveLoadoutBio`, `saveFavoriteGames`, `togglePrivacyAction` |
| `DELETE /me/loadout` | `clearLoadout` |
| `POST /me/avatar/upload-url`, `PUT /me/avatar` | `createAvatarUploadUrl`, `saveAvatarUrl` |
| `POST` / `DELETE /users/[userId]/follow` | `toggleFollow` |
| `POST /me/steam/link-intent`, `DELETE /me/steam` | new, `unlinkSteamAccountAction` |
| `POST /api/loadout` | existing — just switch to `requireUser()` + `withAuth` (`DELETE /api/delete-account` and `GET /api/steam/link` already did) |

Note on write semantics: the web actions are "toggle" style
(`toggleListLike(listId, liked)`). The API uses explicit verbs
(`POST` = like, `DELETE` = unlike) so a retried request on a flaky connection
can't flip state the wrong way. The web actions can keep their signatures.

Also add **`GET /api/v1/app-config`** → `{ minSupportedVersion, … }` on day one,
so you can force old app versions to upgrade if you ever *must* break the API.

---

## Part 3 — Phased build plan

Estimates are focused part-time weeks. Each phase ends with something working.

### Phase 0 — Setup & spikes (≈1 week)

Goal: an Expo app running on your phone, inside the monorepo, with the web app
behaving on localhost exactly as it did before the move.

1. **Accounts**: enroll in the Apple Developer Program ($99/yr — approval can
   take a day or two, start now), Google Play Console ($25), and an Expo account.
2. **Monorepo move** — its own commit, nothing else in it. See
   [Appendix A](#appendix-a--the-monorepo-move-step-by-step) for the full
   file-by-file list. The short version:
   - **Before touching anything, record a baseline** on localhost (A.1).
   - **Move** every web-app file — including all Next/Tailwind/ESLint/Vitest/
     Drizzle/Sentry configs — into `apps/web/`. **Stay at root:** git and editor
     config, the new workspace `package.json` + lockfile, and repo-wide docs (A.2).
   - Fix the few things a move breaks: `.gitignore` anchors, the split
     `package.json`, env files (A.3).
   - Re-run the baseline and compare (A.4). **Don't continue until it matches.**
   - Update AGENTS.md paths.

   > **Done** (`182f582`). Rte table, test counts and the A.1 checklist all
   > matched. Gotcha: the editor's "update imports on move" rewrote `@/x` to
   > `@/apps/web/x` in 71 files — `@/` is relative to `apps/web/`, so undo that.
3. **Create the app**:
   `npx create-expo-app@latest --template default@sdk-56 apps/mobile`, then
   `npm install` from the **root**. Run `npx expo start` in `apps/mobile`, open
   on your phone.

   > **Done — on SDK 57** (Expo Go required it; use `default@sdk-57` and add
   > `--no-install` so the template doesn't install on its own and create a
   > second lockfile). Two things the upgrade broke, both now fixed:
   > duplicate native modules, because npm hoists one shared `node_modules` and
   > the web's React sat at the root (see step 5 — React is now pinned
   > monorepo-wide); and stale lockfile placements left SDK 56 copies at the root
   > / Expo packages nested under `apps/mobile`, so `expo start` couldn't find
   > `expo-router`. If `npx expo-doctor` reports duplicates after an upgrade,
   > delete the stale `package-lock.json` entries for those packages and reinstall.
   > Root scripts end in ` --` so flags pass through: `npm run mobile -- --clear`.
4. **Create `packages/shared`**: move `types/`, `lib/schemas.ts`, and
   `FEED_PAGE_SIZE` in; add `tokens.ts` (hand-copy the values from
   `globals.css` — it's ~20 values). Import from both apps to prove the wiring.
   Add `import 'server-only'` to `apps/web/lib/db.ts` in the same step.

   > **Done.** `@screenpeak/shared` exports `./types`, `./types/*`, `./schemas`,
   > `./constants` (`FEED_PAGE_SIZE`) and `./tokens` — import those paths, e.g.
   > `@screenpeak/shared/types`. Web pulls it in via `transpilePackages`.
   > `apps/web/test/shared/tokens.test.ts` fails if a colour in `tokens.ts`
   > drifts from `globals.css`, so the hand-copy can't silently go stale.
   > `server-only` was already on `db.ts`.
5. **Spikes** (throwaway code, 1 day each max):
   - Styling: build the `Eyebrow` + a game card in NativeWind *and* in
     `StyleSheet` + tokens. Pick one.
   - Fonts: load Chakra Petch / IBM Plex, confirm they render.
   - React versions: check that Expo SDK and Next.js want compatible React
     versions; if they differ, keep each pinned in its own app's `package.json`
     and make sure `packages/shared` has **no** React dependency.

   > **Done.**
   > - **Styling → `StyleSheet` + tokens.** NativeWind v5 (Tailwind v4, still a
   >   release candidate) fails to build here: its CSS compiler breaks on the
   >   `lightningcss@1.32` that Tailwind 4.3 pins, and npm can't give the two
   >   separate copies. NativeWind v4 needs Tailwind v3 beside the web's v4 — the
   >   same two-versions-in-one-`node_modules` problem as React. Even working, fonts
   >   need a class per weight file and the palette a third copy in CSS. Revisit
   >   when v5 is stable. Mobile styles import from `@/theme` (`apps/mobile/src/theme`),
   >   which re-exports `packages/shared/tokens.ts`; `Eyebrow`, `Seal` and
   >   `GameCard` are ported in `apps/mobile/src/components/`.
   > - **Fonts → work in Expo Go**, loaded at runtime with `useFonts` in the root
   >   layout (splash stays up until they're ready). Import each weight from its
   >   own entry point (`@expo-google-fonts/chakra-petch/600SemiBold`) — the
   >   package index bundles all 38 files. Pick weights by `fontFamily`
   >   (`face.mono[600]`), never `fontWeight`. Before release, consider the
   >   `expo-font` config plugin to embed them (no load delay; needs a dev build).
   > - **React versions → they differ, and per-app pinning doesn't work.** npm
   >   workspaces share one hoisted `node_modules`, so the web's React landed at
   >   the root and got bundled next to mobile's ("Invalid hook call"). React
   >   Native's renderer needs an *exact* match, so React is pinned to the Expo
   >   SDK's version in both apps **and** the root `overrides`; AGENTS.md has the
   >   upgrade steps. `packages/shared` has no React dependency.

### Phase 1 — API layer on the web backend (≈2–3 weeks)

Goal: every screen's data and every mutation available over `/api/v1`, with
tests. The website is unchanged for users.

1. Bearer-token auth (`requireUser` / `getOptionalUser`) + `withAuth` + a standard JSON error shape
   (`{ error: { code, message } }`). Tests: bearer valid / expired / missing /
   cookie fallback.
   > **Done.** `lib/auth.ts` (`getOptionalUser`, `requireUser` — planned as
   > `…FromRequest(req)`, but `headers()` makes the `req` parameter unnecessary, so
   > the same two helpers serve pages, actions and routes; `getViewer` is gone),
   > `lib/api.ts` (`ApiError`, `withAuth`, `apiError`), `lib/supabase-stateless.ts`, and the error contract in
   > `@screenpeak/shared/api/errors`. Verified with `getUser` (not `getClaims`) so
   > revocation is immediate. Beyond the four named cases: a bad bearer fails
   > closed (no cookie fallback), `getOptionalUser` still rejects a bad token, and an
   > Auth outage is 503 `auth_unavailable` — never a 401 that signs the app out.
   > Checked live against Supabase via a throwaway route (401s, `WWW-Authenticate`,
   > `RouteContext` typing). AGENTS.md "Who's calling" has the usage rules.
   > `DELETE /api/delete-account` and `GET /api/steam/link` use `requireUser()` +
   > `withAuth`; `POST /api/loadout` still has its own ad-hoc check — switch it
   > when step 4 reaches it (see the endpoint table).
2. Extract loaders, one page at a time: move data gathering from `page.tsx` into
   `lib/loaders/*.ts`, point the page at it, confirm the page still renders,
   then add the `GET` route. Start with `games/[slug]` (most complex, most
   valuable).

   > **`games/[slug]` done.** `lib/loaders/game-page.ts` (`loadGamePage` +
   > `loadViewerState`), contract `GamePageData` in `@screenpeak/shared/api/games`,
   > `GET /api/v1/games/[slug]` (`private, no-store`). The page renders from the
   > loader — visible text identical before/after for two games. Changes vs.
   > Appendix B: the viewer block sends `defaultListPrivacy` (not the whole
   > settings row) and `listIdsGameIsIn` as an array (the query's `Set` becomes
   > `{}` in JSON); lists are narrowed to `{ id, name, game_count }`; `game` is
   > built field by field so extra columns (`steam_appid`) don't leak; library
   > `hours_played` is a number.
   >
   > **`games/[slug]/reviews` done** — no loader: a single query needs none.
   > `getGameReviewsForPage` (`lib/queries/review.ts`) returns the shared
   > `GameReviewsPage` (`reviews`, `total`, `totalPages` — the request params aren't
   > echoed: the app already knows them, and bad values are rejected, never
   > adjusted), and both the page and `GET /api/v1/games/[slug]/reviews` call it.
   > It throws on a DB error (the API answers 500, not "no reviews"); the page
   > catches that and shows an empty list as before. URL parsing lives in
   > `lib/game-reviews-query.ts`.
   > Query params are strict in the API (bad value → 400 `invalid_request`, page
   > size ≤ 100 to match the web's menu) and lenient on the web page (per-field
   > fallback). Fixed unstable paging: the query now tie-breaks (rating →
   > `updated_at` → row id), so tied ratings no longer repeat/skip across pages.
   > Both game-page endpoints are done; next loader: another page.
3. **Privacy audit pass**: for every read endpoint, write a test that a
   non-owner cannot see a private library / private list. This is the #1 way
   this phase can go wrong — `db` bypasses RLS.
4. Write routes (mirror the Server Actions). Have both the action and the route
   call the same function; validate request bodies with the shared zod schemas.
5. Put request/response types in `packages/shared/api/`. (The fetch client that
   calls these routes lives in `apps/mobile/lib/api/` — Phase 2 — since the
   website never calls `/api/v1` itself.)
6. Retire `game-search.ts`: reimplement its three functions on `db` in
   `lib/queries/game.ts` (`searchGamesByName`, `searchTaxonomyTable`,
   `getTaxonomyNameBySlug`). Then, same pattern as every other feature:
   - **Web:** a new `app/search-actions.ts` with three one-line Server Actions;
     point `SearchableDropdown`, `FavoriteGamePicker`, and
     `AddToListFromListButton` at them. No auth needed — public tables.
   - **Mobile:** `GET /api/v1/games/search?q=` and
     `GET /api/v1/taxonomy/[table]/search?q=` calling the same query functions.
   - Remove `game-search.ts` and its AGENTS.md entry.

   Server Actions are dispatched one at a time from the client, but all three
   components debounce by 300 ms, so a queued request only happens when a
   search takes longer than the pause between bursts of typing — and in-order
   dispatch means a slow stale result can never overwrite a newer one (a race
   the current code actually has). If search ever needs HTTP caching or true
   parallelism, switching these three to the GET routes is a small change.
7. Steam `state` flow + `app-config` endpoint.
8. Consider rate limiting on write routes (Upstash or Vercel's firewall) — the
   API is now a public, documented surface in a way Server Actions weren't.

### Phase 2 — Mobile foundation (≈1–2 weeks)

Goal: sign in on the phone, navigate between empty screens, see real data on
one screen.

1. Navigation skeleton (Expo Router):
   ```
   app/
     (auth)/sign-in.tsx, sign-up.tsx, forgot-password.tsx
     (tabs)/_layout.tsx          # tab bar
     (tabs)/index.tsx            # Feed
     (tabs)/explore.tsx
     (tabs)/games/index.tsx      # Browse + search
     (tabs)/profile.tsx          # → your /users/[username]
     games/[slug].tsx
     users/[username]/index.tsx, library.tsx, lists.tsx, reviews.tsx, loadout.tsx
     lists/[listId].tsx
     settings.tsx, steamlink.tsx
   ```
2. Supabase client with SecureStore session storage; an auth context that
   redirects between `(auth)` and `(tabs)`.
3. API client in `apps/mobile/lib/api/` (bearer header, typed with the shared
   contract types — see Appendix B.3) + TanStack Query provider.
4. Theme + the core primitives, ported from `app/components/util/`:
   `Eyebrow`, `SectionHead`, `Wordmark`, `Panel`, `EmptyState`, `Avatar`, a
   rating badge (tier colours), buttons, text inputs, `Modal` → bottom sheet.
5. Sentry + a `__DEV__` API base URL (your LAN IP running `npm run dev`).

### Phase 3 — Screens (≈4–6 weeks)

Build in order of the core loop — each is shippable to TestFlight on its own:

1. **Game detail** — hero, the two-score compare (You and Community, both /10), taxonomy,
   reviews list. Then the actions: rate/review, library entry sheet,
   add-to-list sheet.
2. **Profile** — header, favorites, featured Loadout, follow/unfollow.
3. **Library** — virtualized list, filters/facets, status breakdown.
4. **Lists** — index, detail, create/edit, like, reorder/sync games.
5. **Feed** — infinite scroll (`useInfiniteQuery` + `FEED_PAGE_SIZE`), pull-to-refresh.
6. **Explore** and **Games browse** — search, filters.
7. **Ratings & reviews** page.
8. **Loadout** — stats charts + generate/clear.
9. **Settings** — username, bio, title, privacy toggles, avatar
   (`expo-image-picker` → presigned R2 PUT), email/password, delete account.
10. **Steam link + import** — the `state` flow from Part 2.

For each screen: loading skeleton, empty state, error + retry, pull-to-refresh,
and check it on a small phone (iPhone SE size) and with the keyboard open.

### Phase 4 — Native polish (≈1–2 weeks)

- **Deep links / Universal Links**: `screenpeak.app/games/elden-ring` opens the
  game screen in the app if installed. Requires an `apple-app-site-association`
  file and Android `assetlinks.json` served from the web app's `public/.well-known/`.
- **Share sheet**: share a game, list, or profile (as its web URL).
- **Haptics** on rate / like / follow; port the `screenpeak:plus1` tic as a
  native animation (Reanimated).
- **Optimistic updates** for like / follow / library status.
- **Push notifications** (optional for v1): new follower, list liked. Needs an
  Expo push token table + sending from the server.
- App icon, splash screen, dark-only status bar styling.

### Phase 5 — Release (≈1–2 weeks, partly waiting on review)

0. **Host the web app first.** Until now the phone has talked to `npm run dev`
   on your Mac over Wi-Fi. TestFlight testers can't reach your laptop, so the
   `/api/v1` backend needs a public HTTPS URL before any external build goes
   out. Since the site isn't in production yet, this is the natural moment to
   launch it — web and app can go live together. When you create the hosting
   project, set its **Root Directory to `apps/web`** (Vercel: Project →
   Settings → Build & Deployment) and copy the env vars from
   `apps/web/.env.local`. Point the mobile `production`/`preview` EAS profiles
   at that URL.
1. `eas build --profile preview` → TestFlight (iOS) and Internal testing
   (Android). Get 3–5 friends on it for a week.
2. Store listings: screenshots, description, keywords, privacy policy URL (you
   have `/policy` ✓), privacy nutrition labels / Data safety form (email,
   username, Steam ID, library data, Sentry diagnostics).
3. App Review notes: provide a demo account. Mention that account deletion is
   in Settings (Guideline 5.1.1(v) ✓). Sign in with Apple isn't required
   because you only offer email/password sign-in — Steam is account *linking*,
   not login. If you ever add "Sign in with Steam/Google", revisit Guideline 4.8.
4. `eas submit`. Expect a first-submission rejection or two; it's normal.
5. Decide an update policy: JS/UI fixes via `eas update`; native changes via a
   store build; bump `minSupportedVersion` only as a last resort.

---

## Part 4 — Getting started (the first sitting)

In order:

```bash
# 0. Branch
git switch -c mobile/monorepo

# 1. Sign up (in the browser): Apple Developer Program, Expo account.

# 2. Baseline, move, re-verify — follow Appendix A top to bottom.

# 3. Create the Expo app and install from the root
#    (done on SDK 57 — see Phase 0 step 3; use the current SDK and --no-install)
npx create-expo-app@latest --template default@sdk-57 apps/mobile --no-install
npm install

# 4. Run it — install "Expo Go" on your phone and scan the QR code
cd apps/mobile && npx expo start
```

Then do the Phase 0 spikes. When those are done, the first real task is
Phase 1 step 1 (bearer-token auth) followed by the `games/[slug]`
loader + endpoint, and then the Game detail screen. Getting that one vertical
slice working end-to-end (Postgres → loader → route → shared types → TanStack
Query → native screen) proves out every layer before you repeat the pattern
13 more times.

---

## Risks & watch-outs

- **Privacy leaks through the API.** `db` bypasses RLS; every read endpoint
  touching libraries or private lists needs an app-code gate and a test.
- **API breaking changes.** Old app versions stay in the wild. Additive changes
  only in `/api/v1`.
- **Bundle contamination.** `packages/shared` must stay free of server imports
  (see AGENTS.md on `game-search.ts`).
- **Duplicate React** in the monorepo — the classic "Invalid hook call" error.
  Per-app pins don't survive npm hoisting: pin one exact React (the Expo SDK's)
  in both apps *and* the root `overrides`, and bump it on every SDK upgrade.
- **Scope creep.** v1 of the app = parity with the website. Push notifications
  and offline mode can wait for 1.1.
- **AGENTS.md drift.** Update it after the monorepo move and after the API
  layer lands — the Supabase client table and Structure section both change.

---

## Appendix A — The monorepo move, step by step

The site isn't in production yet, so "still works" means **"behaves the same on
localhost before and after"**. That's fine — the move changes *where files
live*, not what they do, so a local before/after comparison catches everything
it can break.

### A.1 Record a baseline (on `main`, before moving anything)

Use a **production build**, not `npm run dev` — `next build` is what catches
bundling problems (like the `Can't resolve 'fs'` class of bug), and it prints a
route table you can diff.

```bash
mkdir -p ~/screenpeak-baseline
npm run lint        > ~/screenpeak-baseline/lint.txt  2>&1
npx tsc --noEmit    > ~/screenpeak-baseline/tsc.txt   2>&1
npm test            > ~/screenpeak-baseline/test.txt  2>&1
npm run build       > ~/screenpeak-baseline/build.txt 2>&1   # ends with the route table
npm run start                                                # serves the build on :3000
```

Then click through this checklist and note anything already broken, so you
don't blame the move for it later:

- [x] `/` signed out, then sign in → `/` shows the feed; scroll loads page 2
- [x] `/explore`, `/games` (apply a filter), `/games/<some-slug>`
- [x] `/user/<you>` and each tab: library, lists, a list detail, ratings & reviews, loadout
- [x] `/settings`, `/steamlink`, `/policy` ← reads `app/policy/policy.html` via `process.cwd()`
- [x] `/opengraph-image` and `/games/<slug>/opengraph-image` ← read `assets/fonts` via `process.cwd()`
- [x] One write of each kind: rate a game, change library status, like a list, follow someone
- [x] Search in the favorite-game picker (exercises `game-search.ts`)
- [x] Upload an avatar (R2 presigned PUT)

### A.2 What moves and what stays

The principle: **each tool reads its config from its own project folder**. Next
reads `next.config.ts` next to its `package.json`; Expo reads `app.json` /
`metro.config.js` next to *its* `package.json`. None of the current configs
would apply to the mobile app even if they stayed at root — Tailwind/PostCSS
don't exist in React Native, the tsconfig has `"lib": ["dom"]` and the Next
plugin, and Expo ships its own ESLint and TS presets. So every config moves
with the app it configures.

**Move to `apps/web/`** (`git mv`):

| What | Why it's web-only |
|---|---|
| `app/` `lib/` `db/` `scripts/` `test/` `public/` `types/` | The app, its server code, migrations, seed script, tests. (`types/` moves again, to `packages/shared`, in Phase 0 step 4 — keep this commit a pure move.) |
| `assets/` | `lib/og.tsx` reads `process.cwd() + "assets/fonts"` for OG images |
| `next.config.ts` `next-env.d.ts` `proxy.ts` | Next.js |
| `instrumentation.ts` `instrumentation-client.ts` `sentry.server.config.ts` `sentry.edge.config.ts` `.env.sentry-build-plugin` | Sentry for Next (mobile gets `@sentry/react-native` + its own config) |
| `tsconfig.json` | Next-specific compiler options; `@/*` → `./*` keeps working because it's relative to the file |
| `eslint.config.mjs` `postcss.config.mjs` `vitest.config.mts` `drizzle.config.ts` | Each configures a web-only tool; all use paths relative to their own folder |
| `.env.local` | Server secrets (gitignored — plain `mv`, not `git mv`). Mobile gets its own `.env` with only public `EXPO_PUBLIC_*` values. |
| `package.json` **contents** | The current file becomes `apps/web/package.json` (rename `"name"` to `"@screenpeak/web"`) — see A.3 |

**Stay at the root:**

| What | Why |
|---|---|
| `.git/`, `.gitignore` | One repo (`.gitignore` needs edits — A.3) |
| `package.json` (new, tiny) + `package-lock.json` | Workspace root; npm keeps **one** lockfile for all workspaces. Next.js also finds the monorepo root by looking for this lockfile — never let a second one appear in `apps/web/` |
| `AGENTS.md` / `CLAUDE.md` | Repo-wide instructions. Rewrite the Structure/Commands sections for the monorepo; web-specific detail can later move to `apps/web/AGENTS.md` (Claude Code also reads nested ones) |
| `DESIGN.md` | The design system covers both apps |
| `README.md`, `docs/`, `build-plan.md`, `backlog.txt`, `ship-readiness.html` | Project docs |
| `.claude/` | Claude Code project settings |

**Delete, don't move** (regenerated): `node_modules/`, `.next/`, `tsconfig.tsbuildinfo`.

### A.3 Fix-ups after the move

1. **Root `package.json`:**
   ```json
   {
     "name": "screenpeak",
     "private": true,
     "workspaces": ["apps/*", "packages/*"],
     "scripts": {
       "dev": "npm run dev -w @screenpeak/web",
       "build": "npm run build -w @screenpeak/web",
       "test": "npm test -w @screenpeak/web",
       "lint": "npm run lint -w @screenpeak/web",
       "mobile": "npm start -w @screenpeak/mobile"
     }
   }
   ```
   `npm run <x> -w <workspace>` runs the script *with the workspace folder as
   the working directory*, so every `process.cwd()`-relative path (`policy.html`,
   `assets/fonts`, `.env.local` in the `seed` script and `drizzle.config.ts`)
   keeps resolving exactly as today.
2. **`.gitignore`:** entries with a leading slash only match at the root. Change
   `/node_modules` → `node_modules/`, `/.next/` → `.next/`, `/out/` → `out/`,
   `/build` → `build/`, `/coverage` → `coverage/`. (`.env*`, `*.tsbuildinfo`,
   `.vercel` already match anywhere.)
3. **Reinstall from the root:** `rm -rf node_modules apps/web/node_modules && npm install`.
4. **(Done in Phase 0 step 4.) Later, when `packages/shared` exists:** add
   `"@screenpeak/shared": "*"` to `apps/web/package.json` dependencies and
   `transpilePackages: ['@screenpeak/shared']` to `next.config.ts` — the
   package ships TypeScript source, so Next has to compile it.

### A.4 Re-run the baseline and compare

```bash
mkdir -p ~/screenpeak-after
npm run lint                 > ~/screenpeak-after/lint.txt  2>&1
npx tsc --noEmit -p apps/web > ~/screenpeak-after/tsc.txt   2>&1
npm test                     > ~/screenpeak-after/test.txt  2>&1
npm run build                > ~/screenpeak-after/build.txt 2>&1
diff -r ~/screenpeak-baseline ~/screenpeak-after     # expect only path prefixes + timings to differ
npm start -w @screenpeak/web                         # then redo the A.1 checklist
```

Same route table, same test counts, same checklist results → commit
(`git add -A && git commit -m "Move web app into apps/web workspace"`). Git
records the moves as renames, so `git log --follow` history is preserved.

---

## Appendix B — Worked example: the game page, end to end

One real read — `app/games/[slug]/page.tsx` — traced through today's code and
every folder of the new layout. Every other screen follows the same pattern.

### B.0 The rule

```
apps/mobile ──► packages/shared ◄── apps/web ──► db ──► Postgres
                  (types only)        (the only one allowed to touch db)
```

Arrows mean "imports from". `packages/shared` imports **nothing** from either
app, and the apps never import each other. The phone never calls `db`; it asks
the web server over HTTP, and the web server calls `db`. Shared only describes
the *shape* of the question and the answer.

### B.1 Today — one file does three jobs

```tsx
export default async function GamePage({ params, searchParams }) {
    const { slug } = await params
    // job 1: who's asking?
    const user = await getOptionalUser()

    // job 2: fetch the data (8 sequential awaits, all hitting db)
    const game = await getGameBySlug(slug)
    if (!game) notFound()
    const { genres, platforms, developers, publishers } = await getGameTaxonomy(game.id)
    const stats = await getGameRatingsStats(game.id)
    const userReview   = user ? await getUserRatingReviewForGame(game.id, user.id) : null
    const libraryEntry = user ? await getLibraryEntry(user.id, game.id) : null
    const lists        = user ? await getUserLists(user.id, true) : []
    const listIdsGameIsIn = await getGameListMembership(game.id, lists.map(l => l.id))
    const userSettings = user ? await getAccountSettings(user.id) : null
    const { reviews, count } = await getGameReviewsForPage(game.id, { /* page/sort from URL */ })

    // job 3: render HTML
    return <main>…</main>
}
```

A phone can't reuse any of this — job 2 is fused to job 3 inside a React Server
Component. The new layout lifts job 2 into a **loader**.

### B.2 `packages/shared/api/types.ts` — the contract

```ts
import type { GameData, GameRatingsStats, ListSummary /* … */ } from '../types'  // today's types/, moved here

export type GamePageData = {
    game: GameData
    taxonomy: { genres: Taxon[]; platforms: Taxon[]; developers: Taxon[]; publishers: Taxon[] }
    stats: GameRatingsStats
    viewer: null | {                 // null = signed out
        review: RatingReview | null
        libraryEntry: LibraryEntry | null
        lists: ListSummary[]
        listIdsGameIsIn: string[]
        settings: AccountSettings
    }
}
```

A description only — no queries, compiles to nothing.

### B.3 `apps/mobile/lib/api/client.ts` — how the phone asks for it

```ts
import type { GamePageData } from '@screenpeak/shared/api'

export function createApiClient(opts: { baseUrl: string; getToken: () => Promise<string | null> }) {
    async function get<T>(path: string): Promise<T> {
        const token = await opts.getToken()
        const res = await fetch(opts.baseUrl + path, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => null))
        return res.json() as Promise<T>
    }

    return {
        games: {
            get: (slug: string) => get<GamePageData>(`/api/v1/games/${encodeURIComponent(slug)}`),
            search: (q: string) => get<GameSearchResult[]>(`/api/v1/games/search?q=${encodeURIComponent(q)}`),
        },
        // …one entry per endpoint
    }
}
```

Only `fetch` — no db, no React. The token source is injected rather than
hard-coded to SecureStore, which keeps the client easy to test with a fake
token. See B.8 for how this object works, and B.9 for why it isn't in shared.

### B.4 `apps/web/lib/loaders/game-page.ts` — job 2, lifted out

```ts
import 'server-only'
import type { GamePageData } from '@screenpeak/shared/api'
import { getGameBySlug, getGameTaxonomy } from '@/lib/queries/game'
import { getGameRatingsStats, getUserRatingReviewForGame } from '@/lib/queries/review'
// …

export async function loadGamePage(slug: string, viewerId: string | null): Promise<GamePageData | null> {
    const game = await getGameBySlug(slug)                      // ← db, via lib/queries
    if (!game) return null

    const [taxonomy, stats, viewer] = await Promise.all([
        getGameTaxonomy(game.id),
        getGameRatingsStats(game.id),
        viewerId ? loadViewerState(game.id, viewerId) : null,
    ])
    return { game, taxonomy, stats, viewer }
}
```

> Built in Phase 1 step 2 as `apps/web/lib/loaders/game-page.ts` — see the
> step 2 note for how the real contract differs from this sketch.

**This is where `db` is used** (through `lib/queries/*`, as today). The return
type is imported from shared, so the loader is type-checked against the
contract — rename a field without updating `GamePageData` and the build fails.

### B.5 `apps/web/app/games/[slug]/page.tsx` — the website

```tsx
export default async function GamePage({ params, searchParams }) {
    const { slug } = await params
    const user = await getOptionalUser()                        // job 1 (cookie, as today)

    const data = await loadGamePage(slug, user?.id ?? null)     // job 2 → loader, plain function call
    if (!data) notFound()
    const reviews = await getGameReviewsForPage(data.game.id, { /* from URL */ })  // paged: separate

    const { game, taxonomy, stats, viewer } = data
    return <main>…same JSX as today…</main>                      // job 3
}
```

The website calls the loader **directly** — no HTTP, no `/api/v1`.

### B.6 `apps/web/app/api/v1/games/[slug]/route.ts` — the same loader as JSON

```ts
export async function GET(req: NextRequest, ctx: RouteContext<'/api/v1/games/[slug]'>) {
    const { slug } = await ctx.params
    const user = await getOptionalUser()                        // job 1 (bearer token, or cookie)

    const data = await loadGamePage(slug, user?.id ?? null)     // job 2 → the SAME loader
    if (!data) return NextResponse.json({ error: { code: 'not_found' } }, { status: 404 })

    return NextResponse.json(data)                              // job 3, as JSON
}
```

### B.7 `apps/mobile` — configure the client once, use it per screen

```ts
// apps/mobile/lib/api/index.ts
import { createApiClient } from './client'
import { supabase } from '../supabase'

export const api = createApiClient({
    baseUrl: process.env.EXPO_PUBLIC_API_URL!,                  // Mac's LAN IP in dev, the hosted site later
    getToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
})
```

```tsx
// apps/mobile/app/games/[slug].tsx
export default function GameScreen() {
    const { slug } = useLocalSearchParams<{ slug: string }>()
    const { data, isLoading, error, refetch } = useQuery({
        queryKey: ['game', slug],                               // cache label (see B.8)
        queryFn: () => api.games.get(slug),                     // → HTTP → route.ts → loader → db
    })

    if (isLoading) return <GameSkeleton />
    if (error || !data) return <ErrorState onRetry={refetch} />

    const { game, stats, viewer } = data                        // typed as GamePageData automatically
    return (
        <ScrollView>
            <StatCompare signedIn={!!viewer} you={viewer?.review?.rating} community={stats.avg_rating} communityCount={stats.total_ratings} />
            …
        </ScrollView>
    )
}
```

Both paths:

```
WEB     page.tsx ──function call──► loadGamePage() ──► lib/queries ──► db ──► Postgres
MOBILE  [slug].tsx ─► api.games.get() ─HTTPS─► route.ts ─► loadGamePage() ─► lib/queries ─► db ─► Postgres
          (phone)     (mobile/lib/api)         └───────────── all inside apps/web, on the server ─────────────┘
```

### B.8 How the client object works (nothing is fetched up front)

`createApiClient(...)` runs **once**, when `apps/mobile/lib/api/index.ts` is first
imported, and makes **zero** requests. It returns a plain object whose values
are *functions* — a menu, not a meal:

```ts
api                       // { games: { get: ƒ, search: ƒ }, lists: { … }, … }  ← no data, no requests
api.games.get             // ƒ (slug) => …                                        ← still no request
api.games.get('elden-ring') // NOW: one fetch of /api/v1/games/elden-ring → Promise<GamePageData>
```

- `api.games.get` is ordinary dot access, written out in the screen code — not
  a lookup driven by `queryKey` or the slug. TypeScript knows every path, so a
  typo like `api.game.get` is a compile error.
- Each function is a **closure**: it remembers the `baseUrl` and `getToken`
  passed to `createApiClient`, which is why the screen can call
  `api.games.get(slug)` without passing either. That's the reason for the
  factory shape — the same client code works with different configuration.
- `get<T>` is private to the factory — callers can only reach it through the
  named endpoints.

**`queryKey` is a separate thing.** `['game', slug]` is TanStack Query's *cache
label*, unrelated to the `api` object's keys. On mount, TanStack checks its
cache for `['game', 'elden-ring']`: if it's there and fresh, it renders it with
no request; otherwise it calls `queryFn`, which calls `api.games.get(slug)`.
After a mutation, `queryClient.invalidateQueries({ queryKey: ['game', slug] })`
marks that entry stale and it refetches. Convention: mirror the URL in the
key, so it's obvious which label belongs to which endpoint.

### B.9 Why the client lives in `apps/mobile`, not `packages/shared`

Only code that **both** apps import belongs in `packages/shared`. The website
never calls `/api/v1`:

- Server Components call **loaders** directly (B.5).
- Client components call **Server Actions** — including search, which gets
  `app/search-actions.ts` rather than going through the API (Phase 1 step 6).

So the fetch client has exactly one user, and it lives with that user. What
*is* shared is the contract types (`GamePageData` etc.), because both sides
compile against them: the loader/route produces them, the phone consumes them.

The URL strings (`/api/v1/games/${slug}`) live in the mobile client rather than
next to the types. The route file's own path is the server's side of that, and
a mismatch shows up immediately as a 404 in development. If the website ever
does need `/api/v1` from the browser — or you add a second consumer, like a
browser extension — move `client.ts` into `packages/shared` then; it has no
mobile-specific imports, so the move is a `git mv`.

### B.10 What this means for loaders

1. **A loader is job 2 cut out of today's `page.tsx`.** Pages become
   *auth → loader → render*; routes become *auth → loader → JSON*.
2. **Privacy gates live in the loader.** `db` bypasses RLS; a
   `library_public` check left in `page.tsx` protects the website and silently
   not the API.
3. **Loaders are for reads.** Writes call `lib/queries` directly from both the
   action and the route — but logic currently *inside* an action must move down
   first, or the route duplicates it. `addOrUpdateLibraryEntry` does
   "get existing → update or create" in the action; that becomes
   `upsertLibraryEntry()` in `lib/queries/library.ts`, and the action and
   `PUT /api/v1/me/library/[gameId]` become one-liners. Same for
   `createListAndAddGame`.
4. **Not everything goes in the loader.** Independently-paged data (reviews)
   gets its own loader + endpoint. Display math (`distribution`, `maxCount`,
   `year`, `statusLabel`) is per-client rendering — if both apps need identical
   output, share a pure helper like `toDistribution(stats)` from
   `packages/shared`.
5. **JSON flattens types.** A `Date` arrives as a string; Drizzle timestamps are
   already raw strings, so the phone needs `parseDbTimestamp()` too.
   `lib/dates.ts` has no imports — it can move to `packages/shared` unchanged.
6. **Why `GamePageData` is declared, not inferred.**
   `Awaited<ReturnType<typeof loadGamePage>>` would work, but it makes shared
   depend on web — the arrows in B.0 flip, and mobile's type-check would have
   to resolve web's Drizzle imports. Declaring the type in shared and having
   the loader conform keeps dependencies one-directional.
