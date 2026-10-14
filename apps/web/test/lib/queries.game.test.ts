import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockDb = { select: vi.fn(), execute: vi.fn() }
vi.mock('@/lib/db', () => ({ db: mockDb }))

const { getGameTaxonomy, getDistinctEsrbRatings, getDeveloperNameMap, getHeroGame } = await import('@/lib/queries/game')

// Most of lib/queries/* is a thin pass-through to Drizzle and not worth
// pinning. These three do real work on the result set — de-duping + sorting,
// building a first-wins map, tolerating missing joins — so they get covered.
// db (a DB boundary) is mocked with just the chain each function calls.

beforeEach(() => { mockDb.select.mockReset(); mockDb.execute.mockReset() })

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

    it('propagates a database error instead of an empty taxonomy', async () => {
        mockDb.select.mockImplementation(() => ({
            from: () => ({ innerJoin: () => ({ where: () => Promise.reject(new Error('database unavailable')) }) }),
        }))
        await expect(getGameTaxonomy('game-1')).rejects.toThrow('database unavailable')
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

describe('getHeroGame', () => {
    const shot = 'https://images.igdb.com/igdb/image/upload/t_screenshot_huge/sc.jpg'
    const row = {
        id: '00000000-0000-0000-0000-0000000000a1',
        name: 'Hero',
        slug: 'hero',
        cover_image_url: null,
        artwork_image_url: null,
        screenshots: `{${shot}}`,
        released: null,
        avg_ngplus_rating: '8.00',
        rating_count: 3,
    }

    it('logs a query failure and returns null', async () => {
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        mockDb.execute.mockRejectedValue(new Error('database unavailable'))
        await expect(getHeroGame()).resolves.toBeNull()
        expect(String(errSpy.mock.calls[0]?.[0])).toContain('hero game query failed')
    })

    it('returns null without an error log when no game is eligible', async () => {
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        mockDb.execute.mockResolvedValue([])
        await expect(getHeroGame()).resolves.toBeNull()
        expect(errSpy).not.toHaveBeenCalled()
    })

    it('accepts a postgres array literal from the driver', async () => {
        mockDb.execute.mockResolvedValue([row])
        await expect(getHeroGame()).resolves.toMatchObject({ slug: 'hero', screenshots: [shot], artwork_image_url: null })
    })
})
