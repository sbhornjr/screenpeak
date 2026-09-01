import { describe, it, expect, vi } from 'vitest'
import { getGameTaxonomy, getDistinctEsrbRatings, getDeveloperNameMap } from '@/lib/queries/game'

// Most of lib/queries/* is a thin pass-through to Supabase and not worth
// pinning. These three do real work on the result set — flattening embedded
// rows, de-duping + sorting, building a first-wins map — so they get covered.
// The Supabase client (a DB boundary) is faked with just the chain each
// function actually calls.

describe('getGameTaxonomy', () => {
    it('flattens embedded taxonomy rows and tolerates missing sections', async () => {
        const byTable: Record<string, { data: unknown }> = {
            game_genres: { data: [{ genres: [{ id: 'g1', name: 'RPG', slug: 'rpg' }] }] },
            game_platforms: { data: [{ platforms: [{ id: 'p1', name: 'PC', slug: 'pc' }] }] },
            game_developers: { data: null },
            game_publishers: { data: [{ publishers: [{ id: 'pub1', name: 'Larian', slug: 'larian' }] }] },
        }
        const supabase = {
            from: (table: string) => ({ select: () => ({ eq: async () => byTable[table] }) }),
        }

        const taxonomy = await getGameTaxonomy(supabase as never, 'game-1')

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
        const supabase = {
            from: () => ({
                select: async () => ({
                    data: [
                        { esrb_rating: 'Teen' },
                        { esrb_rating: 'Mature' },
                        { esrb_rating: 'Teen' },
                        { esrb_rating: null },
                        { esrb_rating: 'Everyone' },
                    ],
                }),
            }),
        }

        await expect(getDistinctEsrbRatings(supabase as never)).resolves.toEqual([
            'Everyone',
            'Mature',
            'Teen',
        ])
    })

    it('returns an empty array when the query yields no data', async () => {
        const supabase = { from: () => ({ select: async () => ({ data: null }) }) }

        await expect(getDistinctEsrbRatings(supabase as never)).resolves.toEqual([])
    })
})

describe('getDeveloperNameMap', () => {
    function supabaseReturning(result: { data: unknown; error: unknown }) {
        return { from: () => ({ select: () => ({ in: async () => result }) }) }
    }

    it('maps game_id to developer name, keeping the first seen and normalising keys to strings', async () => {
        const supabase = supabaseReturning({
            data: [
                { game_id: 'a', developers: { name: 'Supergiant' } },
                { game_id: 'a', developers: { name: 'Should Be Ignored' } },
                { game_id: 3, developers: { name: 'Numeric Key Studio' } },
                { game_id: 'b', developers: null },
            ],
            error: null,
        })

        const map = await getDeveloperNameMap(supabase as never, ['a', 3, 'b'])

        expect(map.get('a')).toBe('Supergiant')
        expect(map.get('3')).toBe('Numeric Key Studio')
        expect(map.get('b')).toBeNull()
        expect(map.size).toBe(3)
    })

    it('logs and returns an empty map when the chunk query errors', async () => {
        const supabase = supabaseReturning({ data: null, error: { message: 'boom' } })
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

        const map = await getDeveloperNameMap(supabase as never, ['a'])

        expect(map.size).toBe(0)
        expect(errSpy).toHaveBeenCalled()
    })
})
