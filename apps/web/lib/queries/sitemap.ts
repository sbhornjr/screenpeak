import { and, asc, desc, eq, gt, lt, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import { games, lists, users } from '@/db/schema'
import { parseDbTimestamp } from '@/lib/dates'

// One page at a time. A single .limit(5000) is not a guarantee — PostgREST
// caps rows, and an unordered cap shifts between requests. A short page ends
// the scan, so the catalogue is not silently truncated.
export const SITEMAP_PAGE_SIZE = 1000

export type SitemapEntry = { url: string; lastModified?: Date }

export type SitemapGame = { id: string; slug: string; updatedAt: string }
export type SitemapUser = { id: string; username: string }
export type SitemapList = { id: string; userId: string; updatedAt: string | null; isPublic: boolean | null }
export type GameCursor = { updatedAt: string; id: string }

export type SitemapSource = {
    games: (cursor: GameCursor | null, limit: number) => Promise<SitemapGame[]>
    users: (cursor: string | null, limit: number) => Promise<SitemapUser[]>
    lists: (cursor: string | null, limit: number) => Promise<SitemapList[]>
}

export function sitemapLastModified(value: string | null | undefined): Date | undefined {
    if (!value) return undefined
    const date = parseDbTimestamp(value)
    return Number.isNaN(date.getTime()) ? undefined : date
}

export function assembleSitemap(base: string, data: {
    games: { slug: string; updatedAt: string }[]
    users: { id: string; username: string }[]
    lists: SitemapList[]
}, now = new Date()): SitemapEntry[] {
    const usernameById = new Map(data.users.map(user => [user.id, user.username]))
    const entries: SitemapEntry[] = [
        { url: base, lastModified: now },
        { url: `${base}/games`, lastModified: now },
        { url: `${base}/explore`, lastModified: now },
    ]
    for (const game of data.games) {
        const lastModified = sitemapLastModified(game.updatedAt)
        entries.push(lastModified
            ? { url: `${base}/games/${game.slug}`, lastModified }
            : { url: `${base}/games/${game.slug}` })
    }
    for (const user of data.users) entries.push({ url: `${base}/user/${user.username}` })
    for (const list of data.lists) {
        if (list.isPublic !== true) continue
        const username = usernameById.get(list.userId)
        if (!username) continue
        const lastModified = sitemapLastModified(list.updatedAt)
        entries.push(lastModified
            ? { url: `${base}/user/${username}/lists/${list.id}`, lastModified }
            : { url: `${base}/user/${username}/lists/${list.id}` })
    }
    return entries
}

async function collectPages<T, C>(
    fetchPage: (cursor: C | null, limit: number) => Promise<T[]>,
    cursorOf: (row: T) => C,
    pageSize: number,
): Promise<T[]> {
    if (!Number.isInteger(pageSize) || pageSize < 1) throw new Error('sitemap page size must be a positive integer')
    const rows: T[] = []
    let cursor: C | null = null
    for (;;) {
        const page = await fetchPage(cursor, pageSize)
        if (page.length > pageSize) throw new Error('sitemap page exceeded the requested limit')
        rows.push(...page)
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
            const filtered = cursor
                ? query.where(or(
                    lt(games.updatedAt, cursor.updatedAt),
                    and(eq(games.updatedAt, cursor.updatedAt), gt(games.id, cursor.id)),
                ))
                : query
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
        }).from(lists).where(cursor
            ? and(eq(lists.isPublic, true), gt(lists.id, cursor))
            : eq(lists.isPublic, true),
        ).orderBy(asc(lists.id)).limit(limit),
    }
}

export async function loadSitemap(base: string, options?: {
    pageSize?: number
    source?: SitemapSource
}): Promise<SitemapEntry[]> {
    const pageSize = options?.pageSize ?? SITEMAP_PAGE_SIZE
    const source = options?.source ?? drizzleSource()
    // A database error rejects the whole sitemap. It must not come back as a
    // successful document that simply left the games out.
    const [gameRows, userRows, listRows] = await Promise.all([
        collectPages(source.games, row => ({ updatedAt: row.updatedAt, id: row.id }), pageSize),
        collectPages(source.users, row => row.id, pageSize),
        collectPages(source.lists, row => row.id, pageSize),
    ])
    return assembleSitemap(base, { games: gameRows, users: userRows, lists: listRows })
}
