import { describe, expect, it, vi } from 'vitest'

const execute = vi.fn()
const select = vi.fn()
vi.mock('@/lib/db', () => ({ db: { execute, select } }))

const gameQueries = await import('@/lib/queries/game')
const { SearchInputError } = gameQueries
const { searchUsersByUsername } = await import('@/lib/queries/user')

const USER = '22222222-2222-4222-8222-222222222222'

describe('searchUsersByUsername', () => {
    it('refuses an empty or oversized query before querying', async () => {
        await expect(searchUsersByUsername('   ')).rejects.toBeInstanceOf(SearchInputError)
        await expect(searchUsersByUsername('x'.repeat(101))).rejects.toBeInstanceOf(SearchInputError)
        await expect(searchUsersByUsername('horn', 21)).rejects.toBeInstanceOf(SearchInputError)
        expect(execute).not.toHaveBeenCalled()
    })

    it('returns follower_count as a number for a mocked row', async () => {
        execute.mockResolvedValueOnce([{ id: USER, username: 'hornflakes', avatar_url: null, follower_count: '3' }])
        const [row] = await searchUsersByUsername('horn')
        expect(row).toEqual({ id: USER, username: 'hornflakes', avatar_url: null, follower_count: 3 })
    })

    it('escapes %, _, and \\ via containsPattern rather than re-deriving the escaping', async () => {
        const containsPatternSpy = vi.spyOn(gameQueries, 'containsPattern')
        execute.mockResolvedValueOnce([])
        await searchUsersByUsername('100%_x')
        expect(containsPatternSpy).toHaveBeenCalledWith('100%_x')
    })
})
