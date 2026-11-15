import { beforeEach, describe, expect, it, vi } from 'vitest'

const headerList = new Headers({ 'x-real-ip': '203.0.113.9' })
const headers = vi.fn(async () => headerList)
const getOptionalUser = vi.fn()
const consumeSearchRateLimit = vi.fn()
const queryGamesByName = vi.fn()
const queryTaxonomy = vi.fn()
const queryLibraryTaxonomy = vi.fn()
const queryTaxonomyName = vi.fn()
const queryUsersByUsername = vi.fn()
const queryListsByName = vi.fn()

vi.mock('next/headers', () => ({ headers }))
vi.mock('@/lib/auth', () => ({ getOptionalUser }))
vi.mock('@/lib/rate-limit', () => ({ consumeSearchRateLimit }))
vi.mock('@/lib/queries/game', () => ({
    searchGamesByName: queryGamesByName,
    searchTaxonomyTable: queryTaxonomy,
    searchLibraryTaxonomy: queryLibraryTaxonomy,
    getTaxonomyNameBySlug: queryTaxonomyName,
    SearchInputError: class SearchInputError extends Error {
        constructor(message: string) {
            super(message)
            this.name = 'SearchInputError'
        }
    },
}))
vi.mock('@/lib/queries/user', () => ({
    searchUsersByUsername: queryUsersByUsername,
}))
vi.mock('@/lib/queries/list', () => ({
    searchListsByName: queryListsByName,
}))

const { searchGamesByName, searchTaxonomyTable, searchLibraryTaxonomy, searchUsers, searchLists } = await import('@/app/search-actions')

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function uuid(n: number) {
    return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
}

beforeEach(() => {
    headers.mockClear()
    getOptionalUser.mockReset().mockResolvedValue({ id: USER, email: 'a@x.test' })
    consumeSearchRateLimit.mockReset().mockResolvedValue(undefined)
    queryGamesByName.mockReset().mockResolvedValue([])
    queryTaxonomy.mockReset().mockResolvedValue([])
    queryLibraryTaxonomy.mockReset().mockResolvedValue([])
    queryUsersByUsername.mockReset().mockResolvedValue([])
    queryListsByName.mockReset().mockResolvedValue([])
})

describe('search actions', () => {
    it('spends search:user:<uuid> after a successful parse', async () => {
        await searchGamesByName('hades')
        expect(consumeSearchRateLimit).toHaveBeenCalledWith(USER, headerList)
        expect(queryGamesByName).toHaveBeenCalledWith('hades', 20)
    })

    it('does not spend the budget on an empty query', async () => {
        await expect(searchGamesByName('')).resolves.toEqual([])
        expect(consumeSearchRateLimit).not.toHaveBeenCalled()
        expect(queryGamesByName).not.toHaveBeenCalled()
    })

    it('throws when more than 200 ids are sent and does not return an empty list', async () => {
        const ids = Array.from({ length: 201 }, (_, index) => uuid(index + 1))
        const result = await searchTaxonomyTable('developers', 'soft', ids).then(
            rows => rows,
            (error: unknown) => error,
        )
        expect(result).not.toEqual([])
        expect(result).toBeInstanceOf(Error)
        expect((result as Error).message).toMatch(/200/)
        expect(consumeSearchRateLimit).not.toHaveBeenCalled()
        expect(queryTaxonomy).not.toHaveBeenCalled()
    })

    it('searches the signed-in library without an id list', async () => {
        queryLibraryTaxonomy.mockResolvedValueOnce([{ id: uuid(1), name: 'Fixture Studio', slug: 'fixture-studio' }])
        await expect(searchLibraryTaxonomy('developers', 'fix')).resolves.toEqual([
            { id: uuid(1), name: 'Fixture Studio', slug: 'fixture-studio' },
        ])
        expect(consumeSearchRateLimit).toHaveBeenCalledWith(USER, headerList)
        expect(queryLibraryTaxonomy).toHaveBeenCalledWith(USER, 'developers', 'fix', 20)
    })

    it('returns nothing for a signed-out library search and does not spend the budget', async () => {
        getOptionalUser.mockResolvedValueOnce(null)
        await expect(searchLibraryTaxonomy('developers', 'fix')).resolves.toEqual([])
        expect(consumeSearchRateLimit).not.toHaveBeenCalled()
        expect(queryLibraryTaxonomy).not.toHaveBeenCalled()
    })

    it('searches users and shapes the rows', async () => {
        queryUsersByUsername.mockResolvedValueOnce([
            { id: uuid(1), username: 'hades_fan', avatar_url: null, follower_count: '3' },
        ])
        await expect(searchUsers('hades')).resolves.toEqual([
            { id: uuid(1), username: 'hades_fan', avatar_url: null, follower_count: 3 },
        ])
        expect(consumeSearchRateLimit).toHaveBeenCalledWith(USER, headerList)
        expect(queryUsersByUsername).toHaveBeenCalledWith('hades', 20)
    })

    it('does not spend the budget on an empty user search', async () => {
        await expect(searchUsers('')).resolves.toEqual([])
        expect(consumeSearchRateLimit).not.toHaveBeenCalled()
        expect(queryUsersByUsername).not.toHaveBeenCalled()
    })

    it('searches lists, passing the signed-in viewer id, and shapes the rows', async () => {
        queryListsByName.mockResolvedValueOnce([
            {
                id: uuid(2),
                name: 'Favorites',
                description: 'My favorite games',
                owner_username: 'hades_fan',
                last_activity: '2024-01-01 00:00:00.000+00',
                game_count: '2',
                like_count: '1',
                viewer_has_liked: true,
                covers: [{ cover_image_url: null, slug: 'hades' }],
            },
        ])
        await expect(searchLists('favorites')).resolves.toEqual([
            {
                id: uuid(2),
                name: 'Favorites',
                description: 'My favorite games',
                owner_username: 'hades_fan',
                last_activity: '2024-01-01 00:00:00.000+00',
                game_count: 2,
                like_count: 1,
                viewer_has_liked: true,
                covers: [{ cover_image_url: null, slug: 'hades' }],
            },
        ])
        expect(consumeSearchRateLimit).toHaveBeenCalledWith(USER, headerList)
        expect(queryListsByName).toHaveBeenCalledWith('favorites', 20, USER)
    })

    it('searches lists signed-out, passing a null viewer id', async () => {
        getOptionalUser.mockResolvedValueOnce(null)
        await searchLists('favorites')
        expect(consumeSearchRateLimit).toHaveBeenCalledWith(null, headerList)
        expect(queryListsByName).toHaveBeenCalledWith('favorites', 20, null)
    })

    it('does not spend the budget on an empty list search', async () => {
        await expect(searchLists('')).resolves.toEqual([])
        expect(consumeSearchRateLimit).not.toHaveBeenCalled()
        expect(queryListsByName).not.toHaveBeenCalled()
    })
})
