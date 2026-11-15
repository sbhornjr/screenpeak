import { describe, expect, it, vi, beforeEach } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'

const state = vi.hoisted(() => ({
    coverRows: [] as { list_id: string; position: number; games: { cover_image_url: string | null; slug: string | null } }[],
}))

const execute = vi.fn()

vi.mock('@/lib/db', () => ({
    db: {
        execute,
        select: () => ({
            from: () => ({
                innerJoin: () => ({
                    where: () => ({
                        orderBy: async () => state.coverRows,
                    }),
                }),
            }),
        }),
    },
}))

const gameQueries = await import('@/lib/queries/game')
const { SearchInputError } = gameQueries
const { searchListsByName } = await import('@/lib/queries/list')

const OWNER = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const LIST_A = '33333333-3333-4333-8333-333333333333'
const LIST_B = '44444444-4444-4444-8444-444444444444'

beforeEach(() => {
    execute.mockReset()
    state.coverRows = []
})

describe('searchListsByName', () => {
    it('refuses an empty or oversized query before querying', async () => {
        await expect(searchListsByName('  ', 20, null)).rejects.toBeInstanceOf(SearchInputError)
        await expect(searchListsByName('x'.repeat(101), 20, null)).rejects.toBeInstanceOf(SearchInputError)
        await expect(searchListsByName('roguelikes', 21, null)).rejects.toBeInstanceOf(SearchInputError)
        expect(execute).not.toHaveBeenCalled()
    })

    it('escapes %, _, and \\ via containsPattern rather than re-deriving the escaping', async () => {
        const containsPatternSpy = vi.spyOn(gameQueries, 'containsPattern')
        execute.mockResolvedValueOnce([])
        await searchListsByName('100%_x', 20, null)
        expect(containsPatternSpy).toHaveBeenCalledWith('100%_x')

        const rendered = new PgDialect().sqlToQuery(execute.mock.calls[0][0] as SQL)
        expect(rendered.params).toContain('%100\\%\\_x%')
    })

    it('includes a viewer-ownership clause with the real viewerId when signed in', async () => {
        execute.mockResolvedValueOnce([])
        await searchListsByName('roguelikes', 20, OWNER)

        const rendered = new PgDialect().sqlToQuery(execute.mock.calls[0][0] as SQL)
        expect(rendered.sql.toLowerCase()).toContain('or l.user_id')
        expect(rendered.params).toContain(OWNER)
    })

    it('omits the viewer-ownership clause entirely when signed out, rather than comparing to null', async () => {
        execute.mockResolvedValueOnce([])
        await searchListsByName('roguelikes', 20, null)

        const rendered = new PgDialect().sqlToQuery(execute.mock.calls[0][0] as SQL)
        expect(rendered.sql.toLowerCase()).not.toContain('or l.user_id')
        expect(rendered.params).not.toContain(null)
    })

    it('still passes viewerId through to getListLikeStats for a signed-out call (own-liked check stays false)', async () => {
        execute.mockResolvedValueOnce([
            { id: LIST_A, name: 'Roguelikes', description: null, last_activity: '2024-01-01 00:00:00+00', game_count: 0, owner_username: 'ada' },
        ])
        execute.mockResolvedValueOnce([]) // getListLikeStats: no like rows

        const results = await searchListsByName('roguelikes', 20, null)
        expect(results[0].viewer_has_liked).toBe(false)
        expect(results[0].like_count).toBe(0)
    })

    it('the base query carries different viewerId params per call (OWNER vs OTHER), pinning that viewerId reaches the query', async () => {
        const ownerRow = [{ id: LIST_A, name: 'Private List', description: null, last_activity: '2024-01-01 00:00:00+00', game_count: 0, owner_username: 'ada' }]

        execute.mockResolvedValueOnce(ownerRow)
        execute.mockResolvedValueOnce([]) // getListLikeStats for LIST_A: no likes
        await searchListsByName('private', 20, OWNER)
        const renderedOwner = new PgDialect().sqlToQuery(execute.mock.calls[0][0] as SQL)
        expect(renderedOwner.params).toContain(OWNER)

        execute.mockReset()
        execute.mockResolvedValueOnce([]) // the mocked db doesn't filter; this call stands in for a non-owner seeing no private rows
        await searchListsByName('private', 20, OTHER)
        const renderedOther = new PgDialect().sqlToQuery(execute.mock.calls[0][0] as SQL)
        expect(renderedOther.params).toContain(OTHER)
        expect(renderedOther.params).not.toContain(OWNER)
    })

    it('merges in covers and like stats for the matched ids, defaulting absent likes/covers to zero', async () => {
        execute.mockResolvedValueOnce([
            { id: LIST_A, name: 'Roguelikes', description: 'Hard games', last_activity: '2024-01-01 00:00:00+00', game_count: '3', owner_username: 'ada' },
            { id: LIST_B, name: 'Empty List', description: null, last_activity: '2024-01-02 00:00:00+00', game_count: '0', owner_username: 'bob' },
        ])
        state.coverRows = [
            { list_id: LIST_A, position: 0, games: { cover_image_url: 'https://images.igdb.com/a.jpg', slug: 'a-game' } },
        ]
        execute.mockResolvedValueOnce([
            { list_id: LIST_A, like_count: 5, viewer_has_liked: true },
        ])

        const results = await searchListsByName('list', 20, OWNER)

        expect(results).toEqual([
            {
                id: LIST_A,
                name: 'Roguelikes',
                description: 'Hard games',
                last_activity: '2024-01-01 00:00:00+00',
                game_count: 3,
                owner_username: 'ada',
                covers: [{ cover_image_url: 'https://images.igdb.com/a.jpg', slug: 'a-game' }],
                like_count: 5,
                viewer_has_liked: true,
            },
            {
                id: LIST_B,
                name: 'Empty List',
                description: null,
                last_activity: '2024-01-02 00:00:00+00',
                game_count: 0,
                owner_username: 'bob',
                covers: [],
                like_count: 0,
                viewer_has_liked: false,
            },
        ])
    })

    it('returns an empty array without querying covers/likes when there are no matches', async () => {
        execute.mockResolvedValueOnce([])
        const results = await searchListsByName('nomatch', 20, OWNER)
        expect(results).toEqual([])
        // Only the base query's execute call — getListLikeStats short-circuits on
        // an empty id list and getListCoverMap isn't called at all.
        expect(execute).toHaveBeenCalledTimes(1)
    })
})
