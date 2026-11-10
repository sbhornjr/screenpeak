import { describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'

const execute = vi.fn()
const select = vi.fn()
vi.mock('@/lib/db', () => ({ db: { execute, select } }))

const { containsPattern, searchGamesByName, SearchInputError } = await import('@/lib/queries/game')
const { toGameSearchHit } = await import('@/lib/search-shape')
const { parseGameSearchQuery, parseTaxonomySearchQuery } = await import('@/lib/screen-query')

const GAME = '11111111-1111-4111-8111-111111111111'

describe('containsPattern', () => {
    it('treats %, _, and backslash as literals inside a contains match', () => {
        expect(containsPattern('100%')).toBe('%100\\%%')
        expect(containsPattern('A_B')).toBe('%A\\_B%')
        expect(containsPattern('a\\b')).toBe('%a\\\\b%')
    })
})

describe('searchGamesByName', () => {
    it('refuses an empty or oversized query before querying', async () => {
        await expect(searchGamesByName('   ')).rejects.toBeInstanceOf(SearchInputError)
        await expect(searchGamesByName('x'.repeat(101))).rejects.toBeInstanceOf(SearchInputError)
        await expect(searchGamesByName('hades', 21)).rejects.toBeInstanceOf(SearchInputError)
        expect(execute).not.toHaveBeenCalled()
    })

    it('returns community avg_rating as a number and throws when the query fails', async () => {
        execute.mockResolvedValueOnce([{
            id: GAME,
            name: 'Hades',
            slug: 'hades',
            cover_image_url: 'https://images.igdb.com/igdb/image/upload/t_thumb/co1.jpg',
            released: '2020-09-17',
            avg_rating: '9.50',
        }])
        const [row] = await searchGamesByName('hades')
        expect(row.avg_rating).toBe(9.5)
        expect(typeof row.avg_rating).toBe('number')
        const rendered = new PgDialect().sqlToQuery(execute.mock.calls[0][0] as SQL)
        expect(rendered.sql.toLowerCase()).toContain('ilike')
        expect(rendered.sql.toLowerCase()).toContain('escape')
        expect(rendered.params).toContain('%hades%')
        expect(rendered.params).toContain('\\')

        execute.mockRejectedValueOnce(new Error('database unavailable'))
        await expect(searchGamesByName('hades')).rejects.toThrow('database unavailable')
    })
})

describe('toGameSearchHit', () => {
    it('rewrites an IGDB cover to t_cover_big_2x and drops a non-IGDB url', () => {
        expect(toGameSearchHit({
            id: GAME,
            name: 'Hades',
            slug: 'hades',
            cover_image_url: 'https://images.igdb.com/igdb/image/upload/t_thumb/co123.jpg',
            released: '2020-09-17',
            avg_rating: 9,
        }).cover_image_url).toBe('https://images.igdb.com/igdb/image/upload/t_cover_big_2x/co123.jpg')

        expect(toGameSearchHit({
            id: GAME,
            name: 'Hades',
            slug: 'hades',
            cover_image_url: 'https://media.rawg.io/co.jpg',
            released: null,
            avg_rating: null,
        }).cover_image_url).toBeNull()
    })
})

describe('search query parsers', () => {
    it('defaults limit and names a bad value', () => {
        const parsed = parseGameSearchQuery(new URLSearchParams('q=  hades  '))
        expect(parsed).toEqual({ ok: true, query: { q: 'hades', limit: 20 } })

        const empty = parseGameSearchQuery(new URLSearchParams('q='))
        expect(empty.ok).toBe(false)
        if (!empty.ok) expect(empty.message).toMatch(/q/)

        const huge = parseGameSearchQuery(new URLSearchParams('q=hades&limit=21'))
        expect(huge.ok).toBe(false)
        if (!huge.ok) expect(huge.message).toMatch(/limit/)

        const fraction = parseGameSearchQuery(new URLSearchParams('q=hades&limit=1.5'))
        expect(fraction.ok).toBe(false)
    })

    it('rejects an unknown taxonomy table and a non-uuid id', () => {
        const badTable = parseTaxonomySearchQuery('genres', new URLSearchParams('q=from'))
        expect(badTable.ok).toBe(false)
        if (!badTable.ok) expect(badTable.message).toMatch(/table/)

        const badId = parseTaxonomySearchQuery('developers', new URLSearchParams('q=from&ids=not-a-uuid'))
        expect(badId.ok).toBe(false)
        if (!badId.ok) expect(badId.message).toMatch(/ids/)

        const ok = parseTaxonomySearchQuery('publishers', new URLSearchParams(`q=from&ids=${GAME}`))
        expect(ok).toEqual({ ok: true, query: { table: 'publishers', q: 'from', limit: 20, ids: [GAME] } })
    })
})
