import 'server-only'
import { and, asc, desc, eq, gt, lt, or, sql, type SQL } from 'drizzle-orm'
import { db } from '@/lib/db'
import { games, lists, users } from '@/db/schema'
import { parseDbTimestamp } from '@screenpeak/shared/dates'

// One page at a time. A single .limit(5000) is not a guarantee — PostgREST
// caps rows, and an unordered cap shifts between requests. A short page ends
// the scan, so the catalogue is not silently truncated.
export const SITEMAP_PAGE_SIZE = 1000

// https://www.sitemaps.org/protocol.html — 50,000 URLs per sitemap document.
export const SITEMAP_URL_LIMIT = 50_000

const STATIC_PATHS = ['', '/games', '/explore'] as const

export type SitemapEntry = { url: string; lastModified?: Date }

export type SitemapGame = { id: string; slug: string; updatedAt: string }
export type SitemapUser = { id: string; username: string }
export type SitemapList = { id: string; userId: string; updatedAt: string | null; isPublic: boolean | null; username?: string | null }
export type GameCursor = { updatedAt: string; id: string }
export type SitemapCounts = { games: number; users: number; lists: number }

export type SitemapSource = {
    games: (cursor: GameCursor | null, limit: number) => Promise<SitemapGame[]>
    users: (cursor: string | null, limit: number) => Promise<SitemapUser[]>
    lists: (cursor: string | null, limit: number) => Promise<SitemapList[]>
    counts: () => Promise<SitemapCounts>
}

export type SitemapOptions = {
    pageSize?: number
    urlLimit?: number
    source?: SitemapSource
    counts?: SitemapCounts
}

/** updated_at descending, then id ascending. The next row is older, or the same time with a greater id. */
export function gameRowAfterCursor(row: { updatedAt: string; id: string }, cursor: GameCursor): boolean {
    return row.updatedAt < cursor.updatedAt || (row.updatedAt === cursor.updatedAt && row.id > cursor.id)
}

export function gamesAfterCursor(cursor: GameCursor): SQL {
    const predicate = or(
        lt(games.updatedAt, cursor.updatedAt),
        and(eq(games.updatedAt, cursor.updatedAt), gt(games.id, cursor.id)),
    )
    if (!predicate) throw new Error('sitemap game cursor was empty')
    return predicate
}

export function sitemapLastModified(value: string | null | undefined): Date | undefined {
    if (!value) return undefined
    const date = parseDbTimestamp(value)
    return Number.isNaN(date.getTime()) ? undefined : date
}

export function sitemapIdCount(counts: SitemapCounts, urlLimit = SITEMAP_URL_LIMIT): number {
    const limit = normalizeUrlLimit(urlLimit)
    const total = STATIC_PATHS.length + counts.games + counts.users + counts.lists
    return Math.max(1, Math.ceil(total / limit))
}

export function sectionSlice(sectionStart: number, sectionLength: number, windowStart: number, windowEnd: number) {
    const from = Math.max(sectionStart, windowStart)
    const to = Math.min(sectionStart + sectionLength, windowEnd)
    if (to <= from) return null
    return { skip: from - sectionStart, take: to - from }
}

export function assembleSitemap(base: string, data: {
    games: { slug: string; updatedAt: string }[]
    users: { id: string; username: string }[]
    lists: SitemapList[]
}, now = new Date(), includeStatic = true): SitemapEntry[] {
    const usernameById = new Map(data.users.map(user => [user.id, user.username]))
    const entries: SitemapEntry[] = []
    if (includeStatic) {
        for (const path of STATIC_PATHS) entries.push({ url: `${base}${path}`, lastModified: now })
    }
    for (const game of data.games) {
        const lastModified = sitemapLastModified(game.updatedAt)
        entries.push(lastModified
            ? { url: `${base}/games/${game.slug}`, lastModified }
            : { url: `${base}/games/${game.slug}` })
    }
    for (const user of data.users) entries.push({ url: `${base}/user/${user.username}` })
    for (const list of data.lists) {
        if (list.isPublic !== true) continue
        const username = list.username || usernameById.get(list.userId)
        if (!username) continue
        const lastModified = sitemapLastModified(list.updatedAt)
        entries.push(lastModified
            ? { url: `${base}/user/${username}/lists/${list.id}`, lastModified }
            : { url: `${base}/user/${username}/lists/${list.id}` })
    }
    return entries
}

function normalizePageSize(pageSize: number) {
    if (!Number.isInteger(pageSize) || pageSize < 1) throw new Error('sitemap page size must be a positive integer')
    return pageSize
}

function normalizeUrlLimit(urlLimit: number) {
    if (!Number.isInteger(urlLimit) || urlLimit < 1) throw new Error('sitemap url limit must be a positive integer')
    return Math.min(urlLimit, SITEMAP_URL_LIMIT)
}

function normalizeCounts(counts: SitemapCounts): SitemapCounts {
    const values = [counts.games, counts.users, counts.lists]
    if (values.some(value => !Number.isInteger(value) || value < 0)) throw new Error('sitemap counts must be non-negative integers')
    return counts
}

async function collectWindow<T, C>(
    fetchPage: (cursor: C | null, limit: number) => Promise<T[]>,
    cursorOf: (row: T) => C,
    pageSize: number,
    skip: number,
    take: number,
): Promise<T[]> {
    if (take < 1) return []
    const rows: T[] = []
    let cursor: C | null = null
    let seen = 0
    const target = skip + take
    for (;;) {
        const page = await fetchPage(cursor, pageSize)
        if (page.length > pageSize) throw new Error('sitemap page exceeded the requested limit')
        for (const row of page) {
            if (seen >= skip) rows.push(row)
            seen += 1
            if (seen >= target) return rows
        }
        if (page.length < pageSize) return rows
        const next = cursorOf(page[page.length - 1])
        if (cursor !== null && JSON.stringify(cursor) === JSON.stringify(next)) {
            throw new Error('sitemap page did not advance')
        }
        cursor = next
    }
}

function drizzleSource(): SitemapSource {
    return {
        // updated_at descending, then id ascending. metacritic_score is not read.
        games: (cursor, limit) => {
            const query = db.select({
                id: games.id,
                slug: games.slug,
                updatedAt: games.updatedAt,
            }).from(games)
            const filtered = cursor ? query.where(gamesAfterCursor(cursor)) : query
            return filtered.orderBy(desc(games.updatedAt), asc(games.id)).limit(limit)
        },
        users: (cursor, limit) => {
            const query = db.select({ id: users.id, username: users.username }).from(users)
            const filtered = cursor ? query.where(gt(users.id, cursor)) : query
            return filtered.orderBy(asc(users.id)).limit(limit)
        },
        lists: (cursor, limit) => db.select({
            id: lists.id,
            userId: lists.userId,
            updatedAt: lists.updatedAt,
            isPublic: lists.isPublic,
            username: users.username,
        }).from(lists).innerJoin(users, eq(lists.userId, users.id)).where(cursor
            ? and(eq(lists.isPublic, true), gt(lists.id, cursor))
            : eq(lists.isPublic, true),
        ).orderBy(asc(lists.id)).limit(limit),
        counts: async () => {
            const [gameCount] = await db.select({ n: sql<number>`cast(count(*) as int)` }).from(games)
            const [userCount] = await db.select({ n: sql<number>`cast(count(*) as int)` }).from(users)
            const [listCount] = await db.select({ n: sql<number>`cast(count(*) as int)` }).from(lists).where(eq(lists.isPublic, true))
            return normalizeCounts({
                games: Number(gameCount?.n ?? 0),
                users: Number(userCount?.n ?? 0),
                lists: Number(listCount?.n ?? 0),
            })
        },
    }
}

export async function countSitemapEntries(source?: SitemapSource): Promise<SitemapCounts> {
    return normalizeCounts(await (source ?? drizzleSource()).counts())
}

export async function loadSitemapShard(base: string, shardId: number, options?: SitemapOptions, now = new Date()): Promise<SitemapEntry[]> {
    if (!Number.isInteger(shardId) || shardId < 0) throw new Error('sitemap id must be a non-negative integer')
    const pageSize = normalizePageSize(options?.pageSize ?? SITEMAP_PAGE_SIZE)
    const urlLimit = normalizeUrlLimit(options?.urlLimit ?? SITEMAP_URL_LIMIT)
    const source = options?.source ?? drizzleSource()
    const counts = normalizeCounts(options?.counts ?? await source.counts())
    if (shardId >= sitemapIdCount(counts, urlLimit)) return []

    const start = shardId * urlLimit
    const end = start + urlLimit
    const gameStart = STATIC_PATHS.length
    const userStart = gameStart + counts.games
    const listStart = userStart + counts.users
    const staticSlice = sectionSlice(0, STATIC_PATHS.length, start, end)
    const gameSlice = sectionSlice(gameStart, counts.games, start, end)
    const userSlice = sectionSlice(userStart, counts.users, start, end)
    const listSlice = sectionSlice(listStart, counts.lists, start, end)

    const [gameRows, userRows, listRows] = await Promise.all([
        gameSlice ? collectWindow(source.games, row => ({ updatedAt: row.updatedAt, id: row.id }), pageSize, gameSlice.skip, gameSlice.take) : [],
        userSlice ? collectWindow(source.users, row => row.id, pageSize, userSlice.skip, userSlice.take) : [],
        listSlice ? collectWindow(source.lists, row => row.id, pageSize, listSlice.skip, listSlice.take) : [],
    ])

    const entries: SitemapEntry[] = []
    if (staticSlice) {
        for (const path of STATIC_PATHS.slice(staticSlice.skip, staticSlice.skip + staticSlice.take)) {
            entries.push({ url: `${base}${path}`, lastModified: now })
        }
    }
    entries.push(...assembleSitemap(base, { games: gameRows, users: userRows, lists: listRows }, now, false))
    if (entries.length > urlLimit) throw new Error('sitemap document exceeded the protocol url limit')
    return entries
}

export async function loadSitemap(base: string, options?: SitemapOptions, now = new Date()): Promise<SitemapEntry[]> {
    const urlLimit = normalizeUrlLimit(options?.urlLimit ?? SITEMAP_URL_LIMIT)
    const source = options?.source ?? drizzleSource()
    const counts = normalizeCounts(options?.counts ?? await source.counts())
    const entries: SitemapEntry[] = []
    for (let id = 0; id < sitemapIdCount(counts, urlLimit); id += 1) {
        entries.push(...await loadSitemapShard(base, id, { ...options, urlLimit, source, counts }, now))
    }
    return entries
}
