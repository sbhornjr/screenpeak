import { describe, expect, it } from 'vitest'
import { assembleSitemap, loadSitemap, sitemapLastModified, type SitemapSource } from '@/lib/queries/sitemap'

const BASE = 'https://screenpeak.example'
const PUBLIC_USER = '10000000-0000-0000-0000-000000000001'
const OTHER_USER = '10000000-0000-0000-0000-000000000002'

const games = [
    { id: '00000000-0000-0000-0000-0000000000b1', slug: 'newer', updatedAt: '2026-04-01 00:00:00+00' },
    { id: '00000000-0000-0000-0000-0000000000c1', slug: 'tie-a', updatedAt: '2026-03-01 00:00:00+00' },
    { id: '00000000-0000-0000-0000-0000000000c2', slug: 'tie-b', updatedAt: '2026-03-01 00:00:00+00' },
    { id: '00000000-0000-0000-0000-0000000000d1', slug: 'mid', updatedAt: '2026-02-01 00:00:00+00' },
    { id: '00000000-0000-0000-0000-0000000000a1', slug: 'older', updatedAt: '2026-01-01 00:00:00+00' },
]

function pagingSource(pageLog: unknown[]): SitemapSource {
    return {
        games: async (cursor, limit) => {
            pageLog.push(cursor)
            const start = cursor
                ? games.findIndex(game => game.updatedAt === cursor.updatedAt && game.id === cursor.id) + 1
                : 0
            return games.slice(start, start + limit)
        },
        users: async () => [{ id: PUBLIC_USER, username: 'publicfan' }],
        lists: async () => [],
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

    it('pages games deterministically and does not stop after the first full page', async () => {
        const cursors: unknown[] = []
        const first = await loadSitemap(BASE, { pageSize: 2, source: pagingSource(cursors) })
        const second = await loadSitemap(BASE, { pageSize: 2, source: pagingSource([]) })
        const gameUrls = first.filter(entry => entry.url.includes('/games/')).map(entry => entry.url)
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
            { updatedAt: '2026-03-01 00:00:00+00', id: '00000000-0000-0000-0000-0000000000c1' },
            { updatedAt: '2026-02-01 00:00:00+00', id: '00000000-0000-0000-0000-0000000000d1' },
        ])
    })

    it('does not publish a successful sitemap with an empty game section when the database fails', async () => {
        const source: SitemapSource = {
            games: async () => { throw new Error('database unavailable') },
            users: async () => [{ id: PUBLIC_USER, username: 'publicfan' }],
            lists: async () => [],
        }
        await expect(loadSitemap(BASE, { source })).rejects.toThrow('database unavailable')
    })

    it('keeps the static pages when the catalogue is genuinely empty', async () => {
        const entries = await loadSitemap(BASE, {
            source: { games: async () => [], users: async () => [], lists: async () => [] },
        })
        expect(entries.map(entry => entry.url)).toEqual([BASE, `${BASE}/games`, `${BASE}/explore`])
    })
})
