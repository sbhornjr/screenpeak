import { describe, it, expect, vi, beforeEach } from 'vitest'

// loadGamePage is orchestration over lib/queries/* (its data layer), so those
// functions are the boundary here — each returns the shape the real query does.
const q = {
    getGameBySlug: vi.fn(), getGameTaxonomy: vi.fn(),
    getGameRatingsStats: vi.fn(), getUserRatingReviewForGame: vi.fn(),
    getLibraryEntry: vi.fn(), getUserLists: vi.fn(), getGameListMembership: vi.fn(),
    getDefaultListPublic: vi.fn(),
}
vi.mock('@/lib/queries/game', () => ({ getGameBySlug: q.getGameBySlug, getGameTaxonomy: q.getGameTaxonomy }))
vi.mock('@/lib/queries/review', () => ({ getGameRatingsStats: q.getGameRatingsStats, getUserRatingReviewForGame: q.getUserRatingReviewForGame }))
vi.mock('@/lib/queries/library', () => ({ getLibraryEntry: q.getLibraryEntry }))
vi.mock('@/lib/queries/list', () => ({ getUserLists: q.getUserLists, getGameListMembership: q.getGameListMembership }))
vi.mock('@/lib/queries/user', () => ({ getDefaultListPublic: q.getDefaultListPublic }))

const { loadGamePage } = await import('@/lib/loaders/game-page')

const GAME = {
    id: 'game-1', name: "Baldur's Gate III", slug: 'baldurs-gate-3', igdb_id: 1942,
    cover_image_url: 'https://images.igdb.com/igdb/image/upload/t_cover_big/x.jpg',
    artwork_image_url: 'https://images.igdb.com/igdb/image/upload/t_1080p/y.jpg',
    released: '2023-08-03',
    description: 'Gather your party.', esrb_rating: 'Mature', reddit_url: null, screenshots: ['a.jpg'],
    created_at: '2026-01-01 00:00:00+00',
}
// The real query selects columns the contract doesn't declare (steam_appid) —
// the loader must send only the contract's fields.
const GAME_ROW = { ...GAME, steam_appid: 1086940 }
const TAXONOMY = { genres: [{ id: 'g1', name: 'RPG', slug: 'rpg' }], platforms: [], developers: [], publishers: [] }
const STATS = { total_ratings: 3, total_reviews: 2, avg_rating: 9.67, rating_10: 2, rating_9: 1 }
const REVIEW = { user_id: 'viewer-1', rating: 10, review: 'Best game', created_at: '2026-02-01 00:00:00+00', updated_at: '2026-02-01 00:00:00+00', users: { username: 'me', display_name: 'Me', avatar_url: '' } }
// Rows as get_user_lists returns them: uuid ids, many more columns than the page needs
const LIST_ROWS = [
    { id: 'list-a', name: 'Favourites', game_count: 4, description: 'x', is_public: false, is_default: true, is_pinned: false, created_at: 't', last_activity: 't', owner_username: 'me', owner_avatar_url: null, owner_id: 'viewer-1' },
    { id: 'list-b', name: 'Backlog', game_count: 0, description: '', is_public: true, is_default: false, is_pinned: false, created_at: 't', last_activity: 't', owner_username: 'me', owner_avatar_url: null, owner_id: 'viewer-1' },
]

beforeEach(() => {
    Object.values(q).forEach(fn => fn.mockReset())
    q.getGameBySlug.mockResolvedValue(GAME_ROW)
    q.getGameTaxonomy.mockResolvedValue(TAXONOMY)
    q.getGameRatingsStats.mockResolvedValue(STATS)
    q.getUserRatingReviewForGame.mockResolvedValue(REVIEW)
    // Drizzle returns numeric(8,1) as a string
    q.getLibraryEntry.mockResolvedValue({ id: 'le-1', status: 'completed', completed_all_achievements: true, hours_played: '112.5', play_count: 2 })
    q.getUserLists.mockResolvedValue(LIST_ROWS)
    q.getGameListMembership.mockResolvedValue(new Set(['list-a']))   // the real query returns a Set
    q.getDefaultListPublic.mockResolvedValue(false)
})

const VIEWER_QUERIES = ['getUserRatingReviewForGame', 'getLibraryEntry', 'getUserLists', 'getGameListMembership', 'getDefaultListPublic'] as const

describe('loadGamePage', () => {
    it('returns null for an unknown slug without running any other query', async () => {
        q.getGameBySlug.mockResolvedValue(null)

        await expect(loadGamePage('nope', 'viewer-1')).resolves.toBeNull()
        expect(q.getGameTaxonomy).not.toHaveBeenCalled()
        for (const name of VIEWER_QUERIES) expect(q[name]).not.toHaveBeenCalled()
    })

    it('signed out: returns the game, taxonomy and stats with viewer null — and runs no viewer queries', async () => {
        const data = await loadGamePage('baldurs-gate-3', null)

        expect(data).toEqual({ game: GAME, taxonomy: TAXONOMY, stats: STATS, viewer: null })
        for (const name of VIEWER_QUERIES) expect(q[name]).not.toHaveBeenCalled()
    })

    it('signed in: assembles the viewer block from their own rows', async () => {
        const data = await loadGamePage('baldurs-gate-3', 'viewer-1')

        expect(data!.viewer).toEqual({
            review: REVIEW,
            libraryEntry: { id: 'le-1', status: 'completed', completed_all_achievements: true, hours_played: 112.5, play_count: 2 },
            lists: [
                { id: 'list-a', name: 'Favourites', game_count: 4 },
                { id: 'list-b', name: 'Backlog', game_count: 0 },
            ],
            listIdsGameIsIn: ['list-a'],
            defaultListPrivacy: false,
        })
        expect(q.getUserRatingReviewForGame).toHaveBeenCalledWith('game-1', 'viewer-1')
        expect(q.getLibraryEntry).toHaveBeenCalledWith('viewer-1', 'game-1')
        expect(q.getUserLists).toHaveBeenCalledWith('viewer-1', true)                  // private lists too: they're the viewer's own
        expect(q.getGameListMembership).toHaveBeenCalledWith('game-1', ['list-a', 'list-b'])
        expect(q.getDefaultListPublic).toHaveBeenCalledWith('viewer-1')
    })

    it('sends only the contract’s game fields — an extra column the query selects never leaks into the API', async () => {
        const data = await loadGamePage('baldurs-gate-3', null)

        expect(Object.keys(data!.game).sort()).toEqual(Object.keys(GAME).sort())
        expect(data!.game).not.toHaveProperty('steam_appid')
    })

    it('survives a JSON round trip unchanged (no Set, no Date — what the API actually sends)', async () => {
        const data = await loadGamePage('baldurs-gate-3', 'viewer-1')

        expect(JSON.parse(JSON.stringify(data))).toEqual(data)
    })

    it('defaults: no library entry, no lists, lists default public when the setting is unknown', async () => {
        q.getLibraryEntry.mockResolvedValue(null)
        q.getUserLists.mockResolvedValue([])
        q.getGameListMembership.mockResolvedValue(new Set())
        q.getDefaultListPublic.mockResolvedValue(null)
        q.getUserRatingReviewForGame.mockResolvedValue(null)

        const { viewer } = (await loadGamePage('baldurs-gate-3', 'viewer-1'))!

        expect(viewer).toEqual({ review: null, libraryEntry: null, lists: [], listIdsGameIsIn: [], defaultListPrivacy: true })
    })

    it('does not report a database outage as an unknown game', async () => {
        q.getGameBySlug.mockRejectedValueOnce(new Error('database unavailable'))
        await expect(loadGamePage('example', null)).rejects.toThrow('database unavailable')
    })

    it('does not report a database outage as an empty taxonomy', async () => {
        q.getGameTaxonomy.mockRejectedValueOnce(new Error('database unavailable'))
        await expect(loadGamePage('example', null)).rejects.toThrow('database unavailable')
    })

    it('does not report a ratings outage as an empty scoreboard', async () => {
        q.getGameRatingsStats.mockRejectedValueOnce(new Error('database unavailable'))
        await expect(loadGamePage('example', null)).rejects.toThrow('database unavailable')
    })

    it('does not report a library outage as an empty save', async () => {
        q.getLibraryEntry.mockRejectedValueOnce(new Error('database unavailable'))
        await expect(loadGamePage('baldurs-gate-3', 'viewer-1')).rejects.toThrow('database unavailable')
    })

    it('does not report a lists outage as no lists', async () => {
        q.getUserLists.mockRejectedValueOnce(new Error('database unavailable'))
        await expect(loadGamePage('baldurs-gate-3', 'viewer-1')).rejects.toThrow('database unavailable')
    })

    it('normalises nullable library columns (hours, 100%, play count) to the contract', async () => {
        q.getLibraryEntry.mockResolvedValue({ id: 'le-1', status: 'backlog', completed_all_achievements: null, hours_played: null, play_count: null })

        const { viewer } = (await loadGamePage('baldurs-gate-3', 'viewer-1'))!

        expect(viewer!.libraryEntry).toEqual({ id: 'le-1', status: 'backlog', completed_all_achievements: false, hours_played: null, play_count: 1 })
    })
})
