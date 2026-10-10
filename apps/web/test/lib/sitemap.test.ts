import { describe, expect, it } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import {
    SITEMAP_URL_LIMIT,
    assembleSitemap,
    gameRowAfterCursor,
    gamesAfterCursor,
    loadSitemap,
    loadSitemapShard,
    sectionSlice,
    sitemapIdCount,
    sitemapLastModified,
    type SitemapCounts,
    type SitemapSource,
} from '@/lib/queries/sitemap'

const BASE = 'https://screenpeak.example'
const PUBLIC_USER = '10000000-0000-0000-0000-000000000001'
const OTHER_USER = '10000000-0000-0000-0000-000000000002'
const TIE_A = '00000000-0000-0000-0000-0000000000c1'
const TIE_B = '00000000-0000-0000-0000-0000000000c2'

const games = [
    { id: TIE_B, slug: 'tie-b', updatedAt: '2026-03-01 00:00:00+00' },
    { id: '00000000-0000-0000-0000-0000000000a1', slug: 'older', updatedAt: '2026-01-01 00:00:00+00' },
    { id: '00000000-0000-0000-0000-0000000000b1', slug: 'newer', updatedAt: '2026-04-01 00:00:00+00' },
    { id: TIE_A, slug: 'tie-a', updatedAt: '2026-03-01 00:00:00+00' },
    { id: '00000000-0000-0000-0000-0000000000d1', slug: 'mid', updatedAt: '2026-02-01 00:00:00+00' },
]

const users = [
    { id: '10000000-0000-0000-0000-000000000003', username: 'c-fan' },
    { id: PUBLIC_USER, username: 'a-fan' },
    { id: OTHER_USER, username: 'b-fan' },
]

const lists = [
    { id: '20000000-0000-0000-0000-000000000003', userId: PUBLIC_USER, username: 'a-fan', updatedAt: '2026-04-01 00:00:00+00', isPublic: true },
    { id: '20000000-0000-0000-0000-000000000001', userId: PUBLIC_USER, username: 'a-fan', updatedAt: '2026-04-01 00:00:00+00', isPublic: true },
    { id: '20000000-0000-0000-0000-000000000009', userId: PUBLIC_USER, username: 'a-fan', updatedAt: '2026-04-01 00:00:00+00', isPublic: false },
    { id: '20000000-0000-0000-0000-000000000002', userId: PUBLIC_USER, username: 'a-fan', updatedAt: null, isPublic: true },
]

function orderedGames(cursor: { updatedAt: string; id: string } | null) {
    const eligible = cursor ? games.filter(game => gameRowAfterCursor(game, cursor)) : games
    return [...eligible].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : (a.id < b.id ? -1 : 1)))
}

function orderedById<T extends { id: string }>(rows: T[], cursor: string | null) {
    return rows.filter(row => cursor == null || row.id > cursor).sort((a, b) => (a.id < b.id ? -1 : 1))
}

function source(pageLog: unknown[] = []): SitemapSource {
    return {
        games: async (cursor, limit) => {
            pageLog.push(cursor)
            return orderedGames(cursor).slice(0, limit)
        },
        users: async (cursor, limit) => orderedById(users, cursor).slice(0, limit),
        lists: async (cursor, limit) => orderedById(lists.filter(list => list.isPublic === true), cursor).slice(0, limit),
        counts: async () => ({ games: games.length, users: users.length, lists: lists.filter(list => list.isPublic === true).length }),
    }
}

describe('sitemap', () => {
    it('parses database timestamps and drops an invalid one', () => {
        expect(sitemapLastModified('2026-04-01 00:00:00+00')?.toISOString()).toBe('2026-04-01T00:00:00.000Z')
        expect(sitemapLastModified('not-a-date')).toBeUndefined()
        expect(sitemapLastModified(null)).toBeUndefined()
    })

    it('includes seeded game slugs, omits private lists, and keeps lastModified valid', () => {
        const entries = assembleSitemap(BASE, {
            games,
            users: [
                { id: PUBLIC_USER, username: 'publicfan' },
                { id: OTHER_USER, username: 'otherfan' },
            ],
            lists: [
                { id: 'list-public', userId: PUBLIC_USER, updatedAt: '2026-04-01 00:00:00+00', isPublic: true },
                { id: 'list-secret', userId: PUBLIC_USER, updatedAt: '2026-04-01 00:00:00+00', isPublic: false },
                { id: 'list-orphan', userId: 'missing-user', updatedAt: null, isPublic: true },
            ],
        }, new Date('2026-10-10T00:00:00.000Z'))

        const urls = entries.map(entry => entry.url)
        expect(urls).toContain(`${BASE}/games/newer`)
        expect(urls).toContain(`${BASE}/games/older`)
        expect(urls).toContain(`${BASE}/user/publicfan/lists/list-public`)
        expect(urls.some(url => url.includes('list-secret'))).toBe(false)
        expect(urls.some(url => url.includes('list-orphan'))).toBe(false)
        const game = entries.find(entry => entry.url.endsWith('/games/newer'))
        expect(game?.lastModified).toBeInstanceOf(Date)
        expect(Number.isNaN(game!.lastModified!.getTime())).toBe(false)
        expect(game!.lastModified!.toISOString()).toBe('2026-04-01T00:00:00.000Z')
    })

    it('keeps a tied updated_at when the id is greater, and drops the cursor row itself', () => {
        const cursor = { updatedAt: '2026-03-01 00:00:00+00', id: TIE_A }
        expect(gameRowAfterCursor({ updatedAt: cursor.updatedAt, id: TIE_B }, cursor)).toBe(true)
        expect(gameRowAfterCursor({ updatedAt: cursor.updatedAt, id: TIE_A }, cursor)).toBe(false)
        expect(gameRowAfterCursor({ updatedAt: '2026-04-01 00:00:00+00', id: TIE_B }, cursor)).toBe(false)
        expect(gameRowAfterCursor({ updatedAt: '2026-01-01 00:00:00+00', id: TIE_A }, cursor)).toBe(true)
    })

    it('renders the game keyset as updated_at < cursor or (updated_at = cursor and id > cursor)', () => {
        const rendered = new PgDialect().sqlToQuery(gamesAfterCursor({ updatedAt: '2026-03-01 00:00:00+00', id: TIE_A }))
        const text = rendered.sql.replace(/\s+/g, ' ')
        expect(text).toContain('"updated_at" <')
        expect(text).toContain('"updated_at" =')
        expect(text).toContain('"id" >')
        expect(rendered.params).toEqual(['2026-03-01 00:00:00+00', '2026-03-01 00:00:00+00', TIE_A])
    })

    it('pages games with the keyset predicate and does not stop after the first full page', async () => {
        const cursors: unknown[] = []
        const first = await loadSitemap(BASE, { pageSize: 2, source: source(cursors) })
        const second = await loadSitemap(BASE, { pageSize: 2, source: source() })
        const gameUrls = first.filter(entry => /\/games\/[^/]+$/.test(new URL(entry.url).pathname)).map(entry => entry.url)
        expect(gameUrls).toEqual([
            `${BASE}/games/newer`,
            `${BASE}/games/tie-a`,
            `${BASE}/games/tie-b`,
            `${BASE}/games/mid`,
            `${BASE}/games/older`,
        ])
        expect(second.map(entry => entry.url)).toEqual(first.map(entry => entry.url))
        expect(cursors).toEqual([
            null,
            { updatedAt: '2026-03-01 00:00:00+00', id: TIE_A },
            { updatedAt: '2026-02-01 00:00:00+00', id: '00000000-0000-0000-0000-0000000000d1' },
        ])
    })

    it('pages users and lists across a full page in id order', async () => {
        const entries = await loadSitemap(BASE, { pageSize: 2, source: source() })
        expect(entries.filter(entry => entry.url.includes('/user/') && !entry.url.includes('/lists/')).map(entry => entry.url)).toEqual([
            `${BASE}/user/a-fan`,
            `${BASE}/user/b-fan`,
            `${BASE}/user/c-fan`,
        ])
        expect(entries.filter(entry => entry.url.includes('/lists/')).map(entry => entry.url)).toEqual([
            `${BASE}/user/a-fan/lists/20000000-0000-0000-0000-000000000001`,
            `${BASE}/user/a-fan/lists/20000000-0000-0000-0000-000000000002`,
            `${BASE}/user/a-fan/lists/20000000-0000-0000-0000-000000000003`,
        ])
    })

    it('splits a catalogue into protocol-sized documents without dropping or repeating urls', async () => {
        const counts: SitemapCounts = { games: games.length, users: users.length, lists: 3 }
        expect(sitemapIdCount(counts, 4)).toBe(4)
        expect(sitemapIdCount({ games: 0, users: 0, lists: 0 })).toBe(1)
        expect(sectionSlice(3, 5, 4, 8)).toEqual({ skip: 1, take: 4 })

        const shards = await Promise.all([0, 1, 2, 3].map(id => loadSitemapShard(BASE, id, {
            pageSize: 2,
            urlLimit: 4,
            source: source(),
        })))
        for (const shard of shards) expect(shard.length).toBeLessThanOrEqual(4)
        expect(shards.flat().map(entry => entry.url)).toEqual((await loadSitemap(BASE, { pageSize: 2, source: source() })).map(entry => entry.url))
        expect(new Set(shards.flat().map(entry => entry.url)).size).toBe(shards.flat().length)
        expect(await loadSitemapShard(BASE, 9, { urlLimit: 4, source: source() })).toEqual([])
        expect(SITEMAP_URL_LIMIT).toBe(50_000)
    })

    it('does not publish a successful sitemap with an empty game section when the database fails', async () => {
        const failing: SitemapSource = {
            games: async () => { throw new Error('database unavailable') },
            users: async () => [{ id: PUBLIC_USER, username: 'publicfan' }],
            lists: async () => [],
            counts: async () => ({ games: 1, users: 1, lists: 0 }),
        }
        await expect(loadSitemap(BASE, { source: failing })).rejects.toThrow('database unavailable')
    })

    it('keeps the static pages when the catalogue is genuinely empty', async () => {
        const entries = await loadSitemap(BASE, {
            source: {
                games: async () => [],
                users: async () => [],
                lists: async () => [],
                counts: async () => ({ games: 0, users: 0, lists: 0 }),
            },
        })
        expect(entries.map(entry => entry.url)).toEqual([BASE, `${BASE}/games`, `${BASE}/explore`])
    })
})
