# Drizzle Query Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move ScreenPeak's database access from `supabase-js` to Drizzle (direct Postgres), keeping `supabase-js` only for Auth and Storage — matching the pattern already used on the user's other project.

**Architecture:** Two new files (`lib/db.ts`, `lib/auth.ts`) provide a Drizzle client and a verified-session helper. Each `lib/queries/*.ts` file drops its `supabase: SupabaseClient` first parameter entirely — converted functions import `{ db }` from `lib/db.ts` at module scope instead (matching the user's other project; `db` is a singleton connection pool, not request-scoped, so there's no need to thread it through every call). The handful of functions that are genuinely Supabase Auth calls (`getViewer`, `signInWithPassword`, etc.) keep taking an injected `supabase: SupabaseClient`, since that client IS request-scoped (cookie-bound). Every client-side (`'use client'`) mutation call site becomes a Server Action: the action calls `requireUser()` (throws if unauthenticated — the client already gates on `if (!user) return` before calling, so this is a safety net, not the primary UX path) and passes the verified id into the query function.

**Tech Stack:** `drizzle-orm` (already a dependency), `postgres` (postgres.js driver, already installed), existing `db/schema.ts` / `db/relations.ts`, Next.js Server Actions (imperative calls, not `useActionState`/`<form action>` — matches ScreenPeak's existing onClick-handler style), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-21-drizzle-migration-design.md` (see also the corrections below — a bug in the original client/server-component detection undercounted the client-side mutation surface; this plan reflects the corrected count)

## Global Constraints

- **No dependency injection for `db`.** Every converted `lib/queries/*.ts` function drops its `supabase`/`db` first parameter. The file imports `{ db } from '@/lib/db'` once at module scope and every function body calls `db.select(...)`/`db.insert(...)`/etc. directly. Only functions that are genuinely Supabase Auth calls keep an injected `supabase: SupabaseClient` param (that client is cookie-bound per-request, unlike `db`, which is a shared singleton pool).
- **Column-name preservation.** Drizzle's `db.select()` returns camelCase keys matching schema field names by default (verified empirically). Every converted read uses the **object form** — `db.select({ cover_image_url: table.coverImageUrl, ... })` — aliasing each column back to the exact snake_case key the current `supabase-js` response used, so `@/types` and every consuming component need zero changes.
- **RPC calling convention.** `db.execute(sql\`select * from fn_name(p_arg => ${val}, ...)\`)`, Postgres named-argument syntax. Verified empirically: `db.execute()` (postgres-js driver) returns a plain array directly — no `.rows` wrapper — of plain objects keyed by the SQL output's actual column names. Where a JS caller doesn't override an optional RPC parameter today, pass the same value as the SQL function's own `DEFAULT` explicitly (documented per-function in each task).
- **Error handling — preserve exactly, don't standardize** (except the one deliberate fix called out below). Drizzle throws on query failure; `supabase-js` returns `{ data, error }` and usually doesn't throw. Every converted function reproduces its *current* exact behavior via try/catch. Standardizing this globally is out of scope (tracked in the spec).
- **Deliberate fix: `syncListGames` becomes transactional.** Today it fires its remove-games and add-games writes as two independent, non-atomic calls (`Promise.all` of two unrelated queries) — a failure partway through can leave a list half-updated. The Drizzle version wraps both in `db.transaction()`. This is the one intentional behavior change in this migration; everything else preserves current behavior exactly.
- **Auth boundary:** `requireUser()` (`lib/auth.ts`) is called only inside Server Actions/Server Components, never inside `lib/queries/*` functions. It **throws** `Error('Unauthenticated')` rather than redirecting — every client call site already gates on `if (!user) return` before invoking a mutation, so a thrown error here is a safety net, not a UX path. A Server Action calling `requireUser()` before a query function that itself returns a `{ error }` shape means an auth failure surfaces as a *rejected promise*, not that same `{ error }` shape — this is a deliberate, understood inconsistency (not unified) because today's equivalent components (e.g. `FollowButton`) have no error handling around this path either; wrapping it uniformly would be adding error handling beyond what exists today.
- **Corrected "stays on `supabase-js`" list** (the original spec's detection script had a bug — it only matched the `'use client'` directive with single quotes; this codebase also uses double quotes, `"use client"`, which caused 18 client components to be misclassified as server-side. This list is the corrected, verified-by-direct-read version):
  - `lib/queries/user.ts`: `signInWithPassword`, `signUpWithPassword`, `signOut`, `updateEmail`, `updatePassword` (Supabase Auth calls, not Postgres queries), `uploadAvatarImage` (Storage, not Postgres), `deleteUserAccount` (Auth admin API), `getViewer` (`supabase.auth.getUser()` — Auth, not a DB read), `getProfileSummaryById` (a real DB read, but called directly from `UserContext.tsx` with the browser client; not worth a Server Action for a simple profile-summary read).
  - `lib/queries/game.ts`: `searchTaxonomyTable`, `getTaxonomyNameBySlug` (called from `SearchableDropdown.tsx`), `searchGamesByName` (called from `FavoriteGamePicker.tsx` and `AddToListFromListButton.tsx` — a public, unauthenticated game-name search; no mutation risk, not worth a Server Action).
- **Corrected Server Action list** (~20 functions across 5 new/expanded action files, not the original spec's 3):
  - `app/library-actions.ts`: `createLibraryEntry`, `updateLibraryEntry`, `deleteLibraryEntry`, `getLibraryEntry` (read, but called from `LibraryButton.tsx` client-side), `upsertLibraryEntries` (called from `SteamLinkGamesSection.tsx`)
  - `app/review-actions.ts`: `createRatingReview`, `updateRatingReview` (called from `RateReviewButton.tsx`)
  - `app/list-actions.ts`: `likeList`, `unlikeList`, `addGameToList`, `removeGameFromList`, `syncListGames`, `createList`, `updateList`, `setListPinned` (called from `LikeListButton.tsx`, `AddToListButton.tsx`, `AddToListFromListButton.tsx`, `CreateListButton.tsx`, `CreateListFromGamePageButton.tsx`, `ListPreview.tsx`, `RemoveFromListButton.tsx`)
  - `app/user-actions.ts`: `updateAvatarUrl`, `updateFavoriteGames`, `updatePrivacy`, `updateUsername`, `updateBio`, `followUser`, `unfollowUser` (called from `AvatarUploader.tsx`, `FavoriteGamePicker.tsx`, `ChangePrivacyButton.tsx`, `ChangeUsernameButton.tsx`, `BioButton.tsx`, `FollowButton.tsx`)
  - `app/steam-actions.ts` (new file): `unlinkSteamAccount` (called from `UnlinkSteamAccountButton.tsx`)
- **Runtime Drizzle client:** `lib/db.ts` uses the **transaction pooler** (port 6543, `prepare: false`) via `DATABASE_POOL_URL`, separate from `drizzle.config.ts`'s session-pooler `DATABASE_URL` (unchanged, used only by `drizzle-kit` tooling).
- **Caller updates (Server Components/routes):** a file that currently does `const supabase = await createClient(); await someFn(supabase, ...)` for a converted function just drops the `supabase` argument: `await someFn(...)`. If the same file also calls something that stays on `supabase-js` (most commonly `getViewer`), it keeps `const supabase = await createClient()` for that call only.
- **Component diff convention in this plan:** for a `'use client'` component where only the imports and the body of one handler function change (the JSX markup is untouched), this plan shows the exact before/after for the changed lines only, not a full-file reproduction — the unchanged JSX is not repeated. Where more of the file changes (e.g. `LibraryButton.tsx`), the full file is shown.

---

### Task 1: Drizzle runtime client + `requireUser()` helper

**Files:**
- Create: `lib/db.ts`
- Create: `lib/auth.ts`
- Modify: `.env.local` (add `DATABASE_POOL_URL` — gitignored, you do this yourself)

**Interfaces:**
- Produces: `db` (named export, `lib/db.ts`), `export type DB = typeof db`.
- Produces: `requireUser(): Promise<{ id: string }>` (`lib/auth.ts`) — throws `Error('Unauthenticated')` if there's no verified session.

- [ ] **Step 1: Get the transaction-pooler connection string**

Same host/user/password as `DATABASE_URL`, port `6543` instead of `5432`:

```
# DATABASE_URL (session pooler, drizzle-kit only):
postgresql://postgres.PROJECT_REF:PASSWORD@aws-REGION.pooler.supabase.com:5432/postgres

# DATABASE_POOL_URL (transaction pooler — add to .env.local):
postgresql://postgres.PROJECT_REF:PASSWORD@aws-REGION.pooler.supabase.com:6543/postgres
```

- [ ] **Step 2: Write `lib/db.ts`**

```ts
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '@/db/schema'
import * as relations from '@/db/relations'

const connectionString = process.env.DATABASE_POOL_URL
if (!connectionString) throw new Error('DATABASE_POOL_URL is not set')

const client = postgres(connectionString, { prepare: false })

export const db = drizzle(client, { schema: { ...schema, ...relations } })
export type DB = typeof db
```

- [ ] **Step 3: Write `lib/auth.ts`**

```ts
import { createClient } from '@/lib/supabase-server'

export async function requireUser(): Promise<{ id: string }> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthenticated')
    return user
}
```

- [ ] **Step 4: Verify the client connects**

```bash
npx tsx --env-file=.env.local -e "
import('./lib/db').then(async ({ db }) => {
  const rows = await db.execute('select count(*)::int as n from genres')
  console.log('genres count:', rows[0].n)
  process.exit(0)
})
"
```

Expected: prints a genres count with no error.

- [ ] **Step 5: Commit**

```bash
git add lib/db.ts lib/auth.ts
git commit -m "Add Drizzle runtime client and requireUser() auth helper"
```

---

### Task 2: Convert `lib/queries/game.ts`

**Files:**
- Modify: `lib/queries/game.ts`
- Modify: `test/lib/queries.game.test.ts`
- Modify (caller updates, drop the `supabase`/`db` argument): `app/games/[slug]/page.tsx`, `app/games/page.tsx`, `app/page.tsx`, `app/steamlink/page.tsx`, `app/user/[username]/library/page.tsx`, `app/user/[username]/lists/[listId]/page.tsx`, `app/user/[username]/loadout/page.tsx`, `app/user/[username]/page.tsx`, `app/user/[username]/ratings_reviews/page.tsx`, `app/components/lists/AddToListFromListButton.tsx` (server-called functions only — its `searchGamesByName` call stays untouched, see below)
- **Not modified:** `app/components/util/SearchableDropdown.tsx`, `app/components/game/FavoriteGamePicker.tsx` — both call only functions that stay on `supabase-js`

**Interfaces:**
- Consumes: `db` from `lib/db.ts`
- Produces: `getGameBySlug(slug)`, `getGameTaxonomy(gameId)`, `searchGamesByName(db, query, limit?)` **(unchanged signature — stays on supabase-js)**, `getDeveloperNameMap(gameIds)`, `queryGames(params)`, `getAllGenres()`, `getAllPlatforms()`, `getDistinctEsrbRatings()`, `getGamesFromSteamIds(gameIds)`. `searchTaxonomyTable(supabase, table, query, limitToIds?)` and `getTaxonomyNameBySlug(supabase, table, slug)` are unchanged.

- [ ] **Step 1: Write the full converted `lib/queries/game.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { sql, eq, ilike, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { games, gameGenres, gamePlatforms, gameDevelopers, gamePublishers, genres, platforms, developers, publishers } from '@/db/schema'
import { Game, GameData } from '@/types'

export async function getGameBySlug(slug: string) {
    const rows = await db
        .select({
            id: games.id,
            created_at: games.createdAt,
            rawg_id: games.rawgId,
            name: games.name,
            slug: games.slug,
            cover_image_url: games.coverImageUrl,
            released: games.released,
            metacritic_score: games.metacriticScore,
            description: games.description,
            esrb_rating: games.esrbRating,
            reddit_url: games.redditUrl,
            screenshots: games.screenshots,
            steam_appid: games.steamAppid,
        })
        .from(games)
        .where(eq(games.slug, slug))
        .limit(1)

    return rows[0] ?? null
}

export async function getGameTaxonomy(gameId: string) {
    const [genreRows, platformRows, developerRows, publisherRows] = await Promise.all([
        db.select({ id: genres.id, name: genres.name, slug: genres.slug })
            .from(gameGenres)
            .innerJoin(genres, eq(gameGenres.genreId, genres.id))
            .where(eq(gameGenres.gameId, gameId)),
        db.select({ id: platforms.id, name: platforms.name, slug: platforms.slug })
            .from(gamePlatforms)
            .innerJoin(platforms, eq(gamePlatforms.platformId, platforms.id))
            .where(eq(gamePlatforms.gameId, gameId)),
        db.select({ id: developers.id, name: developers.name, slug: developers.slug })
            .from(gameDevelopers)
            .innerJoin(developers, eq(gameDevelopers.developerId, developers.id))
            .where(eq(gameDevelopers.gameId, gameId)),
        db.select({ id: publishers.id, name: publishers.name, slug: publishers.slug })
            .from(gamePublishers)
            .innerJoin(publishers, eq(gamePublishers.publisherId, publishers.id))
            .where(eq(gamePublishers.gameId, gameId)),
    ])

    return {
        genres: genreRows,
        platforms: platformRows,
        developers: developerRows,
        publishers: publisherRows,
    }
}

// Unchanged — called client-side (FavoriteGamePicker.tsx, AddToListFromListButton.tsx),
// a public unauthenticated search with no mutation risk. Stays on supabase-js.
export async function searchGamesByName(supabase: SupabaseClient, query: string, limit = 20): Promise<Game[]> {
    const { data } = await supabase
        .from('games')
        .select('id, name, slug, cover_image_url, metacritic_score, released')
        .ilike('name', `%${query}%`)
        .limit(limit)

    return data ?? []
}

// Maps game_id -> developer name for a set of games. Chunked — a large
// library/catalog can push the filter past a query-size limit.
export async function getDeveloperNameMap(gameIds: (string | number)[]): Promise<Map<string, string | null>> {
    const CHUNK_SIZE = 100
    const map = new Map<string, string | null>()

    for (let i = 0; i < gameIds.length; i += CHUNK_SIZE) {
        const chunk = gameIds.slice(i, i + CHUNK_SIZE).map(String)
        try {
            const rows = await db
                .select({ game_id: gameDevelopers.gameId, name: developers.name })
                .from(gameDevelopers)
                .innerJoin(developers, eq(gameDevelopers.developerId, developers.id))
                .where(inArray(gameDevelopers.gameId, chunk))

            for (const d of rows) {
                if (!map.has(String(d.game_id))) map.set(String(d.game_id), d.name ?? null)
            }
        } catch (error) {
            console.error('Failed to fetch developer names:', error)
            continue
        }
    }

    return map
}

type QueryGamesParams = {
    q?: string | null
    genre?: string | null
    platform?: string | null
    developer?: string | null
    publisher?: string | null
    esrb?: string | null
    sort?: string
    order?: string
    limit?: number
    offset?: number
    userId?: string | null
    gameIds?: (string | number)[] | null
}

export async function queryGames(params: QueryGamesParams): Promise<GameData[]> {
    const rows = await db.execute(sql`
        select * from query_games(
            p_q => ${params.q ?? null},
            p_genre => ${params.genre ?? null},
            p_platform => ${params.platform ?? null},
            p_developer => ${params.developer ?? null},
            p_publisher => ${params.publisher ?? null},
            p_esrb => ${params.esrb ?? null},
            p_sort => ${params.sort ?? 'metacritic_score'},
            p_order => ${params.order ?? 'desc'},
            p_limit => ${params.limit ?? 10},
            p_offset => ${params.offset ?? 0},
            p_user_id => ${params.userId ?? null},
            p_game_ids => ${params.gameIds ?? null}
        )
    `)

    return rows as unknown as GameData[]
}

export async function getAllGenres() {
    return db.select({ id: genres.id, name: genres.name, slug: genres.slug }).from(genres)
}

export async function getAllPlatforms() {
    return db.select({ id: platforms.id, name: platforms.name, slug: platforms.slug }).from(platforms)
}

export async function getDistinctEsrbRatings(): Promise<string[]> {
    const rows = await db.select({ esrb_rating: games.esrbRating }).from(games)
    return [...new Set(rows.map(row => row.esrb_rating))].filter((rating): rating is string => rating !== null).sort()
}

type TaxonomyTable = 'developers' | 'publishers'

// Unchanged — called from SearchableDropdown.tsx ('use client'), stays on supabase-js.
export async function searchTaxonomyTable(supabase: SupabaseClient, table: TaxonomyTable, query: string, limitToIds?: string[]) {
    let q = supabase
        .from(table)
        .select('id, name, slug')
        .ilike('name', `%${query}%`)
        .order('name')
        .limit(20)

    if (limitToIds && limitToIds.length > 0) {
        q = q.in('id', limitToIds)
    }

    const { data } = await q
    return data ?? []
}

// Unchanged — called from SearchableDropdown.tsx ('use client'), stays on supabase-js.
export async function getTaxonomyNameBySlug(supabase: SupabaseClient, table: TaxonomyTable, slug: string) {
    const { data } = await supabase
        .from(table)
        .select('name')
        .eq('slug', slug)
        .single()

    return data?.name ?? ''
}

export async function getGamesFromSteamIds(gameIds: number[]) {
    if (gameIds.length === 0) return []

    const CHUNK_SIZE = 100
    const results: { id: string, name: string, slug: string, cover_image_url: string | null, released: string | null, steam_appid: number }[] = []

    for (let i = 0; i < gameIds.length; i += CHUNK_SIZE) {
        const chunk = gameIds.slice(i, i + CHUNK_SIZE)
        try {
            const rows = await db
                .select({
                    id: games.id,
                    name: games.name,
                    slug: games.slug,
                    cover_image_url: games.coverImageUrl,
                    released: games.released,
                    steam_appid: games.steamAppid,
                })
                .from(games)
                .where(inArray(games.steamAppid, chunk))

            results.push(...(rows as unknown as typeof results))
        } catch (error) {
            console.error('Failed to fetch games by steam appid:', error)
            throw error
        }
    }

    return results
}
```

- [ ] **Step 2: Update `test/lib/queries.game.test.ts` to mock the `db` module instead of a client param**

`getGameTaxonomy`/`getDistinctEsrbRatings`/`getDeveloperNameMap` no longer take a client argument — they import `db` from `@/lib/db` at module scope, so the test mocks that module with `vi.mock`.

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockDb = { select: vi.fn() }
vi.mock('@/lib/db', () => ({ db: mockDb }))

const { getGameTaxonomy, getDistinctEsrbRatings, getDeveloperNameMap } = await import('@/lib/queries/game')

// Most of lib/queries/* is a thin pass-through to Drizzle and not worth
// pinning. These three do real work on the result set — de-duping + sorting,
// building a first-wins map, tolerating missing joins — so they get covered.
// db (a DB boundary) is mocked with just the chain each function calls.

beforeEach(() => { mockDb.select.mockReset() })

describe('getGameTaxonomy', () => {
    it('returns joined rows per taxonomy and tolerates an empty section', async () => {
        const byCall = [
            [{ id: 'g1', name: 'RPG', slug: 'rpg' }],
            [{ id: 'p1', name: 'PC', slug: 'pc' }],
            [],
            [{ id: 'pub1', name: 'Larian', slug: 'larian' }],
        ]
        let call = 0
        mockDb.select.mockImplementation(() => ({
            from: () => ({ innerJoin: () => ({ where: async () => byCall[call++] }) }),
        }))

        const taxonomy = await getGameTaxonomy('game-1')

        expect(taxonomy).toEqual({
            genres: [{ id: 'g1', name: 'RPG', slug: 'rpg' }],
            platforms: [{ id: 'p1', name: 'PC', slug: 'pc' }],
            developers: [],
            publishers: [{ id: 'pub1', name: 'Larian', slug: 'larian' }],
        })
    })
})

describe('getDistinctEsrbRatings', () => {
    it('de-duplicates, drops nulls, and sorts alphabetically', async () => {
        mockDb.select.mockImplementation(() => ({
            from: async () => [
                { esrb_rating: 'Teen' },
                { esrb_rating: 'Mature' },
                { esrb_rating: 'Teen' },
                { esrb_rating: null },
                { esrb_rating: 'Everyone' },
            ],
        }))

        await expect(getDistinctEsrbRatings()).resolves.toEqual(['Everyone', 'Mature', 'Teen'])
    })

    it('returns an empty array when the query yields no rows', async () => {
        mockDb.select.mockImplementation(() => ({ from: async () => [] }))

        await expect(getDistinctEsrbRatings()).resolves.toEqual([])
    })
})

describe('getDeveloperNameMap', () => {
    function mockReturning(rows: unknown[]) {
        mockDb.select.mockImplementation(() => ({ from: () => ({ innerJoin: () => ({ where: async () => rows }) }) }))
    }

    it('maps game_id to developer name, keeping the first seen and normalising keys to strings', async () => {
        mockReturning([
            { game_id: 'a', name: 'Supergiant' },
            { game_id: 'a', name: 'Should Be Ignored' },
            { game_id: 3, name: 'Numeric Key Studio' },
            { game_id: 'b', name: null },
        ])

        const map = await getDeveloperNameMap(['a', 3, 'b'])

        expect(map.get('a')).toBe('Supergiant')
        expect(map.get('3')).toBe('Numeric Key Studio')
        expect(map.get('b')).toBeNull()
        expect(map.size).toBe(3)
    })

    it('logs and returns an empty map when the chunk query throws', async () => {
        mockDb.select.mockImplementation(() => ({ from: () => ({ innerJoin: () => ({ where: async () => { throw new Error('boom') } }) }) }))
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

        const map = await getDeveloperNameMap(['a'])

        expect(map.size).toBe(0)
        expect(errSpy).toHaveBeenCalled()
    })
})
```

- [ ] **Step 3: Run the test file**

Run: `npm test -- test/lib/queries.game.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 4: Update callers**

For each file in the Files list, find every call to `getGameBySlug`, `getGameTaxonomy`, `getDeveloperNameMap`, `queryGames`, `getAllGenres`, `getAllPlatforms`, `getDistinctEsrbRatings`, `getGamesFromSteamIds` and drop the `supabase` first argument (e.g. `getGameBySlug(supabase, slug)` → `getGameBySlug(slug)`). Remove `const supabase = await createClient()` and its import if nothing else in the file still needs a `supabase` client (i.e. it doesn't also call `getViewer` or another still-`supabase-js` function). `app/components/lists/AddToListFromListButton.tsx` calls `searchGamesByName` (stays unchanged) and `syncListGames` (handled in Task 9) — no change needed here in Task 2.

- [ ] **Step 5: Manual verification**

Run: `npm run dev`. Visit a game detail page, the games list, homepage, and a user's library/loadout/ratings pages. Confirm game names, covers, taxonomy tags, search/filter results render exactly as before.

- [ ] **Step 6: Run full test suite + typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add lib/queries/game.ts test/lib/queries.game.test.ts app/games app/page.tsx app/steamlink/page.tsx app/user/[username]/library/page.tsx "app/user/[username]/lists/[listId]/page.tsx" app/user/[username]/loadout/page.tsx "app/user/[username]/page.tsx" app/user/[username]/ratings_reviews/page.tsx
git commit -m "Convert lib/queries/game.ts to Drizzle"
```

---

### Task 3: Convert `lib/queries/explore.ts`

**Files:**
- Modify: `lib/queries/explore.ts`
- Modify (caller updates, drop `supabase` argument): `app/explore/page.tsx`, `app/page.tsx`

**Interfaces:**
- Consumes: `db` from `lib/db.ts`
- Produces: `getTrendingGames(viewerId, days)`, `getTrendingLists(viewerId, days)`, `getExploreRecommendations(viewerId)`

- [ ] **Step 1: Write the full converted `lib/queries/explore.ts`**

`p_limit` defaults the app never overrides: `get_trending_games`/`get_trending_lists` → `10`; `get_follow_recommendations` → `10`; `get_recommended_lists` → `5`; `get_who_to_follow` → `5`.

```ts
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { TrendingGame, TrendingList, RecommendedGame, RecommendedList, RecommendedUser } from '@/types'

export async function getTrendingGames(viewerId: string | null | undefined, days: number): Promise<TrendingGame[]> {
    const rows = await db.execute(sql`
        select * from get_trending_games(p_days => ${days}, p_limit => 10, p_user_id => ${viewerId ?? null})
    `)
    return rows as unknown as TrendingGame[]
}

export async function getTrendingLists(viewerId: string | null | undefined, days: number): Promise<TrendingList[]> {
    const rows = await db.execute(sql`
        select * from get_trending_lists(p_days => ${days}, p_limit => 10, p_user_id => ${viewerId ?? null})
    `)
    return rows as unknown as TrendingList[]
}

export async function getExploreRecommendations(viewerId: string | null | undefined) {
    const [gameRows, listRows, userRows] = await Promise.all([
        db.execute(sql`select * from get_follow_recommendations(p_user_id => ${viewerId ?? null}, p_limit => 10)`),
        db.execute(sql`select * from get_recommended_lists(p_user_id => ${viewerId ?? null}, p_limit => 5)`),
        db.execute(sql`select * from get_who_to_follow(p_user_id => ${viewerId ?? null}, p_limit => 5)`),
    ])

    return {
        games: gameRows as unknown as RecommendedGame[],
        lists: listRows as unknown as RecommendedList[],
        users: userRows as unknown as RecommendedUser[],
    }
}
```

- [ ] **Step 2: Update callers**

No dedicated test file (pure RPC pass-throughs, matches `test/README.md`'s "not worth pinning" category). In `app/explore/page.tsx` and `app/page.tsx`, drop the `supabase` argument from every call to `getTrendingGames`, `getTrendingLists`, `getExploreRecommendations`; remove `createClient()`/`supabase` if nothing else in the file needs it.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, visit `/explore` and the homepage. Confirm trending games/lists and the recommendations panel render with the same content as before.

- [ ] **Step 4: Run full test suite + typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add lib/queries/explore.ts app/explore/page.tsx app/page.tsx
git commit -m "Convert lib/queries/explore.ts to Drizzle"
```

---

### Task 4: Convert `lib/queries/stats.ts`

**Files:**
- Modify: `lib/queries/stats.ts`
- Modify (caller updates, drop `supabase` argument): `app/user/[username]/loadout/page.tsx`, `app/user/[username]/page.tsx`

**Interfaces:**
- Consumes: `db` from `lib/db.ts`
- Produces: `getLoadoutGenreStats(userId)`, `getLoadoutDeveloperStats(userId)`, `getLoadoutStatusBreakdown(userId)`, `getLoadoutRatingHighlights(userId)`

- [ ] **Step 1: Write the full converted `lib/queries/stats.ts`**

All four RPCs take only `p_user_id`.

```ts
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { GenreStatType, DeveloperStatType, StatusStatType, HighlightType } from '@/types'

export async function getLoadoutGenreStats(userId: string): Promise<GenreStatType[]> {
    const rows = await db.execute(sql`select * from get_loadout_genre_stats(p_user_id => ${userId})`)
    return rows as unknown as GenreStatType[]
}

export async function getLoadoutDeveloperStats(userId: string): Promise<DeveloperStatType[]> {
    const rows = await db.execute(sql`select * from get_loadout_developer_stats(p_user_id => ${userId})`)
    return rows as unknown as DeveloperStatType[]
}

export async function getLoadoutStatusBreakdown(userId: string): Promise<StatusStatType[]> {
    const rows = await db.execute(sql`select * from get_loadout_status_breakdown(p_user_id => ${userId})`)
    return rows as unknown as StatusStatType[]
}

export async function getLoadoutRatingHighlights(userId: string): Promise<HighlightType[]> {
    const rows = await db.execute(sql`select * from get_loadout_rating_highlights(p_user_id => ${userId})`)
    return rows as unknown as HighlightType[]
}
```

- [ ] **Step 2: Update callers**

No dedicated test file. Drop the `supabase` argument in `app/user/[username]/loadout/page.tsx` and `app/user/[username]/page.tsx`.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, visit a user's loadout page and profile page. Confirm genre/developer stat breakdowns, status breakdown, and rating highlights render as before.

- [ ] **Step 4: Run full test suite + typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add lib/queries/stats.ts app/user/[username]/loadout/page.tsx "app/user/[username]/page.tsx"
git commit -m "Convert lib/queries/stats.ts to Drizzle"
```

---

### Task 5: Convert `lib/queries/feed.ts`

**Files:**
- Modify: `lib/queries/feed.ts`
- Modify (caller updates): `app/feed-actions.ts`, `app/page.tsx`

**Interfaces:**
- Consumes: `db` from `lib/db.ts`
- Produces: `getFeed(userId, limit?, offset?)`, `FEED_PAGE_SIZE` (unchanged constant)

- [ ] **Step 1: Write the full converted `lib/queries/feed.ts`**

`get_feed`'s own SQL defaults are `p_limit DEFAULT 20, p_offset DEFAULT 0` — same values used here when the caller omits them.

```ts
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { FeedItem } from '@/types'

export const FEED_PAGE_SIZE = 12

export async function getFeed(
    userId: string | undefined,
    limit?: number,
    offset?: number,
): Promise<FeedItem[]> {
    const rows = await db.execute(sql`
        select * from get_feed(
            p_user_id => ${userId ?? null},
            p_limit => ${limit ?? 20},
            p_offset => ${offset ?? 0}
        )
    `)
    return rows as unknown as FeedItem[]
}
```

- [ ] **Step 2: Update `app/feed-actions.ts`**

`getViewer` stays on `supabase-js`, so `supabase`/`createClient` stay; only the `getFeed` call drops its argument:

```ts
'use server'

import { createClient } from '@/lib/supabase-server'
import { getViewer } from '@/lib/queries/user'
import { getFeed, FEED_PAGE_SIZE } from '@/lib/queries/feed'
import type { FeedItem } from '@/types'

/** Fetch the next page of the signed-in viewer's activity feed. */
export async function fetchFeedPage(offset: number): Promise<FeedItem[]> {
    const supabase = await createClient()
    const viewer = await getViewer(supabase)
    if (!viewer) return []
    return getFeed(viewer.id, FEED_PAGE_SIZE, offset)
}
```

Apply the equivalent change in `app/page.tsx` wherever it calls `getFeed`.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, sign in as a user who follows others with activity, load the homepage feed, scroll to trigger pagination. Confirm feed items and infinite-scroll pagination work identically to before.

- [ ] **Step 4: Run full test suite + typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add lib/queries/feed.ts app/feed-actions.ts app/page.tsx
git commit -m "Convert lib/queries/feed.ts to Drizzle"
```

---

### Task 6: Convert `lib/queries/steam.ts` + `unlinkSteamAccount` Server Action

**Files:**
- Modify: `lib/queries/steam.ts`
- Create: `app/steam-actions.ts`
- Modify: `app/components/settings/UnlinkSteamAccountButton.tsx`
- Modify (caller updates, drop `supabase` argument): `app/api/steam/callback/route.ts`, `app/settings/page.tsx`, `app/steamlink/page.tsx`

**Interfaces:**
- Consumes: `db` from `lib/db.ts`, `requireUser()` from `lib/auth.ts`
- Produces (query layer): `getSteamAccount(userId)`, `upsertSteamAccount(userId, steamId64)`, `unlinkSteamAccount(userId)`
- Produces (new Server Action, `app/steam-actions.ts`): `unlinkSteamAccountAction()` — derives `userId` via `requireUser()`

- [ ] **Step 1: Write the full converted `lib/queries/steam.ts`**

`steam_accounts.userId` is the table's primary key — the upsert's conflict target.

```ts
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { steamAccounts } from '@/db/schema'

export async function getSteamAccount(userId: string) {
    const rows = await db
        .select({
            steam_id: steamAccounts.steamId,
            linked_at: steamAccounts.linkedAt,
            last_synced_at: steamAccounts.lastSyncedAt,
            profile_public: steamAccounts.profilePublic,
        })
        .from(steamAccounts)
        .where(eq(steamAccounts.userId, userId))
        .limit(1)

    return rows[0] ?? null
}

export async function upsertSteamAccount(userId: string, steamId64: string) {
    try {
        const rows = await db
            .insert(steamAccounts)
            .values({ userId, steamId: steamId64, linkedAt: new Date().toISOString() })
            .onConflictDoUpdate({
                target: steamAccounts.userId,
                set: { steamId: steamId64, linkedAt: new Date().toISOString() },
            })
            .returning({ steam_id: steamAccounts.steamId, linked_at: steamAccounts.linkedAt })

        return { data: rows[0] ?? null, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function unlinkSteamAccount(userId: string) {
    try {
        await db.delete(steamAccounts).where(eq(steamAccounts.userId, userId))
    } catch (error) {
        console.error("Failed to unlink Steam account:", error)
        throw error
    }
}
```

- [ ] **Step 2: Create `app/steam-actions.ts`**

```ts
'use server'

import { requireUser } from '@/lib/auth'
import { unlinkSteamAccount } from '@/lib/queries/steam'

export async function unlinkSteamAccountAction() {
    const user = await requireUser()
    await unlinkSteamAccount(user.id)
}
```

- [ ] **Step 3: Update `app/components/settings/UnlinkSteamAccountButton.tsx`**

Before:

```tsx
import { createClient } from "@/lib/supabase-browser";
import { unlinkSteamAccount } from "@/lib/queries/steam";

export default function UnlinkSteamAccountButton({ userId } : { userId: string }) {
    // ...
    async function unlinkAccount() {
        const supabase = createClient()

        try {
            await unlinkSteamAccount(supabase, userId)
        } catch {
            setError(true)
            return
        }
        // ...
```

After:

```tsx
import { unlinkSteamAccountAction } from "@/app/steam-actions";

export default function UnlinkSteamAccountButton({ userId } : { userId: string }) {
    // ...
    async function unlinkAccount() {
        try {
            await unlinkSteamAccountAction()
        } catch {
            setError(true)
            return
        }
        // ...
```

Remove the now-unused `userId` prop usage in the deleted call (the prop itself may still be needed if used elsewhere in the component — check before removing the prop type; if it's now fully unused, remove it and its caller's pass-through).

- [ ] **Step 4: Update remaining callers**

Drop the `supabase` argument from `getSteamAccount`/`upsertSteamAccount` calls in `app/api/steam/callback/route.ts`, `app/settings/page.tsx`, `app/steamlink/page.tsx`.

- [ ] **Step 5: Manual verification**

Run: `npm run dev`. Go through `/steamlink`, link a Steam account, confirm it shows as linked on `/settings`, then unlink it via the button and confirm it clears. Check the Steam OAuth callback flow completes without error.

- [ ] **Step 6: Run full test suite + typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add lib/queries/steam.ts app/steam-actions.ts app/components/settings/UnlinkSteamAccountButton.tsx app/api/steam/callback/route.ts app/settings/page.tsx app/steamlink/page.tsx
git commit -m "Convert lib/queries/steam.ts to Drizzle, move Steam unlink to a Server Action"
```

---

### Task 7: Convert `lib/queries/library.ts` + `app/library-actions.ts`

**Files:**
- Modify: `lib/queries/library.ts`
- Create: `app/library-actions.ts`
- Modify: `app/components/library/LibraryButton.tsx`
- Modify: `app/components/settings/SteamLinkGamesSection.tsx`
- Modify (caller updates, drop `supabase` argument): server-side callers of `getLibraryEntries`, `getLibraryFacets`, `getLibraryStatusBreakdown` — check `app/user/[username]/library/page.tsx`

**Interfaces:**
- Consumes: `db` from `lib/db.ts`, `requireUser()` from `lib/auth.ts`
- Produces (query layer): `getLibraryEntry(userId, gameId)`, `createLibraryEntry(userId, gameId, fields)`, `updateLibraryEntry(userId, gameId, fields)`, `upsertLibraryEntries(userId, entries)`, `deleteLibraryEntry(entryId)`, `getLibraryEntries(userId, filter)`, `getLibraryFacets(userId)`, `getLibraryStatusBreakdown(userId)`
- Produces (`app/library-actions.ts`): `fetchLibraryEntry(gameId)`, `addOrUpdateLibraryEntry(gameId, fields)`, `removeLibraryEntry(entryId)`, `importSteamLibraryEntries(entries)` — all derive `userId` via `requireUser()`

- [ ] **Step 1: Write the full converted `lib/queries/library.ts`**

```ts
import { eq, and, desc, asc, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { libraryEntries } from '@/db/schema'
import { LibraryData, EsrbRatingsData } from '@/types'
import { SteamLinkEntry } from '@/types'

const LIBRARY_ENTRY_COLUMNS = {
    id: libraryEntries.id,
    status: libraryEntries.status,
    completed_all_achievements: libraryEntries.completedAllAchievements,
    hours_played: libraryEntries.hoursPlayed,
    play_count: libraryEntries.playCount,
}

export async function getLibraryEntry(userId: string, gameId: string | number) {
    const rows = await db
        .select(LIBRARY_ENTRY_COLUMNS)
        .from(libraryEntries)
        .where(and(eq(libraryEntries.userId, userId), eq(libraryEntries.gameId, String(gameId))))
        .limit(1)

    return rows[0] ?? null
}

type LibraryEntryFields = {
    status: string
    is100: boolean
    hours: number | null
    playedCount: number
}

export async function createLibraryEntry(userId: string, gameId: number, fields: LibraryEntryFields) {
    const rows = await db
        .insert(libraryEntries)
        .values({
            userId,
            gameId: String(gameId),
            status: fields.status,
            completedAllAchievements: fields.is100,
            hoursPlayed: fields.hours != null ? String(fields.hours) : null,
            playCount: fields.playedCount,
        })
        .returning(LIBRARY_ENTRY_COLUMNS)

    return rows[0] ?? null
}

export async function updateLibraryEntry(userId: string, gameId: number, fields: LibraryEntryFields) {
    const rows = await db
        .update(libraryEntries)
        .set({
            status: fields.status,
            completedAllAchievements: fields.is100,
            hoursPlayed: fields.hours != null ? String(fields.hours) : null,
            playCount: fields.playedCount,
        })
        .where(and(eq(libraryEntries.userId, userId), eq(libraryEntries.gameId, String(gameId))))
        .returning(LIBRARY_ENTRY_COLUMNS)

    return rows[0] ?? null
}

export async function upsertLibraryEntries(userId: string, entries: SteamLinkEntry[]) {
    const toUpsert = entries.map(sle => ({
        userId,
        gameId: String(sle.gameId),
        status: sle.status,
        hoursPlayed: sle.playtimeSelected != null ? String(sle.playtimeSelected) : null,
        playCount: sle.timesPlayed ?? 0,
        completedAllAchievements: sle.completedAllAchievements,
    }))

    try {
        return await db
            .insert(libraryEntries)
            .values(toUpsert)
            .onConflictDoUpdate({
                target: [libraryEntries.userId, libraryEntries.gameId],
                set: {
                    status: sql`excluded.status`,
                    hoursPlayed: sql`excluded.hours_played`,
                    playCount: sql`excluded.play_count`,
                    completedAllAchievements: sql`excluded.completed_all_achievements`,
                },
            })
            .returning(LIBRARY_ENTRY_COLUMNS)
    } catch (error) {
        console.error("Failed to import library entries from Steam:", error)
        throw error
    }
}

export async function deleteLibraryEntry(entryId: string) {
    await db.delete(libraryEntries).where(eq(libraryEntries.id, entryId))
}

type LibraryEntriesFilter = {
    status?: string
    is100?: boolean
    sort?: string
    order?: string
}

export async function getLibraryEntries(userId: string, filter: LibraryEntriesFilter) {
    const conditions = [eq(libraryEntries.userId, userId)]
    if (filter.status) conditions.push(eq(libraryEntries.status, filter.status))
    if (filter.is100) conditions.push(eq(libraryEntries.completedAllAchievements, true))

    let query = db
        .select({
            game_id: libraryEntries.gameId,
            status: libraryEntries.status,
            created_at: libraryEntries.createdAt,
            completed_all_achievements: libraryEntries.completedAllAchievements,
            hours_played: libraryEntries.hoursPlayed,
            play_count: libraryEntries.playCount,
        })
        .from(libraryEntries)
        .where(and(...conditions))
        .$dynamic()

    if (filter.sort === 'date_added') {
        query = query.orderBy(filter.order === 'asc' ? asc(libraryEntries.createdAt) : desc(libraryEntries.createdAt))
    }

    return query
}

export async function getLibraryFacets(userId: string) {
    const [genresRows, platformsRows, developersRows, publishersRows, esrbRows] = await Promise.all([
        db.execute(sql`select * from get_library_genres(p_user_id => ${userId})`),
        db.execute(sql`select * from get_library_platforms(p_user_id => ${userId})`),
        db.execute(sql`select * from get_library_developers(p_user_id => ${userId})`),
        db.execute(sql`select * from get_library_publishers(p_user_id => ${userId})`),
        db.execute(sql`select * from get_library_esrb_ratings(p_user_id => ${userId})`),
    ])

    return {
        genres: genresRows as unknown as LibraryData[],
        platforms: platformsRows as unknown as LibraryData[],
        developers: developersRows as unknown as LibraryData[],
        publishers: publishersRows as unknown as LibraryData[],
        esrbRatings: (esrbRows as unknown as EsrbRatingsData[]).map(r => r.esrb_rating),
    }
}

export async function getLibraryStatusBreakdown(userId: string) {
    const rows = await db
        .select({ status: libraryEntries.status })
        .from(libraryEntries)
        .where(eq(libraryEntries.userId, userId))

    return { entries: rows, totalCount: rows.length }
}
```

Note: `hours_played` is a Postgres `numeric` column, represented as a JS `string` by the `postgres-js` driver (avoids float-precision loss) — this matches what the original `supabase-js` client also returned, not a behavior change.

- [ ] **Step 2: Create `app/library-actions.ts`**

```ts
'use server'

import { requireUser } from '@/lib/auth'
import { createLibraryEntry, updateLibraryEntry, deleteLibraryEntry, getLibraryEntry, upsertLibraryEntries } from '@/lib/queries/library'
import type { SteamLinkEntry } from '@/types'

type LibraryEntryFields = {
    status: string
    is100: boolean
    hours: number | null
    playedCount: number
}

export async function fetchLibraryEntry(gameId: number) {
    const user = await requireUser().catch(() => null)
    if (!user) return null
    return getLibraryEntry(user.id, gameId)
}

export async function addOrUpdateLibraryEntry(gameId: number, fields: LibraryEntryFields) {
    const user = await requireUser()
    const existing = await getLibraryEntry(user.id, gameId)
    return existing
        ? updateLibraryEntry(user.id, gameId, fields)
        : createLibraryEntry(user.id, gameId, fields)
}

export async function removeLibraryEntry(entryId: string) {
    await requireUser()
    await deleteLibraryEntry(entryId)
}

export async function importSteamLibraryEntries(entries: SteamLinkEntry[]) {
    const user = await requireUser()
    return upsertLibraryEntries(user.id, entries)
}
```

(`removeLibraryEntry` re-verifies the caller is authenticated but doesn't check the entry belongs to them — matching today's behavior exactly, where `deleteLibraryEntry(supabase, entryId)` had no ownership check either, relying on RLS's `USING (auth.uid() = user_id)` policy, which is unchanged and still enforced for any direct Postgres access outside this Server Action.)

- [ ] **Step 3: Update `app/components/library/LibraryButton.tsx`**

```tsx
'use client'

import { useState, useEffect } from "react"
import AuthModal from "@/app/components/user/AuthModal"
import { useUser } from "@/app/components/user/UserContext"
import { useRouter } from "next/navigation"
import Modal from "@/app/components/util/Modal"
import { addOrUpdateLibraryEntry, removeLibraryEntry, fetchLibraryEntry } from "@/app/library-actions"
import { plus1 } from "@/lib/plus1"

export default function LibraryButton({ game_id }: { game_id: number }) {
    const { user } = useUser()
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
    const [isLibraryModalOpen, setIsLibraryModalOpen] = useState(false)
    const [libraryEntry, setLibraryEntry] = useState<{ id: string, status: string } | null>(null)
    const [currentStatus, setStatus] = useState<string>("")
    const [advancedOptionsOpen, setAdvancedOptionsOpen] = useState(false)
    const [is100, setIs100] = useState(false)
    const [hours, setHours] = useState<number | null>(null)
    const [playedCount, setPlayedCount] = useState(1)
    const router = useRouter()

    useEffect(() => {

        async function checkEntry() {
            if (!user) return

            const data = await fetchLibraryEntry(game_id)

            setLibraryEntry(data ?? null)
            setStatus(data?.status ?? "")
            setIs100(data?.completed_all_achievements ?? false)
            setHours(data?.hours_played ?? 0)
            setPlayedCount(data?.play_count ?? 1)
        }

        if (user) checkEntry()
    }, [user, game_id])

    async function addToLibrary() {
        if (!user) return

        const fields = { status: currentStatus, is100, hours, playedCount }

        const wasNew = !libraryEntry
        const prevStatus = libraryEntry?.status

        const data = await addOrUpdateLibraryEntry(game_id, fields)

        setLibraryEntry(data)
        setStatus(data?.status ?? "")
        setIs100(data?.completed_all_achievements ?? false)
        setHours(data?.hours_played ?? 0)
        setPlayedCount(data?.play_count ?? 1)

        setIsLibraryModalOpen(false)

        // +1 fires on a new entry, or when an existing one first reaches "completed"
        if (wasNew) {
            plus1(data?.status === "completed" ? "COMPLETED" : "SAVED")
        } else if (data?.status === "completed" && prevStatus !== "completed") {
            plus1("COMPLETED")
        }

        router.refresh()
    }

    async function removeFromLibrary() {
        if (!user || !libraryEntry) return

        await removeLibraryEntry(libraryEntry.id)

        setLibraryEntry(null)
        setIsLibraryModalOpen(false)
        router.refresh()
    }

    return (
        <div>
            { user == null ? (
                <button onClick={() => setIsAuthModalOpen(true)} className="px-4 py-1.5 rounded-[4px] font-mono text-[0.7rem] uppercase tracking-[0.14em] font-semibold border-2 border-(--color-accent) text-(--color-accent) hover:bg-(--color-accent) hover:text-(--color-bg) transition-colors duration-200">
                    + Save Game
                </button>
            ) : libraryEntry == null ? (
                <button onClick={() => setIsLibraryModalOpen(true)} className="px-4 py-1.5 rounded-[4px] font-mono text-[0.7rem] uppercase tracking-[0.14em] font-semibold border-2 border-(--color-accent) text-(--color-accent) hover:bg-(--color-accent) hover:text-(--color-bg) transition-colors duration-200">
                    + Save Game
                </button>
            ) : <div className="group">
                    <button onClick={() => setIsLibraryModalOpen(true)} className="w-36 px-4 py-1.5 rounded-[4px] font-mono text-[0.7rem] uppercase tracking-[0.14em] font-semibold border-2 border-(--color-border) text-(--color-text) transition-colors duration-200 group-hover:border-(--color-bad) group-hover:text-(--color-bad)">
                        <span className="group-hover:hidden">
                            {libraryEntry.status.charAt(0).toUpperCase() + libraryEntry.status.slice(1)}
                        </span>
                        <span className="hidden group-hover:inline">
                            Manage
                        </span>
                    </button>
                </div>
            }
            {isAuthModalOpen && (
                <AuthModal isOpen={true} defaultTab={"signin"} onClose={() => setIsAuthModalOpen(false)}></AuthModal>
            )}
            {isLibraryModalOpen && (
                <Modal onClose={() => setIsLibraryModalOpen(false)} title={libraryEntry ? "Manage Game" : "Add to Library"}>
                        <div className="grid grid-cols-2 gap-4 items-center">
                        {[
                        { status: 'backlog', icon: '📚', label: 'Backlog', description: "I'll get to it..." },
                        { status: 'playing', icon: '▶', label: 'Playing', description: 'Currently playing it' },
                        { status: 'completed', icon: '✓', label: 'Completed', description: 'Done and satisfied' },
                        { status: 'abandoned', icon: '✕', label: 'Abandoned', description: "Couldn't get into it" },
                        ].map(({ status, icon, label, description }) => (
                        <button
                            key={status}
                            onClick={() => setStatus(status)}
                            className={`w-full flex items-center gap-4 px-4 py-3 rounded-[3px]
                            border border-(--color-border) hover:border-(--color-accent) hover:bg-(--color-accent)/5
                            transition-all duration-200 group text-left ${status === currentStatus && "border-(--color-accent) bg-(--color-accent)/5"}`}
                        >
                            <span className="text-lg w-6 text-center shrink-0">{icon}</span>
                            <div className="flex flex-col">
                            <span className="text-sm font-semibold text-(--color-text) 
                                group-hover:text-(--color-accent) transition-colors duration-200
                                font-(family-name:--font-display)">
                                {label}
                            </span>
                            <span className="text-xs text-(--color-muted)">{description}</span>
                            </div>
                        </button>
                        ))}
                        </div>
                        <button onClick={() => addToLibrary()} className="w-full rounded-[3px] bg-(--color-accent) text-(--color-bg) border mt-3 my-2 py-4">
                            {libraryEntry ? "Update Library Entry" : "Add to Library"}
                        </button>
                        {libraryEntry && 
                            <button onClick={() => removeFromLibrary()} className="w-full rounded-[3px] bg-(--color-bad) text-(--color-text) border border-(--color-bad-hover) my-2 py-4">
                                Remove From Library
                            </button>
                        }
                        <button
                            onClick={() => setAdvancedOptionsOpen(!advancedOptionsOpen)}
                            className="self-center justify-self-center bg-(--color-surface) text-(--color-text) placeholder:text-(--color-muted) border border-(--color-border) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent) focus-visible:border-(--color-accent) rounded-[3px] my-2 px-4 py-2 whitespace-nowrap"
                        >
                            {advancedOptionsOpen ? '- Advanced Options' : '+ Advanced Options'}
                        </button>
                        {advancedOptionsOpen && (
                            <div className="flex flex-wrap flex-row gap-4 mb-4 mt-2">
                                <button
                                    type="button"
                                    onClick={() => setIs100(!is100)}
                                    className="flex items-center gap-3 text-left"
                                >
                                    <div className={`w-5 h-5 rounded-[3px] border-2 flex items-center justify-center
                                        transition-all duration-200 shrink-0
                                        ${is100 
                                        ? 'bg-(--color-accent) border-(--color-accent)' 
                                        : 'bg-transparent border-(--color-border) hover:border-(--color-accent)'}`}
                                    >
                                        {is100 && (
                                            <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                                                <path d="M1 4L3.5 6.5L9 1" stroke="var(--color-bg)" strokeWidth="2" 
                                                strokeLinecap="round" strokeLinejoin="round"/>
                                            </svg>
                                        )}
                                    </div>
                                    <span className="text-sm font-semibold text-(--color-text)">100% Achievements Completed</span>
                                </button>
                                <div className="flex gap-6 items-center justify-around w-full">
                                    <div className="flex flex-col gap-1">
                                        <label className="text-xs font-semibold text-(--color-muted) uppercase tracking-wider">
                                            Hours Played
                                        </label>
                                        <div className="flex items-center gap-2 bg-(--color-surface) border border-(--color-border) 
                                            rounded-[3px] px-3 py-2 focus-within:border-(--color-accent) transition-colors duration-200 w-32">
                                            <input
                                                type="number"
                                                min="0"
                                                max="99999"
                                                step="0.5"
                                                value={hours ?? ''}
                                                onChange={e => setHours(e.target.value === '' ? null : Number(e.target.value))}
                                                placeholder="0"
                                                className="bg-transparent text-(--color-text) text-sm w-full outline-none
                                                    [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none 
                                                    [&::-webkit-inner-spin-button]:appearance-none"
                                            />
                                            <span className="text-xs text-(--color-muted) shrink-0">hrs</span>
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <label className="text-xs font-semibold text-(--color-muted) uppercase tracking-wider">
                                            Times Played
                                        </label>
                                        <div className="flex items-center border border-(--color-border) rounded-[3px] 
                                            overflow-hidden focus-within:border-(--color-accent) transition-colors duration-200">
                                            <button
                                                type="button"
                                                onClick={() => setPlayedCount(Math.max(1, (playedCount ?? 1) - 1))}
                                                className="px-3 py-2 bg-(--color-surface-light) text-(--color-muted) hover:text-(--color-text) 
                                                    hover:bg-(--color-border) transition-colors duration-200 text-sm font-bold"
                                            >
                                                −
                                            </button>
                                            <input
                                                type="number"
                                                min="1"
                                                max="99"
                                                value={playedCount ?? 1}
                                                onChange={e => setPlayedCount(Math.max(1, Number(e.target.value)))}
                                                className="bg-(--color-surface) text-(--color-text) text-sm text-center w-12 py-2 outline-none
                                                    [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none 
                                                    [&::-webkit-inner-spin-button]:appearance-none"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setPlayedCount((playedCount ?? 1) + 1)}
                                                className="px-3 py-2 bg-(--color-surface-light) text-(--color-muted) hover:text-(--color-text)
                                                    hover:bg-(--color-border) transition-colors duration-200 text-sm font-bold"
                                            >
                                                +
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                </Modal>
            )}
        </div>
    )
}
```

- [ ] **Step 4: Update `app/components/settings/SteamLinkGamesSection.tsx`**

Before:

```tsx
import { upsertLibraryEntries } from "@/lib/queries/library";
import { createClient } from "@/lib/supabase-browser";
// ...
    async function importGames(userId: string) {
        setIsImporting(true)
        setError(null)

        try {
            const supabase = createClient()
            await upsertLibraryEntries(supabase, userId, Array.from(entries.values()).filter(sle => sle.selected))
            router.push("/settings")
        } catch {
            setError("Something went wrong importing your games. Please try again.")
            setIsImporting(false)
        }
    }
```

After:

```tsx
import { importSteamLibraryEntries } from "@/app/library-actions";
// ...
    async function importGames() {
        setIsImporting(true)
        setError(null)

        try {
            await importSteamLibraryEntries(Array.from(entries.values()).filter(sle => sle.selected))
            router.push("/settings")
        } catch {
            setError("Something went wrong importing your games. Please try again.")
            setIsImporting(false)
        }
    }
```

And update the button's `onClick={() => importGames(userId)}` to `onClick={() => importGames()}` (the `userId` prop may now be entirely unused in this component — check and remove it and its caller's pass-through if so).

- [ ] **Step 5: Update remaining server-side callers**

Check `app/user/[username]/library/page.tsx` for calls to `getLibraryEntries`, `getLibraryFacets`, or `getLibraryStatusBreakdown`; drop the `supabase` argument from any found.

- [ ] **Step 6: Manual verification**

Run: `npm run dev`. On a game page, use the Library button to add a game, toggle 100% achievements, set hours/times played, update the entry, then remove it. Confirm the button's state updates correctly at each step. Visit a user's library page and confirm entries, facets, and the status breakdown chart render correctly. Go through the Steam library import flow end to end.

- [ ] **Step 7: Run full test suite + typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all PASS, no type errors.

- [ ] **Step 8: Commit**

```bash
git add lib/queries/library.ts app/library-actions.ts app/components/library/LibraryButton.tsx app/components/settings/SteamLinkGamesSection.tsx "app/user/[username]/library/page.tsx"
git commit -m "Convert lib/queries/library.ts to Drizzle, move library mutations to Server Actions"
```

---

### Task 8: Convert `lib/queries/review.ts` + `app/review-actions.ts`

**Files:**
- Modify: `lib/queries/review.ts`
- Create: `app/review-actions.ts`
- Modify: `app/components/game/RateReviewButton.tsx`
- Modify (caller updates, drop `supabase` argument): `app/games/[slug]/page.tsx`, `app/user/[username]/ratings_reviews/page.tsx`, `app/user/[username]/loadout/page.tsx`, `app/user/[username]/page.tsx`, `app/page.tsx`

**Interfaces:**
- Consumes: `db` from `lib/db.ts`, `requireUser()` from `lib/auth.ts`
- Produces (query layer): `getGameRatingsStats(gameId)`, `getUserRatingReviewForGame(gameId, userId)`, `getGameReviewsForPage(gameId, params)`, `createRatingReview({userId, gameId, rating, review})`, `updateRatingReview({userId, gameId, rating, review})`, `getUserRatings(userId)`, `getAvgRatingsForGames(gameIds)`, `getUserRatingsForGames(userId, gameIds)`, `getUserRatingsReviewsPage(params)`, `getUserRatingsReviewsCounts(userId?)`, `getRecentReviewsGlobal(limit?)`, `getRecentReviews(userId, limit?)`
- Produces (`app/review-actions.ts`): `submitRatingReview(gameId, rating, review, isUpdate)` — derives `userId` via `requireUser()`

- [ ] **Step 1: Write the full converted `lib/queries/review.ts`**

```ts
import { eq, and, ne, desc, asc, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { ratingsReviews, users, games } from '@/db/schema'
import { GameRatingReview, RatingReviewData, RatingReviewCounts, AvgRatingsData, GameRatingsStats } from '@/types'
import { ratingReviewSchema, parseOrError } from '@/lib/schemas'

export async function getGameRatingsStats(gameId: string): Promise<GameRatingsStats> {
    const rows = await db.execute(sql`select * from get_game_ratings_stats(p_game_id => ${gameId})`)
    return (rows[0] as unknown as GameRatingsStats) ?? {
        total_ratings: 0, total_reviews: 0, avg_rating: null,
        rating_1: 0, rating_2: 0, rating_3: 0, rating_4: 0, rating_5: 0,
        rating_6: 0, rating_7: 0, rating_8: 0, rating_9: 0, rating_10: 0,
    }
}

export async function getUserRatingReviewForGame(gameId: string, userId: string) {
    const rows = await db
        .select({
            user_id: ratingsReviews.userId,
            rating: ratingsReviews.rating,
            review: ratingsReviews.review,
            created_at: ratingsReviews.createdAt,
            updated_at: ratingsReviews.updatedAt,
            users: { username: users.username, display_name: users.displayName, avatar_url: users.avatarUrl },
        })
        .from(ratingsReviews)
        .innerJoin(users, eq(ratingsReviews.userId, users.id))
        .where(and(eq(ratingsReviews.gameId, gameId), eq(ratingsReviews.userId, userId)))
        .limit(1)

    return (rows[0] as unknown as GameRatingReview) ?? null
}

type GameReviewsPageParams = {
    limit: number
    offset: number
    sort: "date" | "rating"
    order: "asc" | "desc"
    excludeUserId?: string
}

export async function getGameReviewsForPage(gameId: string, { limit, offset, sort, order, excludeUserId }: GameReviewsPageParams) {
    const conditions = [eq(ratingsReviews.gameId, gameId), ne(ratingsReviews.review, '')]
    if (excludeUserId) conditions.push(ne(ratingsReviews.userId, excludeUserId))

    const sortColumn = sort === "rating" ? ratingsReviews.rating : ratingsReviews.updatedAt
    const orderFn = order === "asc" ? asc : desc

    const [rows, countRows] = await Promise.all([
        db
            .select({
                user_id: ratingsReviews.userId,
                rating: ratingsReviews.rating,
                review: ratingsReviews.review,
                created_at: ratingsReviews.createdAt,
                updated_at: ratingsReviews.updatedAt,
                users: { username: users.username, display_name: users.displayName, avatar_url: users.avatarUrl },
            })
            .from(ratingsReviews)
            .innerJoin(users, eq(ratingsReviews.userId, users.id))
            .where(and(...conditions))
            .orderBy(orderFn(sortColumn))
            .limit(limit)
            .offset(offset),
        db.select({ count: sql<number>`count(*)::int` }).from(ratingsReviews).where(and(...conditions)),
    ])

    return { reviews: rows as unknown as GameRatingReview[], count: countRows[0]?.count ?? 0 }
}

export async function createRatingReview({ userId, gameId, rating, review }: { userId: string, gameId: string, rating: number | string, review: string }) {
    const parsed = parseOrError(ratingReviewSchema, { rating, review })
    if (!parsed.success) return { data: null, error: parsed.error }

    try {
        const rows = await db
            .insert(ratingsReviews)
            .values({ userId, gameId, rating: parsed.data.rating, review: parsed.data.review })
            .returning({
                rating: ratingsReviews.rating,
                review: ratingsReviews.review,
                user_id: ratingsReviews.userId,
                created_at: ratingsReviews.createdAt,
                updated_at: ratingsReviews.updatedAt,
            })

        return { data: rows[0], error: null }
    } catch (error) {
        return { data: null, error: error instanceof Error ? error.message : String(error) }
    }
}

export async function updateRatingReview({ userId, gameId, rating, review }: { userId: string, gameId: string, rating: number | string, review: string }) {
    const parsed = parseOrError(ratingReviewSchema, { rating, review })
    if (!parsed.success) return { data: null, error: parsed.error }

    try {
        const rows = await db
            .update(ratingsReviews)
            .set({ rating: parsed.data.rating, review: parsed.data.review })
            .where(and(eq(ratingsReviews.userId, userId), eq(ratingsReviews.gameId, gameId)))
            .returning({
                rating: ratingsReviews.rating,
                review: ratingsReviews.review,
                user_id: ratingsReviews.userId,
                created_at: ratingsReviews.createdAt,
                updated_at: ratingsReviews.updatedAt,
            })

        return { data: rows[0], error: null }
    } catch (error) {
        return { data: null, error: error instanceof Error ? error.message : String(error) }
    }
}

export async function getUserRatings(userId: string) {
    return db
        .select({ game_id: ratingsReviews.gameId, rating: ratingsReviews.rating, review: ratingsReviews.review })
        .from(ratingsReviews)
        .where(eq(ratingsReviews.userId, userId))
}

export async function getAvgRatingsForGames(gameIds: (string | number)[]): Promise<AvgRatingsData[]> {
    const rows = await db.execute(sql`select * from get_avg_ratings_for_games(p_game_ids => ${gameIds.map(String)})`)
    return rows as unknown as AvgRatingsData[]
}

export async function getUserRatingsForGames(userId: string, gameIds: (string | number)[]) {
    return db
        .select({ game_id: ratingsReviews.gameId, rating: ratingsReviews.rating })
        .from(ratingsReviews)
        .where(and(eq(ratingsReviews.userId, userId), inArray(ratingsReviews.gameId, gameIds.map(String))))
}

type RatingsReviewsPageParams = {
    userId?: string
    filter: string
    sort: string
    order: string
    limit: number
    offset: number
}

export async function getUserRatingsReviewsPage(params: RatingsReviewsPageParams): Promise<RatingReviewData[]> {
    const rows = await db.execute(sql`
        select * from get_user_ratings_reviews(
            p_user_id => ${params.userId ?? null},
            p_filter => ${params.filter},
            p_sort => ${params.sort},
            p_order => ${params.order},
            p_limit => ${params.limit},
            p_offset => ${params.offset}
        )
    `)
    return rows as unknown as RatingReviewData[]
}

export async function getUserRatingsReviewsCounts(userId?: string): Promise<RatingReviewCounts[]> {
    const rows = await db.execute(sql`select * from get_user_ratings_reviews_counts(p_user_id => ${userId ?? null})`)
    return rows.length > 0 ? (rows as unknown as RatingReviewCounts[]) : [{ total_count: 0, review_count: 0, rating_count: 0 }]
}

type RecentReview = GameRatingReview & { games: { name: string, slug: string } }

export async function getRecentReviewsGlobal(limit = 3): Promise<(RecentReview & { games: { name: string, slug: string, cover_image_url: string } })[]> {
    const rows = await db
        .select({
            user_id: ratingsReviews.userId,
            rating: ratingsReviews.rating,
            review: ratingsReviews.review,
            created_at: ratingsReviews.createdAt,
            updated_at: ratingsReviews.updatedAt,
            users: { username: users.username, display_name: users.displayName, avatar_url: users.avatarUrl },
            games: { name: games.name, slug: games.slug, cover_image_url: games.coverImageUrl },
        })
        .from(ratingsReviews)
        .innerJoin(users, eq(ratingsReviews.userId, users.id))
        .innerJoin(games, eq(ratingsReviews.gameId, games.id))
        .where(ne(ratingsReviews.review, ''))
        .orderBy(desc(ratingsReviews.createdAt))
        .limit(limit)

    return rows as unknown as (RecentReview & { games: { name: string, slug: string, cover_image_url: string } })[]
}

export async function getRecentReviews(userId: string, limit = 3): Promise<RecentReview[]> {
    const rows = await db
        .select({
            user_id: ratingsReviews.userId,
            rating: ratingsReviews.rating,
            review: ratingsReviews.review,
            created_at: ratingsReviews.createdAt,
            updated_at: ratingsReviews.updatedAt,
            users: { username: users.username, display_name: users.displayName, avatar_url: users.avatarUrl },
            games: { name: games.name, slug: games.slug },
        })
        .from(ratingsReviews)
        .innerJoin(users, eq(ratingsReviews.userId, users.id))
        .innerJoin(games, eq(ratingsReviews.gameId, games.id))
        .where(and(eq(ratingsReviews.userId, userId), ne(ratingsReviews.review, '')))
        .orderBy(desc(ratingsReviews.createdAt))
        .limit(limit)

    return rows as unknown as RecentReview[]
}
```

- [ ] **Step 2: Create `app/review-actions.ts`**

```ts
'use server'

import { requireUser } from '@/lib/auth'
import { createRatingReview, updateRatingReview } from '@/lib/queries/review'

export async function submitRatingReview(gameId: string, rating: number | string, review: string, isUpdate: boolean) {
    const user = await requireUser()
    return isUpdate
        ? updateRatingReview({ userId: user.id, gameId, rating, review })
        : createRatingReview({ userId: user.id, gameId, rating, review })
}
```

- [ ] **Step 3: Update `app/components/game/RateReviewButton.tsx`**

Before:

```tsx
import { createClient } from '@/lib/supabase-browser'
import { createRatingReview, updateRatingReview } from "@/lib/queries/review"
// ...
    async function handleSubmit() {
        if (!user) return

        setError("")
        const supabase = createClient()
        const wasNew = !existingRatingReview

        const { data, error: writeError } = existingRatingReview
            ? await updateRatingReview(supabase, { userId: user.id, gameId: game_id, rating, review })
            : await createRatingReview(supabase, { userId: user.id, gameId: game_id, rating, review })

        if (writeError) {
            setError(writeError)
            return
        }
        // ...
```

After:

```tsx
import { submitRatingReview } from "@/app/review-actions"
// ...
    async function handleSubmit() {
        if (!user) return

        setError("")
        const wasNew = !existingRatingReview

        const { data, error: writeError } = await submitRatingReview(game_id, rating, review, !wasNew)

        if (writeError) {
            setError(writeError)
            return
        }
        // ...
```

(`existingRatingReview == null` maps to `isUpdate = false` — same truthiness check, now expressed as `!wasNew` since `wasNew` is already `!existingRatingReview`.)

- [ ] **Step 4: Update remaining server-side callers**

Drop the `supabase` argument from every call to the 12 query functions in `app/games/[slug]/page.tsx`, `app/user/[username]/ratings_reviews/page.tsx`, `app/user/[username]/loadout/page.tsx`, `app/user/[username]/page.tsx`, `app/page.tsx`.

- [ ] **Step 5: Manual verification**

Run: `npm run dev`. On a game page, submit a new rating/review, then edit it. Confirm the rating distribution chart and review list update. Visit the homepage logged out to confirm `getRecentReviewsGlobal` populates it. Visit a user's ratings/reviews page and loadout page to confirm counts, pagination, and rating highlights are unchanged.

- [ ] **Step 6: Run full test suite + typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add lib/queries/review.ts app/review-actions.ts app/components/game/RateReviewButton.tsx
git commit -m "Convert lib/queries/review.ts to Drizzle, move rating/review submission to a Server Action"
```

---

### Task 9: Convert `lib/queries/list.ts` + `app/list-actions.ts`

**Files:**
- Modify: `lib/queries/list.ts`
- Create: `app/list-actions.ts`
- Modify: `app/components/lists/LikeListButton.tsx`, `AddToListButton.tsx`, `AddToListFromListButton.tsx`, `CreateListButton.tsx`, `CreateListFromGamePageButton.tsx`, `ListPreview.tsx`, `RemoveFromListButton.tsx`
- Modify (caller updates, drop `supabase` argument): `app/user/[username]/lists/page.tsx`, `app/user/[username]/lists/[listId]/page.tsx`, `app/games/[slug]/page.tsx`

**Interfaces:**
- Consumes: `db` from `lib/db.ts`, `requireUser()` from `lib/auth.ts`
- Produces (query layer): `getUserLists(userId, includePrivate)`, `getLikedLists(userId)`, `getListById(listId)`, `getListGames(listId)`, `getListCoverMap(listIds)`, `getListLikes(listIds)`, `getGameListMembership(gameId, listIds)`, `addGameToList(listId, gameId)`, `removeGameFromList(listId, gameId)`, `createList(userId, fields)`, `updateList(listId, fields)`, `syncListGames(listId, {toAdd, toRemove})`, `likeList(listId, userId)`, `unlikeList(listId, userId)`, `setListPinned(listId, pinned)`
- Produces (`app/list-actions.ts`): `toggleListLike(listId, liked)`, `toggleGameInList(listId, gameId, alreadyInList)`, `syncListGamesAction(listId, {toAdd, toRemove})`, `createOrUpdateList(fields, existingListId?)`, `createListAndAddGame(gameId, fields)`, `toggleListPinned(listId, pinned)`, `removeGameFromListAction(listId, gameId)` — all derive `userId` via `requireUser()` where needed

- [ ] **Step 1: Write the full converted `lib/queries/list.ts`**

```ts
import { eq, and, inArray, desc, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { lists, listGames, listLikes, games } from '@/db/schema'
import { GameCover, ListDetail, ListGameEntry } from '@/types'
import { listFieldsSchema, parseOrError } from '@/lib/schemas'

export async function getUserLists(userId: string | null | undefined, includePrivate: boolean) {
    return db.execute(sql`select * from get_user_lists(p_user_id => ${userId ?? null}, p_include_private => ${includePrivate})`)
}

export async function getLikedLists(userId: string) {
    return db.execute(sql`select * from get_liked_lists(p_user_id => ${userId})`)
}

export async function getListById(listId: string): Promise<ListDetail | null> {
    const rows = await db
        .select({
            id: lists.id,
            name: lists.name,
            description: lists.description,
            is_public: lists.isPublic,
            is_pinned: lists.isPinned,
            is_default: lists.isDefault,
            created_at: lists.createdAt,
            updated_at: lists.updatedAt,
        })
        .from(lists)
        .where(eq(lists.id, listId))
        .limit(1)

    return (rows[0] as unknown as ListDetail) ?? null
}

export async function getListGames(listId: string): Promise<ListGameEntry[]> {
    const rows = await db
        .select({
            games: {
                id: games.id, name: games.name, slug: games.slug,
                cover_image_url: games.coverImageUrl, released: games.released, metacritic_score: games.metacriticScore,
            },
        })
        .from(listGames)
        .innerJoin(games, eq(listGames.gameId, games.id))
        .where(eq(listGames.listId, listId))
        .orderBy(listGames.position)

    return rows as unknown as ListGameEntry[]
}

export async function getListCoverMap(listIds: (string | number)[]): Promise<Map<string, GameCover[]>> {
    const rows = await db
        .select({
            list_id: listGames.listId,
            position: listGames.position,
            games: { cover_image_url: games.coverImageUrl, slug: games.slug },
        })
        .from(listGames)
        .innerJoin(games, eq(listGames.gameId, games.id))
        .where(inArray(listGames.listId, listIds.map(String)))
        .orderBy(listGames.position)

    const coversByList = new Map<string, GameCover[]>()

    for (const entry of rows) {
        const existing = coversByList.get(entry.list_id) ?? []
        if (existing.length < 5) {
            existing.push({
                coverImageUrl: entry.games?.cover_image_url ?? null,
                slug: entry.games?.slug ?? null,
            })
            coversByList.set(entry.list_id, existing)
        }
    }

    return coversByList
}

export async function getListLikes(listIds: (string | number)[]) {
    return db
        .select({ list_id: listLikes.listId, user_id: listLikes.userId })
        .from(listLikes)
        .where(inArray(listLikes.listId, listIds.map(String)))
}

export async function getGameListMembership(gameId: string, listIds: (string | number)[]): Promise<Set<string>> {
    const rows = await db
        .select({ list_id: listGames.listId })
        .from(listGames)
        .where(and(eq(listGames.gameId, gameId), inArray(listGames.listId, listIds.map(String))))

    return new Set(rows.map(g => g.list_id))
}

export async function addGameToList(listId: string, gameId: string) {
    try {
        const maxPosRows = await db
            .select({ position: listGames.position })
            .from(listGames)
            .where(eq(listGames.listId, listId))
            .orderBy(desc(listGames.position))
            .limit(1)

        await db.insert(listGames).values({ listId, gameId, position: (maxPosRows[0]?.position ?? -1) + 1 })
        return { error: null }
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) }
    }
}

export async function removeGameFromList(listId: string, gameId: string) {
    try {
        await db.delete(listGames).where(and(eq(listGames.listId, listId), eq(listGames.gameId, gameId)))
        return { error: null }
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) }
    }
}

type ListFields = {
    name: string
    description: string
    isPublic: boolean
    isPinned: boolean
}

export async function createList(userId: string, fields: ListFields) {
    const parsed = parseOrError(listFieldsSchema, fields)
    if (!parsed.success) return { data: null, error: parsed.error }

    try {
        const rows = await db
            .insert(lists)
            .values({ userId, name: parsed.data.name, description: parsed.data.description, isPublic: parsed.data.isPublic, isPinned: parsed.data.isPinned })
            .returning({ id: lists.id })

        return { data: rows[0], error: null }
    } catch (error) {
        return { data: null, error: error instanceof Error ? error.message : String(error) }
    }
}

export async function updateList(listId: string, fields: ListFields) {
    const parsed = parseOrError(listFieldsSchema, fields)
    if (!parsed.success) return { error: parsed.error }

    try {
        await db
            .update(lists)
            .set({ name: parsed.data.name, description: parsed.data.description, isPublic: parsed.data.isPublic, isPinned: parsed.data.isPinned })
            .where(eq(lists.id, listId))
        return { error: null }
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) }
    }
}

// Transactional (see Global Constraints) — the original supabase-js version ran the
// remove and the add as two independent Promise.all() calls with no atomicity; a
// failure partway through could leave a list half-updated. This wraps both writes
// in one db.transaction() so they either both apply or neither does.
export async function syncListGames(listId: string, { toAdd, toRemove }: { toAdd: { id: string }[], toRemove: { id: string }[] }) {
    try {
        await db.transaction(async (tx) => {
            const maxPosRows = await tx
                .select({ position: listGames.position })
                .from(listGames)
                .where(eq(listGames.listId, listId))
                .orderBy(desc(listGames.position))
                .limit(1)

            const startPosition = (maxPosRows[0]?.position ?? -1) + 1

            if (toRemove.length > 0) {
                await tx.delete(listGames).where(and(inArray(listGames.gameId, toRemove.map(g => g.id)), eq(listGames.listId, listId)))
            }
            if (toAdd.length > 0) {
                await tx.insert(listGames).values(toAdd.map((game, index) => ({
                    listId,
                    gameId: game.id,
                    position: startPosition + index,
                })))
            }
        })

        return { error: null }
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) }
    }
}

export async function likeList(listId: string, userId: string) {
    try {
        await db.insert(listLikes).values({ listId, userId })
        return { error: null }
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) }
    }
}

export async function unlikeList(listId: string, userId: string) {
    try {
        await db.delete(listLikes).where(and(eq(listLikes.listId, listId), eq(listLikes.userId, userId)))
        return { error: null }
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) }
    }
}

export async function setListPinned(listId: string | number, pinned: boolean) {
    try {
        const rows = await db
            .update(lists)
            .set({ isPinned: pinned })
            .where(eq(lists.id, String(listId)))
            .returning({ is_pinned: lists.isPinned })

        return { isPinned: rows[0]?.is_pinned, error: null }
    } catch (error) {
        return { isPinned: undefined, error: error instanceof Error ? error.message : String(error) }
    }
}
```

- [ ] **Step 2: Create `app/list-actions.ts`**

```ts
'use server'

import { requireUser } from '@/lib/auth'
import { likeList, unlikeList, addGameToList, removeGameFromList, syncListGames, createList, updateList, setListPinned } from '@/lib/queries/list'

type ListFields = {
    name: string
    description: string
    isPublic: boolean
    isPinned: boolean
}

export async function toggleListLike(listId: string, liked: boolean) {
    const user = await requireUser()
    return liked ? unlikeList(listId, user.id) : likeList(listId, user.id)
}

export async function toggleGameInList(listId: string, gameId: string, alreadyInList: boolean) {
    await requireUser()
    return alreadyInList ? removeGameFromList(listId, gameId) : addGameToList(listId, gameId)
}

export async function removeGameFromListAction(listId: string, gameId: string) {
    await requireUser()
    return removeGameFromList(listId, gameId)
}

export async function syncListGamesAction(listId: string, entries: { toAdd: { id: string }[], toRemove: { id: string }[] }) {
    await requireUser()
    return syncListGames(listId, entries)
}

export async function createOrUpdateList(fields: ListFields, existingListId?: string) {
    const user = await requireUser()
    return existingListId ? updateList(existingListId, fields) : createList(user.id, fields)
}

export async function createListAndAddGame(gameId: string, fields: ListFields) {
    const user = await requireUser()
    const { data: list, error: createError } = await createList(user.id, fields)
    if (createError) return { error: createError }
    if (list) {
        const { error: addError } = await addGameToList(list.id, gameId)
        if (addError) return { error: addError }
    }
    return { error: null }
}

export async function toggleListPinned(listId: string | number, pinned: boolean) {
    await requireUser()
    return setListPinned(listId, pinned)
}
```

- [ ] **Step 3: Update `app/components/lists/LikeListButton.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { toggleListLike } from '@/app/list-actions'

export default function LikeButton({ listId, initialCount, initialLiked, userId }: {
    listId: string
    initialCount: number
    initialLiked: boolean
    userId: string | null | undefined
}) {
    const [liked, setLiked] = useState(initialLiked)
    const [count, setCount] = useState(initialCount)
    const [loading, setLoading] = useState(false)

    async function handleLike() {
        if (!userId) return
        if (loading) return

        setLoading(true)
        const { error } = await toggleListLike(listId, liked)

        if (!error) {
            setLiked(!liked)
            setCount(c => liked ? c - 1 : c + 1)
        }

        setLoading(false)
    }

    return (
        <button
            onClick={handleLike}
            disabled={loading}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-[3px] border
                text-sm font-semibold transition-all duration-200 z-10
                ${liked
                ? 'border-(--color-accent) text-(--color-accent) bg-(--color-accent)/10'
                : 'border-(--color-border) text-(--color-muted) hover:border-(--color-accent) hover:text-(--color-accent)'}`}
        >
            <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill={liked ? 'var(--color-accent)' : 'none'}
                stroke={liked ? 'var(--color-accent)' : 'currentColor'}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="transition-all duration-200"
            >
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
            {count > 0 && <span>{count}</span>}
        </button>
    )
}
```

Note: `userId` prop is now only a client-side "are you logged in" gate — `requireUser()` inside the Server Action is the real authorization check, so a tampered/stale `userId` prop can no longer cause a request to run as someone else.

- [ ] **Step 4: Update `app/components/lists/AddToListButton.tsx`**

Before:

```tsx
import { createClient } from "@/lib/supabase-browser"
import { addGameToList, removeGameFromList } from "@/lib/queries/list"
// ...
    async function handleListToggle(listId: string, alreadyInList: boolean) {
        setError("")
        const supabase = createClient()

        if (alreadyInList) {
            const { error: removeError } = await removeGameFromList(supabase, listId, gameId)
            if (removeError) { setError(removeError); return }
            setListIdsGameIsInState(prev => { prev.delete(listId); return new Set(prev) })
        } else {
            const { error: addError } = await addGameToList(supabase, listId, gameId)
            if (addError) { setError(addError); return }
            setListIdsGameIsInState(prev => new Set(prev).add(listId))
            plus1("LISTED")
            setIsAddToListModalOpen(false)
        }
    }
```

After:

```tsx
import { toggleGameInList } from "@/app/list-actions"
// ...
    async function handleListToggle(listId: string, alreadyInList: boolean) {
        setError("")

        const { error } = await toggleGameInList(listId, gameId, alreadyInList)
        if (error) { setError(error); return }

        if (alreadyInList) {
            setListIdsGameIsInState(prev => { prev.delete(listId); return new Set(prev) })
        } else {
            setListIdsGameIsInState(prev => new Set(prev).add(listId))
            plus1("LISTED")
            setIsAddToListModalOpen(false)
        }
    }
```

- [ ] **Step 5: Update `app/components/lists/AddToListFromListButton.tsx`**

Only the `submitGames` function's `syncListGames` call changes (its `searchGamesByName` call stays as-is, handled in Task 2):

Before:

```tsx
import { createClient } from "@/lib/supabase-browser"
import { syncListGames } from "@/lib/queries/list"
// ...
    async function submitGames() {
        setError("")
        const supabase = createClient()

        const toRemove = currentGames.filter(g => !selectedGames.some(s => s.id === g.id))
        const toAdd = selectedGames.filter(g => !currentGames.some(c => c.id === g.id))

        const { error: syncError } = await syncListGames(supabase, listId, { toAdd, toRemove })
        if (syncError) {
            setError(syncError)
            return
        }

        setIsAddToListModalOpen(false)
        router.refresh()
    }
```

After:

```tsx
import { syncListGamesAction } from "@/app/list-actions"
// ...
    async function submitGames() {
        setError("")

        const toRemove = currentGames.filter(g => !selectedGames.some(s => s.id === g.id))
        const toAdd = selectedGames.filter(g => !currentGames.some(c => c.id === g.id))

        const { error: syncError } = await syncListGamesAction(listId, { toAdd, toRemove })
        if (syncError) {
            setError(syncError)
            return
        }

        setIsAddToListModalOpen(false)
        router.refresh()
    }
```

(`searchGamesByName` is still imported from `@/lib/queries/game` and still called with a browser `supabase` client, both unchanged — keep that import and its `useEffect` untouched.)

- [ ] **Step 6: Update `app/components/lists/CreateListButton.tsx`**

Before:

```tsx
import { createClient } from "@/lib/supabase-browser"
import { createList, updateList } from "@/lib/queries/list"
// ...
    async function submitList() {
        setError("")
        const supabase = createClient()
        const fields = { name, description, isPublic, isPinned }

        const { error: writeError } = isUpdate && current
            ? await updateList(supabase, current.listId, fields)
            : await createList(supabase, userId, fields)

        if (writeError) {
            setError(writeError)
            return
        }
        if (!isUpdate) plus1("NEW LIST")

        setIsCreateListModalOpen(false)
        router.refresh()
    }
```

After:

```tsx
import { createOrUpdateList } from "@/app/list-actions"
// ...
    async function submitList() {
        setError("")
        const fields = { name, description, isPublic, isPinned }

        const { error: writeError } = await createOrUpdateList(fields, isUpdate && current ? current.listId : undefined)

        if (writeError) {
            setError(writeError)
            return
        }
        if (!isUpdate) plus1("NEW LIST")

        setIsCreateListModalOpen(false)
        router.refresh()
    }
```

(The `userId` prop is no longer used by `submitList` — `requireUser()` inside `createOrUpdateList` supplies it. Check whether `userId` is used elsewhere in this component before removing the prop; if this was its only use, remove the prop and its caller's pass-through.)

- [ ] **Step 7: Update `app/components/lists/CreateListFromGamePageButton.tsx`**

Before:

```tsx
import { createClient } from "@/lib/supabase-browser"
import { createList, addGameToList } from "@/lib/queries/list"
// ...
    async function submitList() {
        setError("")
        const supabase = createClient()

        const { data: list, error: createError } = await createList(supabase, userId, { name, description, isPublic, isPinned })
        if (createError) {
            setError(createError)
            return
        }

        if (list) {
            const { error: addError } = await addGameToList(supabase, list.id, gameId)
            if (addError) {
                setError(addError)
                return
            }
        }

        setIsCreateListModalOpen(false)
        close()
        // one chip for the whole action — the new list, not also LISTED
        plus1("NEW LIST")
        router.refresh()
    }
```

After:

```tsx
import { createListAndAddGame } from "@/app/list-actions"
// ...
    async function submitList() {
        setError("")

        const { error } = await createListAndAddGame(gameId, { name, description, isPublic, isPinned })
        if (error) {
            setError(error)
            return
        }

        setIsCreateListModalOpen(false)
        close()
        // one chip for the whole action — the new list, not also LISTED
        plus1("NEW LIST")
        router.refresh()
    }
```

(`userId` prop likely still needed elsewhere in this component's caller chain — check before removing; if unused after this change, remove it and its pass-through.)

- [ ] **Step 8: Update `app/components/lists/ListPreview.tsx`**

Before:

```tsx
import { createClient } from "@/lib/supabase-browser"
import { setListPinned } from "@/lib/queries/list"
// ...
    async function handlePinChange() {
        const supabase = createClient()
        const { isPinned: newPinned, error } = await setListPinned(supabase, listId, !isPinnedNow)
        if (error) return // leave the pin state as it was — nothing changed server-side
        setIsPinnedNow(newPinned)
        router.refresh()
    }
```

After:

```tsx
import { toggleListPinned } from "@/app/list-actions"
// ...
    async function handlePinChange() {
        const { isPinned: newPinned, error } = await toggleListPinned(listId, !isPinnedNow)
        if (error) return // leave the pin state as it was — nothing changed server-side
        setIsPinnedNow(newPinned)
        router.refresh()
    }
```

- [ ] **Step 9: Update `app/components/lists/RemoveFromListButton.tsx`**

Before:

```tsx
import { createClient } from "@/lib/supabase-browser"
import { removeGameFromList } from "@/lib/queries/list"
// ...
    async function removeGame() {
        setError("")
        const supabase = createClient()
        const { error: removeError } = await removeGameFromList(supabase, listId, gameId)
        if (removeError) {
            setError(removeError)
            return
        }
        router.refresh()
    }
```

After:

```tsx
import { removeGameFromListAction } from "@/app/list-actions"
// ...
    async function removeGame() {
        setError("")
        const { error: removeError } = await removeGameFromListAction(listId, gameId)
        if (removeError) {
            setError(removeError)
            return
        }
        router.refresh()
    }
```

- [ ] **Step 10: Update remaining server-side callers**

Drop the `supabase` argument from every remaining call to `getUserLists`, `getListById`, `getListGames`, `getListCoverMap`, `getListLikes`, `getGameListMembership`, `getLikedLists` in `app/user/[username]/lists/page.tsx`, `app/user/[username]/lists/[listId]/page.tsx`, `app/games/[slug]/page.tsx`.

- [ ] **Step 11: Manual verification**

Run: `npm run dev`. Create a list, add/remove games from it (both from the game-page "+ List" button and from the list's own "Manage" search), rename/re-describe it, toggle public/private and pinned, like/unlike someone else's list, remove a game from a list, and create a brand-new list directly from a game page. Confirm all of it works and counts update correctly.

- [ ] **Step 12: Run full test suite + typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all PASS, no type errors.

- [ ] **Step 13: Commit**

```bash
git add lib/queries/list.ts app/list-actions.ts app/components/lists
git commit -m "Convert lib/queries/list.ts to Drizzle, move list mutations to Server Actions, make syncListGames transactional"
```

---

### Task 10: Convert `lib/queries/user.ts` (DB-backed functions) + `app/user-actions.ts`

**Files:**
- Modify: `lib/queries/user.ts`
- Create: `app/user-actions.ts`
- Modify: `app/components/user/AvatarUploader.tsx`, `FavoriteGamePicker.tsx` (in `app/components/game/`), `ChangePrivacyButton.tsx`, `ChangeUsernameButton.tsx`, `BioButton.tsx`, `FollowButton.tsx`
- Modify (caller updates, drop `supabase` argument): `app/settings/page.tsx`, `app/components/settings/DeleteUserButton.tsx` (only if it calls a converted function — it currently only imports `signOut`, which stays unchanged, so check before editing), and any remaining page calling the converted functions

**Interfaces:**
- Consumes: `db` from `lib/db.ts`, `requireUser()` from `lib/auth.ts`
- Produces (converted): `getProfileSummaryByUsername(username)`, `getFullProfile(username)`, `getUserIdFromUsername(username)`, `getAccountSettings(userId)`, `updateBio(userId, bio)`, `updateUsername(userId, username)`, `updateSelectedTitle(userId, title)`, `updateFavoriteGames(userId, gameIds)`, `updatePrivacy(privacy, type, userId)`, `getFollowers(userId)`, `getFollowing(userId)`, `followUser(followerId, followingId)`, `unfollowUser(followerId, followingId)`, `getCurrentLoadoutIdentity(userId)`
- Produces (`app/user-actions.ts`): `saveAvatarUrl(url)`, `saveFavoriteGames(gameIds)`, `togglePrivacyAction(currentPrivacy, type)`, `saveUsername(username)`, `saveBio(bio)`, `toggleFollow(targetUserId, isFollowing)` — all derive `userId` via `requireUser()`
- **Unchanged, stays on `supabase-js`:** `getViewer`, `getProfileSummaryById`, `signInWithPassword`, `signUpWithPassword`, `signOut`, `updateEmail`, `updatePassword`, `uploadAvatarImage`, `deleteUserAccount`

- [ ] **Step 1: Write the full converted `lib/queries/user.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { eq, and } from 'drizzle-orm'
import { db } from '@/lib/db'
import { users, follows } from '@/db/schema'
import {
    emailSchema, passwordSchema, usernameSchema, bioSchema,
    selectedTitleSchema, favoriteGameIdsSchema, privacyTypeSchema, parseOrError,
} from '@/lib/schemas'

// Unchanged — supabase.auth.getUser() is an Auth call, not a DB read.
// Also called directly from UserContext.tsx ('use client').
export async function getViewer(supabase: SupabaseClient) {
    const { data: { user } } = await supabase.auth.getUser()
    return user
}

export async function getProfileSummaryByUsername(username: string) {
    const rows = await db
        .select({ id: users.id, username: users.username, display_name: users.displayName, avatar_url: users.avatarUrl })
        .from(users)
        .where(eq(users.username, username))
        .limit(1)

    return rows[0] ?? null
}

// Unchanged — called directly from UserContext.tsx ('use client'), stays on supabase-js.
export async function getProfileSummaryById(supabase: SupabaseClient, userId: string) {
    const { data } = await supabase
        .from('users')
        .select('id, username, display_name, avatar_url')
        .eq('id', userId)
        .single()

    return data
}

export async function getFullProfile(username: string) {
    const rows = await db
        .select({
            id: users.id, username: users.username, display_name: users.displayName, avatar_url: users.avatarUrl,
            created_at: users.createdAt, selected_title: users.selectedTitle, favorite_game_ids: users.favoriteGameIds,
            user_bio: users.userBio, default_list_public: users.defaultListPublic, library_public: users.libraryPublic,
            loadout_public: users.loadoutPublic, profile_loadout_bio: users.profileLoadoutBio,
        })
        .from(users)
        .where(eq(users.username, username))
        .limit(1)

    return rows[0] ?? null
}

export async function getUserIdFromUsername(username: string) {
    const rows = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1)
    return rows[0] ?? null
}

export async function getAccountSettings(userId: string) {
    const rows = await db
        .select({
            id: users.id, username: users.username, avatar_url: users.avatarUrl, selected_title: users.selectedTitle,
            created_at: users.createdAt, default_list_public: users.defaultListPublic,
            library_public: users.libraryPublic, loadout_public: users.loadoutPublic,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)

    return rows[0] ?? null
}

export async function updateBio(userId: string, bio: string) {
    const parsed = parseOrError(bioSchema, bio)
    if (!parsed.success) return { error: parsed.error }

    try {
        await db.update(users).set({ userBio: parsed.data }).where(eq(users.id, userId))
        return { error: null }
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) }
    }
}

export async function updateUsername(userId: string, username: string) {
    const parsed = parseOrError(usernameSchema, username)
    if (!parsed.success) return { data: null, error: parsed.error }

    try {
        const rows = await db.update(users).set({ username: parsed.data }).where(eq(users.id, userId)).returning({ username: users.username })
        return { data: rows[0], error: null }
    } catch (error) {
        return { data: null, error: error instanceof Error ? error.message : String(error) }
    }
}

export async function updateSelectedTitle(userId: string, title: string) {
    const parsed = parseOrError(selectedTitleSchema, title)
    if (!parsed.success) return { title: null, error: parsed.error }

    try {
        const rows = await db.update(users).set({ selectedTitle: parsed.data }).where(eq(users.id, userId)).returning({ selected_title: users.selectedTitle })
        return { title: rows[0]?.selected_title, error: null }
    } catch (error) {
        return { title: null, error: error instanceof Error ? error.message : String(error) }
    }
}

export async function updateFavoriteGames(userId: string, gameIds: string[]) {
    const parsed = parseOrError(favoriteGameIdsSchema, gameIds)
    if (!parsed.success) return { error: parsed.error }

    try {
        await db.update(users).set({ favoriteGameIds: parsed.data }).where(eq(users.id, userId)).returning({ favorite_game_ids: users.favoriteGameIds })
        return { error: null }
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) }
    }
}

// Unchanged — Supabase Storage, not a Postgres query.
export async function uploadAvatarImage(supabase: SupabaseClient, userId: string, file: File): Promise<string> {
    const filePath = `${userId}/avatar.${file.name.split('.').pop()}`

    const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true })

    if (uploadError) throw uploadError

    const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath)

    return publicUrl
}

export async function updateAvatarUrl(userId: string, url: string) {
    try {
        await db.update(users).set({ avatarUrl: url }).where(eq(users.id, userId))
        return null
    } catch (error) {
        return error instanceof Error ? error.message : String(error)
    }
}

// Unchanged — Supabase Auth calls, not Postgres queries.
export async function signInWithPassword(supabase: SupabaseClient, email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error
}

export async function signUpWithPassword(
    supabase: SupabaseClient,
    { email, password, username }: { email: string, password: string, username: string },
    emailRedirectTo?: string,
) {
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { username }, emailRedirectTo }
    })
    return { data, error }
}

export async function signOut(supabase: SupabaseClient) {
    await supabase.auth.signOut()
}

export async function updateEmail(supabase: SupabaseClient, email: string) {
    const parsed = parseOrError(emailSchema, email)
    if (!parsed.success) return parsed.error

    const { error } = await supabase.auth.updateUser({ email: parsed.data })
    return error?.message ?? null
}

export async function updatePassword(supabase: SupabaseClient, password: string) {
    const parsed = parseOrError(passwordSchema, password)
    if (!parsed.success) return parsed.error

    const { error } = await supabase.auth.updateUser({ password: parsed.data })
    return error?.message ?? null
}
// (End of unchanged Auth/Storage block.)

const PRIVACY_COLUMN = {
    'Default List': 'defaultListPublic',
    'Library': 'libraryPublic',
    'Loadout': 'loadoutPublic',
} as const

export async function updatePrivacy(privacy: boolean, type: string, userId: string) {
    const parsed = parseOrError(privacyTypeSchema, type)
    if (!parsed.success) return parsed.error

    try {
        const column = PRIVACY_COLUMN[parsed.data]
        await db.update(users).set({ [column]: privacy }).where(eq(users.id, userId))
        return null
    } catch (error) {
        return error instanceof Error ? error.message : String(error)
    }
}

export async function getFollowers(userId: string) {
    return db.select({ follower_id: follows.followerId }).from(follows).where(eq(follows.followingId, userId))
}

export async function getFollowing(userId: string) {
    return db.select({ following_id: follows.followingId }).from(follows).where(eq(follows.followerId, userId))
}

export async function followUser(followerId: string, followingId: string) {
    await db.insert(follows).values({ followerId, followingId })
}

export async function unfollowUser(followerId: string, followingId: string) {
    await db.delete(follows).where(and(eq(follows.followerId, followerId), eq(follows.followingId, followingId)))
}

// Unchanged — Supabase Auth admin API, not a Postgres query. public.users cleanup
// happens automatically via the ON DELETE CASCADE FK from auth.users.
export async function deleteUserAccount(adminClient: SupabaseClient, userId: string) {
    const { error } = await adminClient.auth.admin.deleteUser(userId)
    return error
}

export async function getCurrentLoadoutIdentity(userId: string) {
    const rows = await db
        .select({ loadout_identity: users.loadoutIdentity, loadout_identity_at: users.loadoutIdentityAt })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)

    return rows[0] ?? null
}
```

- [ ] **Step 2: Create `app/user-actions.ts`**

```ts
'use server'

import { requireUser } from '@/lib/auth'
import { updateAvatarUrl, updateFavoriteGames, updatePrivacy, updateUsername, updateBio, followUser, unfollowUser } from '@/lib/queries/user'

export async function saveAvatarUrl(url: string) {
    const user = await requireUser()
    return updateAvatarUrl(user.id, url)
}

export async function saveFavoriteGames(gameIds: string[]) {
    const user = await requireUser()
    return updateFavoriteGames(user.id, gameIds)
}

export async function togglePrivacyAction(currentPrivacy: boolean, type: string) {
    const user = await requireUser()
    return updatePrivacy(!currentPrivacy, type, user.id)
}

export async function saveUsername(username: string) {
    const user = await requireUser()
    return updateUsername(user.id, username)
}

export async function saveBio(bio: string) {
    const user = await requireUser()
    return updateBio(user.id, bio)
}

export async function toggleFollow(targetUserId: string, isFollowing: boolean) {
    const user = await requireUser()
    return isFollowing ? unfollowUser(user.id, targetUserId) : followUser(user.id, targetUserId)
}
```

- [ ] **Step 3: Update `app/components/user/AvatarUploader.tsx`**

Only `updateAvatarUrl` moves — `uploadAvatarImage` (Storage) stays exactly as-is, still called client-side with the browser `supabase` client.

Before:

```tsx
import { uploadAvatarImage, updateAvatarUrl } from '@/lib/queries/user'
// ...
        // Update user's avatar_url in the database
        const updateError = await updateAvatarUrl(supabase, userId, publicUrl)
```

After:

```tsx
import { uploadAvatarImage } from '@/lib/queries/user'
import { saveAvatarUrl } from '@/app/user-actions'
// ...
        // Update user's avatar_url in the database
        const updateError = await saveAvatarUrl(publicUrl)
```

(`userId` prop is still needed to build the upload `filePath` — keep it.)

- [ ] **Step 4: Update `app/components/game/FavoriteGamePicker.tsx`**

Only the `submitGames` function's `updateFavoriteGames` call changes (`searchGamesByName` stays as-is):

Before:

```tsx
import { updateFavoriteGames } from "@/lib/queries/user"
// ...
    async function submitGames() {
        setError("")
        const supabase = createClient()
        const addedNew = selectedGames.some(g => !currentGames.find(c => c.id === g.id))
        const { error: writeError } = await updateFavoriteGames(supabase, userId, selectedGames.map(g => g.id))

        if (writeError) {
            setError(writeError)
            return
        }
```

After:

```tsx
import { saveFavoriteGames } from "@/app/user-actions"
// ...
    async function submitGames() {
        setError("")
        const addedNew = selectedGames.some(g => !currentGames.find(c => c.id === g.id))
        const { error: writeError } = await saveFavoriteGames(selectedGames.map(g => g.id))

        if (writeError) {
            setError(writeError)
            return
        }
```

(`searchGamesByName`'s `createClient()`/`supabase` usage in the search `useEffect` stays untouched — only remove the `createClient()` call above if `submitGames` was its only remaining use in this function; the search effect has its own.)

- [ ] **Step 5: Update `app/components/settings/ChangePrivacyButton.tsx`**

Before:

```tsx
import { createClient } from "@/lib/supabase-browser";
import { updatePrivacy } from "@/lib/queries/user";
// ...
    async function togglePrivacy() {
        setError("")
        const supabase = createClient()
        const writeError = await updatePrivacy(supabase, !currentPrivacy, type, userId)

        if (writeError) {
            setError(writeError)
            return
        }
```

After:

```tsx
import { togglePrivacyAction } from "@/app/user-actions";
// ...
    async function togglePrivacy() {
        setError("")
        const writeError = await togglePrivacyAction(currentPrivacy, type)

        if (writeError) {
            setError(writeError)
            return
        }
```

(`userId` prop is no longer used — `requireUser()` inside `togglePrivacyAction` supplies it. Remove the prop and its caller's pass-through if this was its only use.)

- [ ] **Step 6: Update `app/components/settings/ChangeUsernameButton.tsx`**

Before:

```tsx
import { createClient } from "@/lib/supabase-browser";
import { updateUsername } from "@/lib/queries/user";
// ...
    async function submitUsername() {
        setError("")
        const supabase = createClient()
        const { error: writeError } = await updateUsername(supabase, userId, username)

        if (writeError) {
            setError(writeError)
            return
        }
```

After:

```tsx
import { saveUsername } from "@/app/user-actions";
// ...
    async function submitUsername() {
        setError("")
        const { error: writeError } = await saveUsername(username)

        if (writeError) {
            setError(writeError)
            return
        }
```

(`userId` prop is still used to display "Current Username" via `currentUsername` — check whether `userId` itself is used anywhere else in the component; if not, remove it and its caller's pass-through.)

- [ ] **Step 7: Update `app/components/user/BioButton.tsx`**

Before:

```tsx
import { createClient } from "@/lib/supabase-browser"
import { updateBio } from "@/lib/queries/user"
// ...
    async function submitBio() {
        setError("")
        const supabase = createClient()
        const { error: writeError } = await updateBio(supabase, userId, bio)

        if (writeError) {
            setError(writeError)
            return
        }
```

After:

```tsx
import { saveBio } from "@/app/user-actions"
// ...
    async function submitBio() {
        setError("")
        const { error: writeError } = await saveBio(bio)

        if (writeError) {
            setError(writeError)
            return
        }
```

(`userId` prop — check whether it's used elsewhere in the component; remove along with its caller's pass-through if not.)

- [ ] **Step 8: Update `app/components/user/FollowButton.tsx`**

Before:

```tsx
import { createClient } from "@/lib/supabase-browser"
import { followUser, unfollowUser } from "@/lib/queries/user"
// ...
    async function handleFollow() {
        setIsLoading(true)
        const supabase = createClient()

        if (isFollowing) {
            await unfollowUser(supabase, userId, targetUserId)
        } else {
            await followUser(supabase, userId, targetUserId)
        }

        setIsFollowing(!isFollowing)
        setIsLoading(false)
        router.refresh()
    }
```

After:

```tsx
import { toggleFollow } from "@/app/user-actions"
// ...
    async function handleFollow() {
        setIsLoading(true)

        await toggleFollow(targetUserId, isFollowing)

        setIsFollowing(!isFollowing)
        setIsLoading(false)
        router.refresh()
    }
```

(`userId` prop — the component's own id was only ever used to build the FK pair for the direct `supabase-js` call; `requireUser()` now supplies it server-side. Check whether `userId` is used elsewhere in this component before removing the prop and its caller's pass-through.)

- [ ] **Step 9: Update remaining server-side callers**

Drop the `supabase` argument from every remaining call to `getProfileSummaryByUsername`, `getFullProfile`, `getUserIdFromUsername`, `getAccountSettings`, `updateSelectedTitle`, `getFollowers`, `getFollowing`, `getCurrentLoadoutIdentity` in `app/settings/page.tsx` and any other file calling them. Remember `getViewer` and `getProfileSummaryById` are unchanged — their callers keep `supabase` as-is.

- [ ] **Step 10: Manual verification**

Run: `npm run dev`. Visit a user's public profile and settings pages. Change bio, username, selected title, favorite games, avatar, and each privacy toggle — confirm each saves and displays correctly. Follow/unfollow another user and confirm follower/following counts update. Confirm `UserContext`'s viewer-loading and sign-out (both unchanged) still work.

- [ ] **Step 11: Run full test suite + typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all PASS, no type errors.

- [ ] **Step 12: Commit**

```bash
git add lib/queries/user.ts app/user-actions.ts app/components/user app/components/game/FavoriteGamePicker.tsx app/components/settings/ChangePrivacyButton.tsx app/components/settings/ChangeUsernameButton.tsx app/settings/page.tsx
git commit -m "Convert lib/queries/user.ts DB-backed functions to Drizzle, move user-profile mutations to Server Actions"
```

---

## After all 10 tasks

Run a final full pass: `npm test && npx tsc --noEmit && npm run lint`, then a manual click-through of the app covering every page touched across the 10 tasks. Once confirmed, update `AGENTS.md`'s "Supabase Clients" table to add a fourth row for Drizzle (`lib/db.ts`, "Postgres queries outside Auth/Storage", `import { db } from '@/lib/db'`, sync — no `await`, no per-call client to pass), and note the small set of functions that intentionally stay on `supabase-js` — deferred until now per the user's instruction. This is also the point to revisit the tracked-but-deferred items from the spec: standardizing error handling across the converted functions, and the `SECURITY DEFINER` RPC exposure noted during the schema migration.
