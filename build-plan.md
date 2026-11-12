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

## Decisions

Recorded 2026-10-16. Where an older sketch below disagrees with this section, this section wins. The sketches in Part 2 and Appendix B are updated to match.

### Order

Follow Part 4. Bearer auth, the game loader, `GET /api/v1/games/[slug]` plus reviews, the native game screen, the remaining read loaders, the write routes (Phase 1 step 4), search and taxonomy search (step 6), Postgres rate limits on `/api/v1` writes and search (step 8), and phone Steam linking (step 7: `link-intent`, the import batch, and `app-config`) are done. There is still no `GET` of the whole Steam library. The phone Steam screen is still Phase 3.

### API shape

- Paths mirror the site: `/api/v1/user/[username]/...`. Lists are nested there: `/api/v1/user/[username]/lists` and `/api/v1/user/[username]/lists/[listId]`.
- Followers and following are counts on the profile payload in v1. There are no follower-list endpoints.
- The community score field is `avg_rating` on every API payload. `query_games` still returns the column `avg_ngplus_rating`; the games-list route renames it when that route is built. The game page already sends `stats.avg_rating`. There is no Metacritic field and no Metacritic sort. Catalogue order is `name` (the default, ascending) or `ngplus_rating`, both implemented by `query_games`.
- Image fields on API payloads are display-ready URLs. The server picks the IGDB rendition with `packages/shared/images.ts` (`displayCoverUrl` at `large` is `t_cover_big_2x`; landscape art and shots go through `displayLandscapeUrl`). The phone does not choose a rendition. Byte checks for share cards stay in `apps/web/lib/catalog/images.ts` because they need `fetch` and Node's `Buffer`.
- Phone Steam import is in v1, and it is late (still the last Phase 3 screen). The API exposes the batch cursor and lease the web already runs (`retry`, `cursor`, `nextCursor`, and the lease `notice` / `retryAfterMs` from `resolveSteamImportBatch`). It does not offer one `GET` of the whole Steam library. The OpenID `state` token from `POST /api/v1/me/steam/link-intent` is still required.
- Each remaining loader moves its privacy gate with it and ships a privacy test in the same change. The four gates are library, loadout, list detail, and list index. There is no separate privacy pass after the routes exist.
- Game ids in the shared types are uuid strings: `GameData.id`, `RatingReviewData.game_id`, `SimpleRatingReview.game_id`, `AvgRatingsData.game_id`, `ListSummary.id`, `LibraryData.id`, and the library actions' `gameId`. New contracts copy those strings. `games.id` has been a uuid since the schema landed.
- `queryGames` throws when the database errors. A web page that still wants an empty grid catches at the call site. An API route must not turn an outage into `[]`.
- A game slug is the IGDB slug (`catalogSlug`). When that slug is already taken, the stored slug is `` `${base}-${games.id}` ``.
- Steam app ids live in `game_external_ids`. There is no `games.steam_appid` column, and `GameDetail` does not include one.
- Schema changes are applied with `migrate:journal`, not `drizzle-kit push`.

### Signed-out home

**Mobile — decided.** There is no sign-in wall (App Store Review Guideline 5.1.1). The screen is not a port of the web splash. A short welcome offers Sign up, Log in, and Browse first. Browse opens the native catalogue, the same job as the web `/games` page (search and filters), not a web view. After that the app is read-only: search, game pages, reviews, lists, and a sample Loadout. The first action that needs an account — rating, logging a game, following, or Steam import — prompts for signup. `GET /api/v1/games/[slug]` and the native game screen work signed out (`viewer: null`). The welcome screen is the signed-out Feed tab, built in Phase 2 step 1. The game-screen slice did not build it.

**Web — still open.** The signed-out splash stays the open items in `docs/backlog.md` (the first screen, and a Read-out on it before launch). That page waits on owner and Lens input.

### Testing and launch

- Cloud agents verify API behaviour and logic with unit tests and a local Postgres, and they verify layouts with Expo web (`npm run mobile:web`). The phone tabs are proved by `node .cursor/skills/verify-screenpeak/verify-screenpeak.mjs drive mobile-nav`. The owner checks a real device at milestones.
- Screens live in `apps/mobile/src/app/`. Mobile tests are Vitest (`npm test -w @screenpeak/mobile`), not Jest.
- The IGDB commercial partnership blocks the App Store and a public launch only. It does not block TestFlight or other test builds. See Phase 5.

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
    App Router. `apps/mobile/src/app/games/[slug].tsx` works the way you'd expect.
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
│       ├── src/app/        # Expo Router screens
│       ├── src/components/
│       ├── src/lib/api/    # configures the shared fetch client (base URL, bearer token)
│       └── package.json
└── packages/
    └── shared/             # imported by BOTH apps
        ├── types/          # moved from ./types
        ├── schemas.ts      # moved from lib/schemas.ts (already client-safe)
        ├── tokens.ts       # colours/fonts/spacing from globals.css as JS
        └── api/            # /api/v1 contract types and the fetch client for them
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
server you control. `packages/shared/api` holds the *contract* types and the
fetch client that calls it — no queries, no db:

```
packages/shared/api/          ← NO db. Types imported by both apps.
  games.ts, writes.ts, …         GamePageData, LibraryWrite, ApiErrorBody …
  client.ts                     api.games.get(slug) → fetch(`${BASE}/api/v1/games/${slug}`)
                                (adds the bearer header, parses JSON, throws ApiClientError)

apps/mobile/src/lib/api/      ← the phone's configuration of that client.
  index.ts                      createApiClient({ baseUrl, getToken }) → api

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
Game screen ─► api.games.get('elden-ring')          (packages/shared/api/client.ts, running on the phone)
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

> **About the search / `FEED_PAGE_SIZE` precedent.** Those splits are really
> two different situations:
>
> - **`FEED_PAGE_SIZE` is a genuine bundling fix.** `FeedList.tsx` needs only
>   the number `12`, but importing *anything* from `feed.ts` evaluates the whole
>   module, including `import { db } from '@/lib/db'`. The constant lives in
>   `@screenpeak/shared/constants`. This is the exact failure mode
>   `packages/shared` must avoid.
> - **Search is a Server Action.** `searchGamesByName`, `searchTaxonomyTable`,
>   and `getTaxonomyNameBySlug` live on `db` in `lib/queries/game.ts`. The
>   website dropdowns call `app/search-actions.ts`. The phone calls
>   `GET /api/v1/games/search` and `GET /api/v1/taxonomy/[table]/search`, which
>   use those same functions. A `'use client'` file that imports
>   `lib/queries/game.ts` pulls `lib/db` into the browser bundle.
>   `test/api/client-boundary.test.ts` rejects that import. (All three
>   components debounce by 300 ms, so Next.js dispatching Server Actions one
>   at a time doesn't matter in practice — see Phase 1 step 6.)

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
| Errors | `@sentry/react-native` | Same Sentry org as the web (`im-a-teapot`), separate project `screenpeak-mobile` |
| Builds / release | EAS Build, EAS Submit, EAS Update | |
| Tests | Vitest (`apps/mobile`, `npm test`). Expo web is how a cloud agent checks layout. Maestro, or a real device, is the owner's milestone check. | |

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
so every route doesn't repeat try/catch. `/api/v1` calls `getBearerUser()` and
never reads the session cookie. `getOptionalUser()` stays the website helper.
Native fetch ignores CORS. Expo web does not: `withAuth` adds
`Access-Control-Allow-Origin: *` only on `/api/v1` (no `Allow-Credentials`).
`proxy.ts` skips the session refresh for `/api/v1` and answers `OPTIONS` there.
Cookie routes such as `DELETE /api/delete-account` do not send that header. The
phone sends `Authorization: Bearer` and fetches with `credentials: 'omit'`.

**Email links.** Signup confirmation still lands on the website's
`/auth/confirm`. The phone client uses Supabase's default implicit flow for
sign-up, so that link does not depend on a code verifier stored on the phone.
Password reset from the phone is the one PKCE request. It uses that same path
on the app's own URL: `screenpeak://auth/confirm?next=/auth/update-password`
in a dev or production build, and the Expo web origin of that path (for
example `http://localhost:8081/auth/confirm?next=/auth/update-password`).
Auth rejects the link until those URLs are on the redirect allowlist — see
Phase 5. Later, iOS Universal Links / Android App Links can make
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

async function loadViewerState(gameId: string, viewerId: string): Promise<GamePageViewer> {
    const [review, libraryEntry, listRows, defaultListPublic] = await Promise.all([
        getUserRatingReviewForGame(gameId, viewerId),
        getLibraryEntry(viewerId, gameId),
        getUserLists(viewerId, true),
        getDefaultListPublic(viewerId),
    ])
    const lists = listRows.map(l => ({ id: l.id, name: l.name, game_count: l.game_count }))
    const membership = await getGameListMembership(gameId, lists.map(l => l.id))
    return { review, libraryEntry, lists, listIdsGameIsIn: [...membership], defaultListPrivacy: defaultListPublic ?? true }
}
```

The built payload is `GamePageData` in `packages/shared/api/games.ts`. `game` is a `GameDetail` (uuid `id`, `igdb_id`, display-ready `cover_image_url` / `artwork_image_url` / `screenshots` — no `steam_appid`, no Metacritic). `stats.avg_rating` is the community score out of 10. Signed out, `viewer` is null. Signed in, `viewer` is `{ review, libraryEntry, lists, listIdsGameIsIn, defaultListPrivacy }` — `defaultListPrivacy` is the one settings bit the "add to list" control needs, not the whole account row, and `listIdsGameIsIn` is an array because a `Set` becomes `{}` in JSON.

```jsonc
{
  "game":     { "id": "…uuid…", "name": "Elden Ring", "slug": "elden-ring", "igdb_id": 119133, "cover_image_url": "https://images.igdb.com/igdb/image/upload/t_cover_big_2x/….jpg", "screenshots": [] },
  "taxonomy": { "genres": […], "platforms": […], "developers": […], "publishers": […] },
  "stats":    { "avg_rating": 8.7, "total_ratings": 41, "total_reviews": 12, "rating_10": 9 },
  "viewer":   null
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
| `GET /games/search?q=` | `searchGamesByName` | search boxes |
| `GET /taxonomy/[table]/search?q=` | `searchTaxonomyTable` | developer and publisher dropdowns |
| `GET /games/[slug]` | `getGameBySlug`, `getGameTaxonomy`, `getGameRatingsStats`, viewer's rating/library entry/list membership | `/games/[slug]` |
| `GET /games/[slug]/reviews?page=` | `getGameReviewsForPage` | `/games/[slug]` |
| `GET /games?…filters` | `queryGames` (sort `name` or `ngplus_rating`; throws on a DB error), `getAllGenres`, `getAllPlatforms`, `getDistinctEsrbRatings`. The route renames `avg_ngplus_rating` to `avg_rating`. | `/games` |
| `GET /user/[username]` | `getFullProfile`, `getFeaturedLoadout`, `getRecentReviews`, follow state. Follower and following **counts** only — no list endpoints in v1. | `/user/[username]` |
| `GET /user/[username]/library?…` | `getLibraryEntries`, `getLibraryFacets` — **gate on `library_public`**, with a privacy test in the same change | `…/library` |
| `GET /user/[username]/lists` | `getUserLists`, `getLikedLists`, `getListCoverMap` — **gate private lists**, with a privacy test in the same change | `…/lists` |
| `GET /user/[username]/lists/[listId]` | `getListById`, `getListGames`, `getListLikes` — **gate on `is_public`**, with a privacy test in the same change | `…/lists/[listId]` |
| `GET /user/[username]/reviews?page=` | `getUserRatingsReviewsPage`, `…Counts` | `…/ratings_reviews` |
| `GET /user/[username]/loadout` | `getLoadoutGenreStats`, `…DeveloperStats`, `…StatusBreakdown`, `…RatingHighlights`, `getCurrentLoadoutIdentity` — **privacy gate with the loader**, tested in the same change | `…/loadout` |
| `GET /me/settings` | `getAccountSettings`, `getSteamAccount` | `/settings` |

Writes (auth required):

| Endpoint | Replaces Server Action |
|---|---|
| `PUT /games/[gameId]/review` | `submitRatingReview` |
| `GET` / `PUT` / `DELETE /me/library/[gameId]` | `fetchLibraryEntry`, `addOrUpdateLibraryEntry`, `removeLibraryEntry` |
| `POST /me/library/import` | `importSteamLibraryEntries` |
| `POST /user/[username]/lists`, `PATCH /user/[username]/lists/[listId]` | `createOrUpdateList`, `createListAndAddGame`, `toggleListPinned` |
| `POST` / `DELETE /user/[username]/lists/[listId]/like` | `toggleListLike` |
| `POST` / `DELETE /user/[username]/lists/[listId]/games/[gameId]` | `toggleGameInList`, `removeGameFromListAction` |
| `POST /user/[username]/lists/[listId]/games/sync` | `syncListGamesAction` |
| `PATCH /me` `{username?, bio?, selectedTitle?, loadoutBio?, favoriteGames?, privacy?}` | `saveUsername`, `saveBio`, `saveSelectedTitle`, `saveLoadoutBio`, `saveFavoriteGames`, `togglePrivacyAction` |
| `DELETE /me/loadout` | `clearLoadout` |
| `DELETE /me` | `DeleteAccountButton` → `deleteAccount` (`lib/account-deletion.ts`, shared with `DELETE /api/delete-account`) |
| `POST /me/avatar/upload-url`, `PUT /me/avatar` | `createAvatarUploadUrl`, `saveAvatarUrl` |
| `POST` / `DELETE /user/[username]/follow` | `toggleFollow` |
| `POST /me/steam/link-intent`, `DELETE /me/steam` | OpenID `state` token (still required), `unlinkSteamAccountAction` |
| `POST /me/steam/import` | `resolveSteamImportBatch` — body `{ retry, cursor }`, response `SteamImportBatch` (`nextCursor`, lease `notice`, `retryAfterMs`). Not a single library GET. |
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
   >
   > **SDK 58** — Expo Go requires it. From `apps/mobile`, `npx expo install expo@^58.0.0 --fix`, then `npm install` at the root. React is `19.3.0` in both apps and the root overrides; `react-native` is overridden to `0.88.0` and `react-native-svg` to `15.16.0` so a stale SDK 57 copy cannot sit beside them. Native tabs import `expo-router/native-tabs`, and `expo-symbols` is a direct dependency for the Android `md` icons. Web routes stay synchronous (`asyncRoutes.web: false`) and `web.output` stays `"single"`.
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
   > built field by field so a dropped column cannot leak (`steam_appid` is gone;
   > Steam apps are `game_external_ids` and are not on `GameDetail`); library
   > `hours_played` is a number. Image fields are display-ready
   > (`t_cover_big_2x` for the cover, landscape renditions for art and shots)
   > via `packages/shared/images.ts`. Community score is `stats.avg_rating`.
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
   > Both game-page endpoints are done. Per Part 4, the native game screen
   > (phone auth, TanStack Query, display images, signed-out browsing) comes
   > before any further loader. That slice is Phase 1 step 2b.
2b. **Native game screen** — the vertical slice from Part 4, before the
   remaining loaders. Supabase Auth on the phone (`@supabase/supabase-js` +
   `expo-secure-store`, sign-in direct to Supabase, bearer token on `/api/v1`
   through the existing `withAuth`). TanStack Query and `apps/mobile/src/lib/api`.
   The screen is `apps/mobile/src/app/games/[slug].tsx`. It works signed out
   (`viewer: null`). Rate, Save, and Add to list prompt for signup when there
   is no session. Expo web (`npm run mobile:web`) is how a cloud agent checks
   the layout. The welcome screen is not part of this slice.
   > **Done.** Phone auth (`src/lib/supabase.ts`, `src/lib/auth.tsx`), the
   > API client (`src/lib/api`), and the game screen. Image URLs on
   > `GET /api/v1/games/[slug]` are display-ready. That slice moved
   > `GameData.id`, `RatingReviewData.game_id`, `SimpleRatingReview.game_id`,
   > and the library actions' `gameId` to uuid strings. `queryGames` throws on
   > a database error. The welcome screen landed later, as the signed-out Feed tab in Phase 2 step 1.
3. **Remaining loaders, one page at a time**, each with its privacy test in
   the same change (`db` bypasses RLS). The gates are library, loadout, list
   detail, and list index. Do not save them for a later audit pass.
   > **Done.** Each page calls the loader, and `GET /api/v1/...` calls the same
   > function with `getBearerUser()` only (a website cookie does not become
   > `viewer`). Signed-out reads return the public payload. `viewer` is null on
   > the profile, list detail, loadout, games list, feed, and explore. The
   > library, the list index, and home have no `viewer` field. `GET /api/v1/me`
   > is `{ user: null }`.
   > `Cache-Control` is `private, no-store`.
   >
   > | Route | Loader |
   > | --- | --- |
   > | `GET /api/v1/games` | `loadGamesPage` |
   > | `GET /api/v1/feed` | `loadFeed` |
   > | `GET /api/v1/explore` | `loadExplore` |
   > | `GET /api/v1/home` | `loadHomeLanding` |
   > | `GET /api/v1/me` | `loadMe` (`{ user: null }` when signed out) |
   > | `GET /api/v1/me/settings` | `loadSettings` (401 without a bearer; `steam_linked` only) |
   > | `GET /api/v1/user/[username]` | `loadProfilePage` |
   > | `GET /api/v1/user/[username]/library` | `loadUserLibrary` |
   > | `GET /api/v1/user/[username]/lists` | `loadUserLists` |
   > | `GET /api/v1/user/[username]/lists/[listId]` | `loadListPage` |
   > | `GET /api/v1/user/[username]/ratings_reviews` | `loadUserReviews` |
   > | `GET /api/v1/user/[username]/loadout` | `loadLoadoutPage` |
   >
   > Privacy: a private library, loadout, or list is the same 404 as a missing
   > one (`Not found.`). The list index drops private lists unless the tab is
   > the owner's own. Profile `library_stats` is null when the library is
   > hidden; `profile_loadout_bio` is null when the loadout is hidden and the
   > caller is not the owner. Followers and following are counts. Catalogue
   > cards rename `query_games.avg_ngplus_rating` to `avg_rating`. Covers are
   > display-ready via `packages/shared/images.ts`. Contracts and
   > `createApiClient` live in `packages/shared/api` (the phone configures the
   > client in `src/lib/api/index.ts`). Not in this slice: search, taxonomy
   > search, write routes, and a Steam-library GET.
4. Write routes (mirror the Server Actions). Have both the action and the route
   call the same function; validate request bodies with the shared zod schemas.
   > **Done.** `requireBearerUser()` — 401 `unauthenticated` when the Bearer
   > header is absent, and a website cookie is ignored. Bodies use
   > `@screenpeak/shared/schemas`. The query checks `user_id`; a miss is 404
   > `not_found`. Ids are uuid strings. Likes, follows, and list-game inserts
   > are idempotent: unlike and remove-game succeed when the row is already
   > gone, and `syncListGames` dedupes `toAdd` then `onConflictDoNothing`.
   > A library PUT applies only the fields present in the body when the row
   > already exists (a status-only save keeps hours, play count, and the 100%
   > flag); a new row still uses the insert defaults. Rating and library
   > writes are `INSERT … ON CONFLICT DO UPDATE`. `createListWithGame` commits
   > both writes in one transaction. Someone else's private list is
   > `List not found` for `likeList`, with no `list_likes` row. Avatar URLs
   > must match `R2_PUBLIC_URL`'s origin, the path `/${userId}/avatar`, and a
   > `v` query that is empty or all digits. Steam import drops `selected: false`
   > rows in `importConfirmedSteamLibrary`. The import body has no 500-row cap:
   > the website action forwards the whole selection, and
   > `upsertLibraryEntries` writes it in one statement. `DELETE /api/v1/lists/[listId]`
   > removes the caller's non-default list and is 404 otherwise. The website
   > actions call the same functions (`saveRatingReview`, `upsertLibraryEntry`,
   > `createListWithGame`).
   >
   > | Route | Shared function |
   > | --- | --- |
   > | `PUT /api/v1/games/[slug]/review` | `saveRatingReview`. The segment is the game uuid. A `[gameId]` folder cannot sit beside `[slug]`. |
   > | `GET` / `PUT` / `DELETE /api/v1/me/library/[gameId]` | `getLibraryEntry`, `upsertLibraryEntry`, `deleteLibraryEntryByGame` |
   > | `POST /api/v1/me/library/import` | `importConfirmedSteamLibrary` |
   > | `POST /api/v1/lists`, `PATCH` / `DELETE /api/v1/lists/[listId]` | `createList`, `createListWithGame`, `updateList`, `setListPinned`, `deleteList`. Writes sit on the bearer, not under `/user/[username]`, so the path cannot name a different player. Reads stay at `/user/[username]/lists`. `DELETE` is 404 for another owner or a default list. |
   > | `POST` / `DELETE /api/v1/lists/[listId]/like` | `likeList`, `unlikeList` |
   > | `POST` / `DELETE /api/v1/lists/[listId]/games/[gameId]` | `addGameToList`, `removeGameFromList` |
   > | `POST /api/v1/lists/[listId]/games/sync` | `syncListGames` |
   > | `PATCH /api/v1/me` | `patchAccount` (one transaction; the website actions still call the individual updates) |
   > | `DELETE /api/v1/me/loadout` | `clearLoadoutIdentity` |
   > | `POST /api/v1/me/avatar/upload-url`, `PUT /api/v1/me/avatar` | `createPresignedAvatarUploadUrl`, `updateAvatarUrl` |
   > | `POST` / `DELETE /api/v1/user/[username]/follow` | `followUser`, `unfollowUser`. The segment is the target user's uuid (`[userId]` would clash with `[username]`). |
   > | `DELETE /api/v1/me/steam` | `unlinkSteamAccount` |
   > | `POST /api/loadout` | `requireUser()` + `withAuth`, and the row update goes through `db` so a bearer and a cookie session persist the same way |
   >
   > The signed-in native game screen calls rate, library save, and add-to-list.
   > `POST /me/steam/link-intent` and `POST /me/steam/import` landed in step 7.
   > Search landed in step 6. Rate limiting landed in step 8.
5. Put request/response types in `packages/shared/api/`, next to the fetch
   client that calls these routes (Appendix B.9 says why it lives there).
   > **Read routes from step 3** already have their types in
   > `@screenpeak/shared/api`, and `createApiClient` lives there too. The phone
   > configures it once in `src/lib/api/index.ts`. **Write routes from step 4** add
   > `@screenpeak/shared/api/writes` and the write methods on `createApiClient`.
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
   > **Done.** `game-search.ts` is gone. The three functions are on `db` in
   > `lib/queries/game.ts`. `app/search-actions.ts` serves the website: invalid
   > input returns `[]` or `''`, except an id list over the cap, which throws.
   > A parsed search spends the search budget. The library dropdown joins
   > `library_entries` for the signed-in user instead of sending developer ids.
   > `GET /api/v1/games/search` and `GET /api/v1/taxonomy/[table]/search` call
   > the same functions, work signed out, and return 400 for an empty query,
   > a `limit` above 20, or a table other than `developers` or `publishers`.
   > Hits use a uuid `id`, `avg_rating`, and a display-ready cover. Contracts
   > are `@screenpeak/shared/api/search`. `createApiClient` has `games.search`
   > and `taxonomy.search`. A `'use client'` file must not import
   > `lib/queries/game.ts` (`test/api/client-boundary.test.ts`).
7. Steam `state` flow + `app-config` endpoint.
   > **Done.** `POST /api/v1/me/steam/link-intent` (bearer + write budget) takes
   > `{ codeChallenge }` (S256) and returns `{ state, expiresAt, path }`. `state`
   > is an HMAC (`STEAM_LINK_INTENT_SECRET`, at least 32 characters) over
   > `v1.userId.jti.exp`, valid for 5 minutes. The signature is not stored.
   > `steam_link_intents` (migration `0010`) records the jti and the challenge.
   > One live row per user: the issuer locks `users` and a partial unique index
   > covers `consumed_at is null`. `path` is a relative
   > `/api/steam/link?state=…&client=mobile`. A caller-supplied redirect is 400.
   > `GET /api/steam/link` and `GET /api/steam/callback` use that state and do not
   > read cookies. Realm and `return_to` are `NEXT_PUBLIC_SITE_URL`. The redirect
   > to Steam is `no-store` and `no-referrer`, and only if the Location starts
   > with `https://steamcommunity.com/openid/login`. Verification requires the
   > `state` on the signed `openid.return_to` to equal the argument (both absent
   > for the website). The callback stores the Steam id and redirects to
   > `screenpeak://steamlink?code=<one-time>`. It does not write `steam_accounts`.
   > A missing secret, or a bad state, redirects to `screenpeak://steamlink?ok=0`.
   > `POST /api/v1/me/steam/link-complete` commits the link when the bearer user,
   > the intent user, and the PKCE verifier match. The website button still omits
   > `state` and uses the session cookie.
   > `POST /api/v1/me/steam/import` calls `runSteamImportBatch` (same lease:
   > heartbeat 5s, takeover 30s). The body is `{ retry, cursor }` only. A held
   > lease is 200 with `notice` and `retryAfterMs` and does not spend the write
   > budget. Failures are a code (`steam-import-errors.ts`), not a matched
   > sentence. Steam or matching down is 503 `unavailable`. The lease-not-installed
   > hint stays in the server log. There is no `GET` of the whole library.
   > `GET /api/v1/app-config` returns `{ minSupportedVersion: "1.0.0" }` with no
   > session, so a stale bearer still sees a forced upgrade. Contracts and
   > `createApiClient` methods are in `@screenpeak/shared/api`.
8. Consider rate limiting on write routes (Upstash or Vercel's firewall) — the
   API is now a public, documented surface in a way Server Actions weren't.
   > **Done, in Postgres.** Migration `0009_api_rate_limits` adds
   > `api_rate_limits`. One upsert per request, so it works on Vercel's
   > transaction pooler with no Redis and no new paid service.
   > `requireBearerUser` only checks the bearer. Mutating handlers then call
   > `consumeWriteRateLimit`: 60 requests per 60 seconds.
   > `GET /api/v1/me/library/[gameId]` does not spend that budget. Search
   > spends 120 per 60 seconds: `search:user:<uuid>` when the caller is signed
   > in, otherwise `search:ip:<address>`. The address is
   > `x-vercel-forwarded-for`, then `x-real-ip`, then the last
   > `x-forwarded-for` hop, else `local`. The website's search actions spend
   > the same budget. `POST /api/loadout` does not. A 400 or a 401 does not
   > spend the search budget. A spent budget is 429 `rate_limited` with
   > `Retry-After` and `retry_after` on the error body.
   > `GET /api/cron/rate-limits` deletes buckets older than a day when
   > `Authorization` is `Bearer $CRON_SECRET` (`apps/web/vercel.json`).
   > A new write route must call `requireBearerUser` and
   > `consumeWriteRateLimit`. A GET must not call `consumeWriteRateLimit`. A
   > route whose path ends in `search/route.ts`, and any non-test caller of
   > the catalogue search queries, must call the imported
   > `consumeSearchRateLimit` (`test/api/v1-routes-auth.test.ts`).
   >
   > Later, if typeahead gets slow: a `pg_trgm` index on `games.name` and the
   > taxonomy names, and limiting candidate rows before the rating aggregate.
   > Not this slice.

### Phase 2 — Mobile foundation (≈1–2 weeks)

Goal: the rest of the shell around the game screen from Phase 1 step 2b.
Sign-in, the API client, TanStack Query, and one real screen are already in
place. This phase does not go back and extract loaders — that stays Phase 1
step 3, and it can proceed in parallel once the game screen has proved the
stack.

1. Navigation skeleton (Expo Router), under `apps/mobile/src/app/`. Four bottom
   tabs, keeping NativeTabs: **Feed, Explore, Library, Profile**. No left drawer.
   A side rail may come later for tablet and web only. Games is not a tab.
   ```
   src/app/
     sign-in.tsx, sign-up.tsx          # direct to Supabase Auth
     (tabs)/_layout.tsx                # NativeTabs: Feed, Explore, Library, Profile
     (tabs)/index.tsx                  # Feed when signed in. Signed out: welcome (Sign up, Log in, Browse)
     (tabs)/explore.tsx                # search, then trending / friends' activity / recommendations, then genre and platform
     (tabs)/library.tsx                # signed-in library. Signed out: signup prompt
     (tabs)/profile.tsx                # your hub. Signed out: signup prompt
     games/index.tsx                   # catalogue (GET /api/v1/games). Not a tab.
     games/[slug].tsx                  # done in Phase 1 step 2b
     user/[username]/index.tsx         # same hub, that player's public data
     user/[username]/library.tsx       # their library, only linked when it is visible
     user/[username]/lists/index.tsx
     user/[username]/lists/[listId].tsx
     user/[username]/loadout.tsx       # only linked when the loadout is visible
   ```
   Detail screens sit on the root stack above the tabs, so Back returns to the
   tab that opened them. Welcome's Browse button and Explore's Browse all both
   open `games/index.tsx`. There is no sign-in wall. Signed-out players can
   open browse, a game, reviews, public lists, and a public Loadout. Rating,
   logging, following, and Steam import prompt for signup.
   The profile hub pins Loadout, Lists, and a library preview (counts, linking
   to the Library tab for the owner and to `user/[username]/library` for
   anyone else). A section renders only when the viewer is the owner or that
   section is public, using the same flags as the website profile nav:
   `library_public` and `loadout_public`. Lists have no profile-wide privacy
   flag, so the Lists link always shows, matching the website; private lists
   stay off `GET /api/v1/user/[username]/lists` unless the viewer is the owner.
   Hidden sections are not rendered and their routes are not fetched from the hub.
   > **Done.** The routes above load real `/api/v1` data with plain layouts.
   > Forgot-password, settings, steamlink, and the ratings page are still
   > later steps. Feed paging, catalogue filters beyond genre/platform, and
   > visual polish are Phase 3.
2. Auth context already stores the session in SecureStore (chunked; the value
   limit is 2048 bytes) and in `localStorage` on Expo web. The welcome screen
   is the signed-out Feed tab from step 1. Finish forgot-password. Do not
   redirect every signed-out open into `(auth)`.
   > **Done.** Log in links to Forgot password?. That screen asks Supabase for
   > a reset email and shows "If that email has an account, a reset link is on
   > its way." whether or not the address exists. The send time is recorded
   > before the request returns, and Send reset link stays disabled until 30
   > seconds have passed. The link returns to `screenpeak://auth/confirm` (and
   > the Expo web URL of that path) with `next=/auth/update-password`, the same
   > path the website uses. Confirm accepts a PKCE code or a `token_hash`, not
   > access tokens in the URL, and opens set-new-password only for that
   > recovery session. Leaving that screen before the password is saved signs
   > the user out. A normal signed-in session cannot set a password there.
   > Sign-up stays on the default implicit flow so its confirmation link does
   > not need a verifier stored on the phone. Signed-out opens of the tabs
   > still stay on the tabs. Redirect allowlist entries are in Phase 5.
3. API client: `createApiClient` in `packages/shared/api/client.ts` (bearer
   header, contract types — Appendix B.3), configured once in
   `apps/mobile/src/lib/api/index.ts`, with the TanStack Query provider. Done with
   the game screen. Later screens add endpoints to the same client.
4. Theme + the core primitives, ported from `app/components/util/`:
   `Eyebrow`, `SectionHead`, `Wordmark`, `Panel`, `EmptyState`, `Avatar`, a
   rating badge (tier colours), buttons, text inputs, `Modal` → bottom sheet.
   > **Done.** Colours (including the rating tiers), the type scale, spacing,
   > radii, and the website's single dark scheme live in `packages/shared/tokens.ts`.
   > The phone theme re-exports them. Eyebrow, SectionHead, Wordmark, Panel,
   > EmptyState, Avatar, the rating badge, buttons, text inputs, and a bottom-sheet
   > Modal are in `apps/mobile/src/components/`, and the tabs, profile hub, game
   > screen, and auth screens use them. Web tier colours still resolve through
   > the CSS variables. A lint rule and `src/theme/raw-hex.test.ts` keep raw hex
   > out of the phone screens.
5. Sentry + a `__DEV__` API base URL (your LAN IP running `npm run dev`).
   > **Done.** In `__DEV__` the phone calls `http://<host>:3000`, where `<host>`
   > is Expo's `hostUri` (the computer running Metro) and `3000` is `npm run dev`.
   > `EXPO_PUBLIC_API_URL` overrides that, which is how the verify harness points
   > Expo web at port 3210. A release build uses `EXPO_PUBLIC_API_URL` as the
   > site origin and throws if it is unset. It does not reuse the dev host.
   > `npm run dev` passes no `-H`. Next 16 then listens on every interface, so
   > a phone on the same Wi-Fi can reach port 3000. `-H 127.0.0.1` (what
   > verify-screenpeak uses) does not. `/api/v1` sends
   > `Access-Control-Allow-Origin: *` with no credentials. Next's dev
   > cross-origin block applies to `/_next`, not the API. Native fetch ignores
   > CORS; Expo web needs those headers.
   > Sentry is `@sentry/react-native` through the Expo config plugin. Org
   > `im-a-teapot` (the website's org). Project `screenpeak-mobile`, not the
   > website project `javascript-nextjs`. No `EXPO_PUBLIC_SENTRY_DSN` means the
   > SDK never starts, including dev, tests, and Expo web. Events and
   > breadcrumbs on both apps go through `@screenpeak/shared/sentry`, which
   > strips emails, bearer tokens, Supabase session cookies, and the query or
   > hash keys `code`, `token_hash`, `access_token`, and `state`. The root
   > layout and the Expo Router error boundary both report when the SDK is on.
   >
   > Phase 2 is complete.

### Phase 3 — Screens (≈4–6 weeks)

Build in order of the core loop — each is shippable to TestFlight on its own:

1. **Game detail** — the read screen (hero, You and Community both /10 via `avg_rating`, taxonomy, reviews) landed in Phase 1 step 2b, including the signed-out signup prompt.
   > **Done.** The phone game page follows the website: title and tags, a full-size cover with the release year and community score beside it, In your library (a status chip, the score, and icon stats for hours, times played, and 100% when complete), The Scoreboard, Your turn, Credits, About, Gallery (a screenshot opens full screen in the app), The Community, paged reviews, Elsewhere, and the IGDB line. Rate picks a score in the tier colours, shows that score's label, and submits an optional note. The website has no spoiler flag, so the sheet does not add one. Edit sends the same score with the new note. Delete review sends the current score with an empty note, so the score stays; there is no rating-delete route. The library sheet saves status, and sends hours, play count, or the 100% flag only when that field changed. Add to list shows your lists first. New list opens the name and description, and creating a list can include this game. Writes refresh the game and reviews queries. The viewer's review, an existing library row, and list membership update immediately and roll back if the write fails. Community averages wait for the server, and the first library save does too. A 429 names the wait and offers Retry. Signed out, the page stays readable and Rate, Save game, or Add to list opens the signup prompt. The screen has a loading skeleton, an empty review state, an error with retry, and pull-to-refresh. Narrow widths use the tighter title, and the sheets scroll while the keyboard is open.
2. **Profile** — the hub (Loadout, Lists, library counts, privacy flags) landed in Phase 2 step 1.
   > **Done.** The Profile tab and `/user/[username]` show the avatar, display name, @username, title, member since, follower counts, and bio. Loadout and Lists stay pinned. The library row is the counts: it opens the Library tab for you, and that player's library for anyone else. Loadout and the library row show only when you own them or the player made them public. Lists stay linked; a private list stays off the lists route. Favorites, recent written reviews, the read-out quote, and the stats (Games and Completed only with the library; Rated and Avg always) are on the page. Follow and unfollow, while you are signed in on someone else's profile, update the count immediately and roll back on a 429. Edit profile opened a Settings stub until step 9 replaced it. View all reviews opened a ratings stub until step 7 replaced it. The editors themselves are later screens.
3. **Library** — the signed-in list landed in Phase 2 step 1.
   > **Done.** The Library tab and `/user/[username]/library` are a two-column cover grid. The website returns the filtered set in one response, so the phone virtualizes that list. A Status dropdown and 100% only share a row. A Sort dropdown and the website's direction toggle share the next. Search has no caption. Each facet is a searchable picker with a selected count and Clear. A filter change keeps the current grid on screen. Each card shows the status chip, both scores, and icon stats for hours, times played, and 100%. The owner edits from a pencil on the cover, through the same library sheet as the game page, and that press does not open the game. Tapping the card opens the game. Another player's library opens from their profile hub. A private library says so and does not request the games. Empty, loading, error, and 429 states are on the screen. The Screen | Peak wordmark is centered in the header bar.
4. **Lists** — index and detail landed in Phase 2 step 1.
   > **Done.** The Profile hub's Lists row opens `/user/[username]/lists`. A Show dropdown reads Show: My lists or Show: {username}'s lists, and the other choice is Liked lists. Private lists stay on your own user tab. Another player does not see them, and the direct URL says Not found. Cards show the name, the game count, a lock when private, a one-line date, and the owner. The profile link is the username text. A borderless heart sits beside the like count, in accent whether or not it is filled. It is a button on someone else's list and a count on your own or when signed out. The server rejects liking your own list. Pin stays on your own card. The detail is the title, description, owner, and a two-column cover grid in stored order. The website has no ranked layout, notes, or reorder, so the phone does not add them. The owner creates a list and edits the name, description, public flag, and pin. Delete asks first. The default Wishlist cannot be deleted. Add games is a search, then Save games. Remove sits on the cover, asks first, and does not open the game. Writes update this viewer's cache immediately and roll back on a 429, which names the wait. The game page's New list shows on the Add to list sheet before the game reload finishes, and a game already in a list reads In this list. Empty, loading, error, and 429 states are on the screen. Keys end with the viewer id, and the previous page stays only for that viewer and that username. A second tap sends one write, and overlapping rate limits restore the server label. Dates are the local calendar day. Five covers shrink to fit a 320-point card. The like control is named Like list or Unlike list with the count, and its hit area stays 44 points without a tall button. Signing out drops the lists cache.
5. **Feed** — the first page landed in Phase 2 step 1.
   > **Done.** The Feed tab follows the website's cards. Each starts with the avatar, the username as a profile link, what they did, an activity icon, and how long ago it was. A rating or library add shows the cover with one score tag (community, else yours), the title, and the year and developer. A review shows the cover with its score, the title, and the review clamped to three lines with Read more. A created or liked list shows the name, description, likes, game count, and up to five covers. A batch of library adds shows its covers and opens that player's library. The wording, the time-ago labels, and the empty state come from `@screenpeak/shared/feed-copy`, which the website now uses too. The tab loads `FEED_PAGE_SIZE` (12) rows a page with `useInfiniteQuery` and asks for the next page near the end of the list. Pull-to-refresh reloads every loaded page. A failed next page or refresh keeps what loaded and offers Retry; only a failed first page replaces the screen. A 429 names the wait. `get_feed` sorted only by `created_at`, and rows written in one transaction tie, so an `OFFSET` page could repeat or skip one. Migration 0011 ends the sort with actor, activity type, game, and list, which no two rows share. Offsets still shift when a friend posts between page loads; the phone shows a row that comes back on the next page once. Following someone on the phone refetches the feed in the background. The tab has a loading skeleton, an empty state (Your feed is quiet, with Find people to follow opening Explore), and pull-to-refresh. `drive mobile-feed` covers it on Expo web, except pull-to-refresh, which React Native Web does not render.
6. **Explore** and the catalogue — search, trending, friends' activity, recommendations, and genre/platform browse landed in Phase 2 step 1. Games is not a tab. The catalogue is the native `/games` page; welcome's Browse button and Explore's Browse all open it, not a web view. Still to build: the rest of the filters.
   > **Done.** Explore follows the website's page and keeps the phone's search and browse. Search shows each hit's cover, year, and community score. Browse all sits under the search bar: before a search it opens the whole catalogue, after one the catalogue with that search. The range is a row of four buttons (This week, This month, This year, All time); another range keeps the current one on screen until it loads. Peak right now is a sideways rail of game cards. Signed in, Recommended for you shows games the people you follow completed (with how many and their average, and In your backlog or On your wishlist), lists they liked, and players they follow, each with the website's line above it, or No recommendations yet. Signed out, it asks you to sign up. Lists peaking now uses the Lists screen's card, now `ListCardView` in `list-card.tsx`. The heart likes someone else's list and is only a count on your own (Explore compares the owner's username, since its lists carry no owner id). A like updates every card for that list at once and rolls back on failure, and a list write anywhere reloads Explore. At the bottom, Browse by genre and Browse by platform are dropdowns, like the Library tab's: each opens a sheet you can narrow by typing, and a pick opens the catalogue filtered to it. Browse all is there too. The catalogue is a two-column cover grid that loads 24 games a page (`useInfiniteQuery`, page numbers from 1; `query_games` already ends its sort in name and id). It has a Sort dropdown (Name, ScreenPeak rating) and the direction toggle, a name search, and a Filters sheet. Genre, Platform, and ESRB pick from the page's options. Developer and Publisher search `GET /api/v1/taxonomy/[table]/search` once typing pauses. Active filters are removable chips with Clear all. `GamesListPage` gained `filter_names` (additive), so a developer or publisher chip shows the name instead of the slug. A link's URL filters seed the screen; changes stay on the screen until another link opens it. A filter or sort change keeps the old grid and says Updating results. Both screens have a loading skeleton, empty states, a failed refresh or next page that keeps what loaded with Retry, and pull-to-refresh. The dropdown trigger, direction toggle, and facet pickers are shared with the Library tab in `filter-controls.tsx`, and the load-more footer with the feed in `more-footer.tsx`. `drive mobile-explore` covers both on Expo web, except pull-to-refresh.
7. **Ratings & reviews** page.
   > **Done.** View all reviews on a profile opens `/user/[username]/ratings_reviews`, which replaces the stub. It has a link back to the profile, the website's heading and counts line (`N ratings / N reviews / N total`), a Show dropdown (All, Reviews, Ratings), and a Sort dropdown (Date, Rating) with the direction toggle; a new sort starts newest or highest first. A score-only rating is one line: a small cover, the name, the year and developer, the score in its tier colour, and the date. A written review adds a larger cover and the note, clamped to four lines with Read more (`ClampedText`, shared with the feed). The list loads 20 rows a page with `useInfiniteQuery`, and a Show or Sort change keeps the old rows on screen until the new ones load. Show and Sort stay visible when nothing matches, with an empty line for each choice (`@screenpeak/shared/ratings-copy`). The website used to render nothing and hide its filters on an empty result, so an empty Reviews filter there could not be switched back; it now keeps them and shows the same line. The page is public, signed in or out. Rating or reviewing a game refreshes it. `get_user_ratings_reviews` sorted only by date or score, so pages repeated or skipped tied rows, on the website too; migration 0012 ends both sorts with the date, the game name, and the game id, and pins the function's `search_path`. The screen has a loading skeleton, a failed refresh or next page that keeps what loaded with Retry, and pull-to-refresh. `drive mobile-ratings` covers it on Expo web, except pull-to-refresh.
8. **Loadout** — stats charts + generate/clear.
   > **Done.** The profile's Loadout row opens `/user/[username]/loadout`, which follows the website's stats screen: the heading, four stats (Saved, Completed, Rated, Avg truncated to two decimals), the Read-out panel, Scoring style (`DistributionChart`, ported: one tier-coloured bar per score with its count and share), Favorite genres and developers as panels with their weighted averages in tier colour, and Top and Bottom scores as sideways game rails (`GameRail`, shared with Explore). Empty sections are left out. The Read-out is quoted to everyone. Its owner gets Regenerate, Save to profile (copies it to `profile_loadout_bio`, then reads Saved to profile), and Clear my Read-out, which asks first and empties both columns optimistically with a rollback. An owner short of five ratings sees how many more, a progress bar, and Find games to rate; an eligible owner with no paragraph sees Generate your Read-out; anyone else sees No Read-out yet. The phone could not generate before: the website's `POST /api/loadout` answers in its own error shape. `POST /api/v1/me/loadout` is the bearer route (write budget first), returning `{ identity }` (`LoadoutGenerated`, additive), 429 `rate_limited` with `Retry-After` inside the one-a-minute window, 400 under five ratings, and 503 `unavailable` when the model returns nothing. Both routes call `generateReadout` in `lib/loadout-readout.ts`, and the website's statuses are unchanged. The screen has a loading skeleton, a failed refresh that keeps the page with Retry, and pull-to-refresh. `drive mobile-loadout` covers it on Expo web; without `ANTHROPIC_API_KEY` it proves only that a failed generation saves nothing.
9. **Settings** — username, bio, title, privacy toggles, avatar
   (`expo-image-picker` → presigned R2 PUT), email/password, delete account.
   > **Done.** Edit profile opens `/settings`, which replaces the stub. It follows the website's settings page and keeps the profile's title and bio editors there too: the avatar with Change photo, the username, title (Title-less Noob when none is picked), and Member since; Profile (Title, Bio); Account (Username, Email, Password); Privacy (Default list, Library, Loadout, each Public or Private); Sign out, which the phone had nowhere before; and Danger zone. Each field edits in a sheet. Title picks from `getTitles`, now `@screenpeak/shared/titles` so both apps offer the same list. Bio counts to 500. Username checks `usernameSchema` before saving, and a rename refetches every cached screen, since profile, library, and list keys carry usernames. Email calls Supabase `updateUser` from the phone, as the website does, and says to follow the confirmation link; the address stays until then. Password asks for the current one (checked by signing in with it, as the website does) and the new one twice. Privacy flips optimistically and rolls back on failure. Change photo picks from the library (`expo-image-picker`, square crop, no permission prompt), shrinks it to a 512-pixel JPEG (`expo-image-manipulator`), then calls `POST /me/avatar/upload-url`, PUTs to R2, and saves with `PUT /me/avatar`. Delete account asks first, calls the new `DELETE /api/v1/me` (bearer, write budget), drops the session locally, clears the cache, and returns home. The admin client moved from the website route into `lib/account-deletion.ts`, which both routes call. Signed out, the screen asks you to log in. Steam stays for step 10. The profile's Edit pencil became a full-width Settings button, shown only on your own profile. Favorite games edit on the profile, as on the website: Edit on the Favorite games heading (Pick favorite games when there are none) opens a sheet that searches with `GET /api/v1/games/search`, picks up to five (`FAVORITE_GAMES_MAX`, now in `@screenpeak/shared/constants`; a new pick goes first), and saves with `PATCH /me` `favoriteGames`, then refetches the profile. The screen has a loading skeleton, a failed refresh that keeps the page with Retry, and pull-to-refresh. `drive mobile-settings` covers it on Expo web and `drive mobile-profile` covers the favorites sheet, except Change photo (it needs R2 and the system picker) and pull-to-refresh; the harness gained a local service key and an admin delete on its gateway for it.
10. **Steam link + import** — in v1, last. OpenID `state` token, then `POST /me/steam/import` one batch at a time (cursor + lease). Not a single library download.

   > **Done.** Settings has a Connections section, as on the website: Steam is Linked or Not linked. Link Steam makes an RFC 7636 S256 pair on the phone (`expo-crypto`, installed with `--install-strategy=shallow` so it stays beside `expo`), sends the challenge to `POST /me/steam/link-intent`, opens the returned `path` on the API origin in the system browser sheet (`openAuthSessionAsync`, returning to `screenpeak://steamlink`), and redeems the one-time `code` with the verifier at `POST /me/steam/link-complete`. Closing the sheet does nothing; `ok=0` or a failed call shows the sentence. Linked, it opens `/steamlink`, the website's import page: `POST /me/steam/import` one batch at a time with the website's loop (follow `nextCursor`, one more pass from the start while apps remain, wait out another import's `notice`, "Try the remaining matches again"), the same matching sentence, and the website's merge, so a later batch never undoes a field you edited. Each matched game can be deselected or edited in a sheet (status, hours, times played, 100%; hours checked with `hoursPlayedSchema`). Import games (N) sends the selection to `POST /me/library/import` and refreshes the library, profile, game, and feed caches. A private Steam library shows where Steam keeps Game Details (`STEAM_NOT_PUBLIC_MESSAGE`, now shared, is how the phone tells it apart). Re-sync opens the import again; Unlink Steam asks, then `DELETE /me/steam`. `/steamlink` before linking says to link in Settings. In development, Steam returns the sheet to `NEXT_PUBLIC_SITE_URL`'s callback, so on a physical phone that has to be an address the phone can reach (the simulator can use `localhost`). Android was not checked: its browser return also arrives as a deep link to `/steamlink`. `drive mobile-settings` covers the Connections states and Unlink on Expo web; it does not press Link Steam or Re-sync, because the harness has no Steam account and would call Steam with a made-up id.

For each screen: loading skeleton, empty state, error + retry, pull-to-refresh,
and check it on a small phone (iPhone SE size) and with the keyboard open.

### Phase 4 — Native polish (≈1–2 weeks)

- **Deep links / Universal Links**: `screenpeak.app/games/elden-ring` opens the
  game screen in the app if installed. Requires an `apple-app-site-association`
  file and Android `assetlinks.json` served from the web app's `public/.well-known/`.
  > **Done, modulo two placeholders.** `apps/web/public/.well-known/apple-app-site-association`
  > and `assetlinks.json` cover every mobile route that mirrors a web one: `/explore`,
  > `/games`, `/games/*`, `/user/*` (not `/settings`, `/auth/*`, `/steamlink`, or the
  > legal pages — those aren't symmetric between the two clients). `next.config.ts`
  > adds a `Content-Type: application/json` header for the extensionless AASA file;
  > `assetlinks.json` gets it from its own extension. `apps/mobile/app.json` gained
  > `android.package` (missing before this — required for any Android build, not
  > just App Links), `ios.associatedDomains: ["applinks:screenpeak.app"]`, and a
  > matching `android.intentFilters` entry with `autoVerify: true`. Expo Router
  > needs no extra linking code: deep linking is automatic for every screen once
  > these are set. `test/lib/well-known.test.ts` checks both files' shape.
  > **Still open:** the AASA's `appID` is `REPLACE_WITH_APPLE_TEAM_ID.com.steventpot.screenpeak`
  > (the real 10-character Apple Developer Team ID isn't known yet — Apple Developer
  > account → Membership, or `eas credentials -p ios` after first signed build) and
  > `assetlinks.json`'s `sha256_cert_fingerprints` is `REPLACE_WITH_SHA256_CERT_FINGERPRINT`
  > (only exists once a signed Android build has run — `eas credentials -p android`).
  > Both are guarded by a test that fails once they're filled in, as a reminder to
  > update the test alongside them. Apple only re-fetches the AASA at install/update
  > time, so a real device won't pick up a later path change without a fresh install.
  > This also needs the site actually hosted (Phase 5) before a real device can
  > fetch either file.
- **Share sheet**: share a game, list, or profile (as its web URL).
  > **Done.** `AppHeader` (`src/components/app-header.tsx`) gained an optional
  > `trailing` slot — the mirror of the `onBack` slot it already had — so a
  > per-screen action can sit beside the centered wordmark without each screen
  > re-laying out its own header. `ShareButton` (`src/components/share-button.tsx`)
  > fills that slot on the game page, the profile hub, and list detail, each
  > passing its own already-built web URL (`src/lib/share.ts`:
  > `gameShareUrl`/`profileShareUrl`/`listShareUrl`, all `${SITE_ORIGIN}${...Href(...)}`
  > — reusing the `routes.ts` href builders and the `SITE_ORIGIN` constant Steam
  > linking already defined, so the Universal Links paths and the share links
  > can't drift apart). `shareUrl()` opens the native share sheet
  > (`react-native`'s `Share.share`, `url` on iOS and `message` on Android,
  > since Android has no `url` field); web has no share sheet, so it tries the
  > Web Share API, then falls back to `navigator.clipboard.writeText`, and the
  > button itself shows "Link copied" for two seconds only for that fallback —
  > a real native sheet or the Web Share API already confirms itself. List
  > detail's `shareUrl` prop is a plain string built one level up in
  > `lists-browser.tsx`, where the list id is already in scope, rather than
  > recomputing it from a username/listId pair passed down. **Found in manual
  > verification, not by the unit tests**: the first pass let a denied
  > `navigator.clipboard.writeText()` (e.g. a permissions-policy block)
  > propagate as an uncaught promise rejection, crashing the screen with Expo's
  > red error overlay instead of just doing nothing; `shareOnWeb` now catches
  > that and returns `'unsupported'`, with a regression test
  > (`src/lib/share.test.ts`) locking it in. Verified signed in as `peek`
  > against the local dev server on Expo web: the icon renders in the header's
  > trailing slot on `/games/elden-ring`, `/user/peek`, and `/user/peek/lists/<id>`,
  > each with the right accessible name (`Share Elden Ring`, `Share peek's
  > profile`, `Share Wishlist`), and list/game-page skeletons correctly render
  > no Share button before there's a URL to share.
- **Haptics** on rate / like / follow; port the `screenpeak:plus1` tic as a
  native animation (Reanimated).
  > **Done.** `lib/haptics.ts`'s `tapHaptic()` (`Haptics.impactAsync(Light)`,
  > fire-and-forget) fires on every Rate submit, every list like/unlike
  > (inside `ListLike` itself, in `list-chrome.tsx`, since all three of its
  > call sites — list detail, the shared list card, the feed's read-only
  > card — funnel through there), and every follow/unfollow tap, regardless
  > of whether the write itself succeeds.
  >
  > The +1 tic is `lib/plus1.ts` (`plus1(label?, n?)` + a plain `Set`-based
  > subscribe, no event bus needed without `window`) and `Plus1Layer`
  > (mounted once in `_layout.tsx`, alongside `<Stack />`), ported call site
  > for call site from the website's `lib/plus1.ts` writers: RATED (first
  > score only), SAVED/COMPLETED (new library entry, or an existing one's
  > first "completed"), NEW LIST (both the Lists tab's own create and the
  > game page's create-and-add — one chip for the latter, not also LISTED),
  > LISTED (adding to an existing list), FAVORITED (a newly pinned favorite,
  > via the new `addedNewFavorite()` in `lib/profile-hub.ts`). Never list
  > likes or follows — those are about other people, same as the website.
  > Each "was this new" check reads the pre-write cached page already in the
  > closure, mirroring the website's own `wasNew` pattern, and fires only
  > after the write actually succeeds.
  >
  > The chip itself: a single Reanimated `progress` value (0→1,
  > `withTiming` + the website's exact cubic-bezier) drives opacity,
  > translateY, and scale via `interpolate()` at the same percentages as
  > the CSS `sp-plus1` keyframes; `useReducedMotion()` swaps to the
  > `sp-plus1-rm` fallback (stay visible, cut opacity at the end) instead of
  > skipping the animation outright, since the chip is the only feedback a
  > write gets. Vitest can't parse real `react-native`/`react-native-reanimated`
  > (Flow syntax) any more than it could `lucide-react-native`; `expo-haptics`
  > hit the same wall a different way (`__DEV__` undefined under Node), so
  > `test/expo-haptics.ts` joins `test/lucide-react-native.tsx` as a global
  > vitest alias, and `plus1-layer.test.tsx` mocks `react-native-reanimated`
  > locally (Reanimated's own official `mock.js` still imports real
  > `react-native`, so it doesn't sidestep the problem on its own).
  >
  > **Found live, not by a screenshot of the chip** (its tool round-trips run
  > slower than the 1s animation): no crashes across repeated rate-amend,
  > library-save, and remove cycles against the local dev server, console
  > clean throughout. The chip's own correctness — mount, stacked text,
  > timed removal — is asserted with fake timers in `plus1-layer.test.tsx`
  > instead, the right tool for something this fast.
- **Optimistic updates** for like / follow / library status.
- **Push notifications** (optional for v1): new follower, list liked. Needs an
  Expo push token table + sending from the server.
- App icon, splash screen, dark-only status bar styling.
  > **Done.** The app shipped with Expo's own template placeholder — the
  > stock blue "A" mark (`assets/images/icon.png`, the Android adaptive
  > layers, and `assets/expo.icon`'s untouched Icon Composer bundle) — never
  > actually designed for ScreenPeak. The new icon and splash are the seam
  > (DESIGN.md §6, "the recurring structural marker") at app-icon scale: a
  > glowing cyan bar on the graphite ground, generated from one parametric
  > SVG (`sharp`, not hand-drawn) so every size — the 1024 icon, the Android
  > adaptive foreground/background/monochrome layers, the splash glyph — is
  > the same shape at the right proportions, not five separately-eyeballed
  > exports. Checked: legible at a 64×64 downscale, and the foreground still
  > sits clear of the Android adaptive icon's ~61%-diameter safe-zone circle
  > under every mask shape. `ios.icon` now falls back to the same flat PNG
  > instead of the default `expo.icon` bundle (deleted) — that bundle is
  > Apple's new multi-layer "Icon Composer" format for the iOS 18+ Liquid
  > Glass effect, and hand-authoring one correctly without a way to preview
  > it in Xcode was a worse bet than a flat icon that's guaranteed to render
  > right everywhere; revisit it once someone can check it in Xcode.
  > Status bar: `userInterfaceStyle: "dark"` and root `backgroundColor`
  > (`expo-system-ui` is already a dependency, which both need) were already
  > set, and `<StatusBar style="light" />` was already called at runtime —
  > the one gap was the `expo-status-bar` config plugin itself, which now
  > also gets `{ "style": "light" }` so the correct status-bar content color
  > is set natively before JS runs, instead of only once React mounts.
  > **Not done**: a real device/Simulator screenshot of the installed app.
  > `expo prebuild --clean` + `pod install` succeeded, but the first real
  > `xcodebuild` compile this project has ever done (every earlier
  > Simulator run in this session went through Metro/a dev client, which
  > never touches Xcode build phases) failed in an unrelated phase: Sentry's
  > generated "Upload Debug Symbols" script calls bare `node` without
  > sourcing `.xcode.env`, and Xcode's build-phase PATH doesn't include
  > nvm's node, so it's not on PATH there even though `.xcode.env.local`
  > sets `NODE_BINARY` correctly for the phases that source it. That's a
  > pre-existing local Sentry/Xcode/nvm PATH gap, not something this change
  > introduced, and not a CNG-safe thing to hand-patch in the generated
  > Xcode project (prebuild would just overwrite it). Verification instead
  > leaned on composited previews of every generated asset (icon, each
  > Android layer, splash) plus the adaptive-icon safe-zone circle-mask
  > check above, and `expo config` / `expo-doctor` to confirm the plugin
  > config itself resolves cleanly.

### Phase 5 — Release (≈1–2 weeks, partly waiting on review)

0. **Host the web app first.** Until now the phone has talked to `npm run dev`
   on your Mac over Wi-Fi. TestFlight testers can't reach your laptop, so the
   `/api/v1` backend needs a public HTTPS URL before any external build goes
   out. Since the site isn't in production yet, this is the natural moment to
   launch it — web and app can go live together. When you create the hosting
   project, set its **Root Directory to `apps/web`** (Vercel: Project →
   Settings → Build & Deployment) and copy the env vars from
   `apps/web/.env.local`. Point the mobile `production`/`preview` EAS profiles
   at that URL with `EXPO_PUBLIC_API_URL`. A release build throws if it is unset.

   **Before first deploy**

   - [ ] Set the Vercel project's **Root Directory** to `apps/web`.
     `apps/web/vercel.json` schedules `GET /api/cron/rate-limits`. If the
     project root stays the repo root, that file is not read and the cron does
     not run. Either set the root to `apps/web`, or place `vercel.json` at the
     project root. Do not keep two copies.
   - [ ] Set `CRON_SECRET` in the Vercel project. The cron sends
     `Authorization: Bearer $CRON_SECRET`. If it is unset, the route is 401 and
     old `api_rate_limits` rows are not deleted.
   - [ ] Set `STEAM_LINK_INTENT_SECRET` to at least 32 characters
     (`openssl rand -base64 32`). Without it,
     `POST /api/v1/me/steam/link-intent` is 500 and the phone cannot start
     Steam linking. The website Steam button does not read this secret.
   - [ ] Apply migration `0010_steam_link_intents` with `migrate:journal`
     (`npm run migrate:journal -w @screenpeak/web -- --database-env DATABASE_URL --apply-pending`
     against the database this deploy uses). Phone linking reads
     `steam_link_intents`. A database that stopped at `0009` has no table for it.
   - [ ] Copy the rest of `apps/web/.env.local` (Phase 5 step 0). Phone Steam
     import adds no other variable. `STEAM_API_KEY` was already required for
     the website import. `NEXT_PUBLIC_SITE_URL` is the OpenID realm.
   - [ ] Add the phone password-reset URLs to the Supabase Auth redirect
     allowlist (Authentication → URL Configuration). The app sends the same
     path the website uses: `/auth/confirm?next=/auth/update-password`.
     A `*` wildcard does not match that `next` value, because `next` contains
     `/`. Add these entries:
     - `screenpeak://auth/confirm**` — native deep link (`screenpeak` is the
       scheme in `apps/mobile/app.json`).
     - `http://localhost:8081/auth/confirm**` — Expo web on the dev port.
     - `http://127.0.0.1:8081/auth/confirm**` — Expo web when the host is
       `127.0.0.1` instead of `localhost`.
     - `https://<expo-web-host>/auth/confirm**` — only if Expo web is hosted.
     Keep the website origin's `/auth/confirm**` listed too. Auth rejects the
     reset email's redirect until the URL is on the list. Signup confirmation
     still uses the website's `/auth/confirm`, not the app scheme. No extra
     allowlist entry is required for sign-up.
   - [ ] Create a React Native Sentry project named `screenpeak-mobile` in the
     existing org `im-a-teapot`. Leave the website project `javascript-nextjs`
     as it is. Set `EXPO_PUBLIC_SENTRY_DSN` on the EAS preview and production
     environments to that project's DSN. Leave it unset for local Expo; the
     phone SDK does not start without it.
   - [ ] Upload mobile source maps with `SENTRY_AUTH_TOKEN`, the same variable
     the website uses. `withSentryConfig` in `apps/web/next.config.ts` reads it
     from `.env.sentry-build-plugin` (gitignored). The Expo plugin
     (`@sentry/react-native/expo`, org `im-a-teapot`, project
     `screenpeak-mobile`) reads the same name. An organization token can upload
     maps for the new project: add the existing token as an EAS secret named
     `SENTRY_AUTH_TOKEN`. A token limited to `javascript-nextjs` cannot. In
     that case create an organization auth token (Sentry → Settings → Auth
     Tokens, source-map upload) and store that as the secret instead. Do not
     commit the token.
1. `eas build --profile preview` → TestFlight (iOS) and Internal testing
   (Android). Get 3–5 friends on it for a week.
2. Store listings: screenshots, description, keywords, privacy policy URL (you
   have `/policy` ✓), privacy nutrition labels / Data safety form (email,
   username, Steam ID, library data, Sentry diagnostics).
3. App Review notes: provide a demo account. Mention that account deletion is
   in Settings (Guideline 5.1.1(v) ✓). Sign in with Apple isn't required
   because you only offer email/password sign-in — Steam is account *linking*,
   not login. If you ever add "Sign in with Steam/Google", revisit Guideline 4.8.
4. **IGDB commercial partnership** before a public launch or an App Store submission that ships the catalogue. A written partnership has to cover storage, caching, and attribution (`docs/igdb.md`, `docs/backlog.md`). It does not block TestFlight or other test builds. The footer and the phone's `DataAttribution` already credit IGDB.
5. `eas submit`. Expect a first-submission rejection or two; it's normal.
6. Decide an update policy: JS/UI fixes via `eas update`; native changes via a
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
#    (on SDK 58 — see Phase 0 step 3; use the current SDK and --no-install)
npx create-expo-app@latest --template default@sdk-58 apps/mobile --no-install
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
- **Bundle contamination.** `packages/shared` must stay free of server imports.
  A `'use client'` file must not import `lib/queries/game.ts`, `lib/db`,
  `lib/auth`, or `lib/rate-limit`. Search goes through `app/search-actions.ts`.
  `test/api/client-boundary.test.ts` scans for that import.
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
- [x] Search in the favorite-game picker (exercises `app/search-actions.ts`)
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
| `README.md`, `docs/` (including `docs/backlog.md`), `build-plan.md`, `ship-readiness.html` | Project docs |
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
   keeps resolving exactly as today. Schema changes after the move go through
   `npm run migrate:journal -w @screenpeak/web`, not `drizzle-kit push`.
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
    game: GameDetail          // uuid id, igdb_id, display-ready image URLs. No steam_appid, no Metacritic.
    taxonomy: GameTaxonomy
    stats: GameRatingsStats   // community score is avg_rating
    viewer: null | {          // null = signed out
        review: GameRatingReview | null
        libraryEntry: ViewerLibraryEntry | null
        lists: ViewerListOption[]
        listIdsGameIsIn: string[]
        defaultListPrivacy: boolean
    }
}
```

A description only — no queries, compiles to nothing.

### B.3 `packages/shared/api/client.ts` — how the phone asks for it

```ts
import type { GamePageData } from './games'

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
import type { GamePageData } from '@screenpeak/shared/api/games'
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

> Built in Phase 1 step 2 as `apps/web/lib/loaders/game-page.ts`. The real
> return uses `GameDetail`, `defaultListPrivacy`, and display-ready image
> URLs (`displayGameImages` from `@screenpeak/shared/images`). See the step 2
> note. Slugs are the IGDB slug, or `` `${base}-${games.id}` `` when that slug
> is already taken.

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
// apps/mobile/src/lib/api/index.ts
import { createApiClient } from '@screenpeak/shared/api/client'
import { supabase } from '../supabase'

export const api = createApiClient({
    baseUrl: process.env.EXPO_PUBLIC_API_URL!,                  // Mac's LAN IP in dev, the hosted site later
    getToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
})
```

```tsx
// apps/mobile/src/app/games/[slug].tsx
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
            <StatCompare signedIn={!!viewer} you={viewer?.review?.rating ?? null} community={stats.avg_rating} communityCount={stats.total_ratings} />
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

`createApiClient(...)` runs **once**, when `apps/mobile/src/lib/api/index.ts` is first
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

### B.9 Why the client lives in `packages/shared`

`packages/shared` holds code that is safe to ship inside the phone app: no
`db`, no `postgres`, no `next/*`, no React, nothing server-only. Being
imported by both apps is not the test. The website never calls `/api/v1`:

- Server Components call **loaders** directly (B.5).
- Client components call **Server Actions** — including search, which uses
  `app/search-actions.ts` rather than going through the API (Phase 1 step 6).

So today the phone is the client's only caller. It still lives in
`packages/shared/api/client.ts`, beside the contract types it is typed
against, for two reasons:

- A contract change and the client method that sends it are edited in the
  same folder, and `npx tsc --noEmit -p packages/shared` checks them together.
- It uses only `fetch` and the shared types, so nothing about it is
  phone-specific. A second caller (a browser extension, a script) imports it
  as it is.

The website does not bundle it: no web file imports it, so it never reaches a
web build. What stays in `apps/mobile/src/lib/api/index.ts` is the phone's
configuration: the base URL from `EXPO_PUBLIC_API_URL` and the Supabase session
token. The client's own tests are in `apps/mobile/src/lib/api/client.test.ts`.

The route file's own path is the server's side of each URL string
(`/api/v1/games/${slug}`), and a mismatch shows up immediately as a 404 in
development.

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
