import { describe, it, expect, vi, beforeEach } from 'vitest'

// Loaders orchestrate lib/queries. These mocks are the data those queries return.
// Each test asserts the object a caller would serialize, including what a
// private library, loadout, or list must not contain.
const userQ = {
    getUserIdFromUsername: vi.fn(),
    getAccountSettings: vi.fn(),
    getFullProfile: vi.fn(),
    getFollowers: vi.fn(),
    getFollowing: vi.fn(),
    getProfileSummaryByUsername: vi.fn(),
    getFeaturedLoadout: vi.fn(),
    getCurrentLoadoutIdentity: vi.fn(),
    getProfileById: vi.fn(),
}
const libraryQ = {
    getLibraryFacets: vi.fn(),
    getLibraryEntries: vi.fn(),
    getLibraryStatusBreakdown: vi.fn(),
}
const gameQ = {
    queryGames: vi.fn(),
    getDeveloperNameMap: vi.fn(),
    getAllGenres: vi.fn(),
    getAllPlatforms: vi.fn(),
    getDistinctEsrbRatings: vi.fn(),
    getHeroGame: vi.fn(),
}
const listQ = {
    getUserLists: vi.fn(),
    getLikedLists: vi.fn(),
    getListCoverMap: vi.fn(),
    getListLikes: vi.fn(),
    getListById: vi.fn(),
    getListGames: vi.fn(),
}
const reviewQ = {
    getRecentReviews: vi.fn(),
    getUserRatings: vi.fn(),
    getAvgRatingsForGames: vi.fn(),
    getUserRatingsForGames: vi.fn(),
    getUserRatingsReviewsPage: vi.fn(),
    getUserRatingsReviewsCounts: vi.fn(),
    getRecentReviewsGlobal: vi.fn(),
}
const statsQ = {
    getLoadoutDeveloperStats: vi.fn(),
    getLoadoutRatingHighlights: vi.fn(),
}
const feedQ = { getFeed: vi.fn() }
const exploreQ = {
    getTrendingGames: vi.fn(),
    getTrendingLists: vi.fn(),
    getExploreRecommendations: vi.fn(),
}
const steamQ = { getSteamAccount: vi.fn() }
const loadoutQ = { buildLoadoutInput: vi.fn() }

vi.mock('@/lib/queries/user', () => userQ)
vi.mock('@/lib/queries/library', () => libraryQ)
vi.mock('@/lib/queries/game', () => gameQ)
vi.mock('@/lib/queries/list', () => listQ)
vi.mock('@/lib/queries/review', () => reviewQ)
vi.mock('@/lib/queries/stats', () => statsQ)
vi.mock('@/lib/queries/feed', () => feedQ)
vi.mock('@/lib/queries/explore', () => exploreQ)
vi.mock('@/lib/queries/steam', () => steamQ)
vi.mock('@/lib/loadout', () => loadoutQ)

const { loadUserLibrary } = await import('@/lib/loaders/library-page')
const { loadUserLists } = await import('@/lib/loaders/lists-page')
const { loadListPage } = await import('@/lib/loaders/list-page')
const { loadLoadoutPage } = await import('@/lib/loaders/loadout-page')
const { loadProfilePage } = await import('@/lib/loaders/profile-page')
const { loadGamesPage } = await import('@/lib/loaders/games-page')
const { loadFeed } = await import('@/lib/loaders/feed')
const { loadExplore } = await import('@/lib/loaders/explore')
const { loadHomeLanding } = await import('@/lib/loaders/home')
const { loadMe, loadSettings } = await import('@/lib/loaders/me')
const { loadUserReviews } = await import('@/lib/loaders/user-reviews')

const OWNER = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const LIKER = '33333333-3333-4333-8333-333333333333'
const STORED = 'https://images.igdb.com/igdb/image/upload/t_cover_big/x.jpg'
const LARGE = 'https://images.igdb.com/igdb/image/upload/t_cover_big_2x/x.jpg'
const SMALL = 'https://images.igdb.com/igdb/image/upload/t_cover_big/x.jpg'

const LIBRARY_QUERY = {
    q: null, genre: null, platform: null, developer: null, publisher: null, esrb: null,
    sort: 'name' as const, order: 'asc' as const, status: '' as const, is100: false,
}

const SECRET_GAME = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    name: 'Secret Backlog Game',
    slug: 'secret-backlog',
    cover_image_url: STORED,
    released: '2020-01-01',
    avg_ngplus_rating: '8.00',
    user_rating: null,
    total_count: 1,
    steam_appid: 999,
}

beforeEach(() => {
    for (const group of [userQ, libraryQ, gameQ, listQ, reviewQ, statsQ, feedQ, exploreQ, steamQ, loadoutQ]) {
        for (const fn of Object.values(group)) fn.mockReset()
    }
    userQ.getUserIdFromUsername.mockResolvedValue({ id: OWNER })
    userQ.getAccountSettings.mockResolvedValue({
        id: OWNER, username: 'ada', avatar_url: null, selected_title: 'Ranger',
        created_at: '2026-01-01 00:00:00+00',
        default_list_public: false, library_public: false, loadout_public: false,
    })
    userQ.getProfileSummaryByUsername.mockResolvedValue({
        id: OWNER, username: 'ada', display_name: 'Ada', avatar_url: null,
    })
    libraryQ.getLibraryFacets.mockResolvedValue({ genres: [], platforms: [], developers: [], publishers: [], esrbRatings: [] })
    libraryQ.getLibraryEntries.mockResolvedValue([{
        game_id: SECRET_GAME.id, status: 'backlog', created_at: '2026-01-02 00:00:00+00',
        completed_all_achievements: null, hours_played: '3.5', play_count: null,
    }])
    gameQ.queryGames.mockResolvedValue([SECRET_GAME])
    gameQ.getDeveloperNameMap.mockResolvedValue(new Map([[SECRET_GAME.id, 'Studio']]))
    gameQ.getAllGenres.mockResolvedValue([{ id: 'g1', name: 'RPG', slug: 'rpg' }])
    gameQ.getAllPlatforms.mockResolvedValue([])
    gameQ.getDistinctEsrbRatings.mockResolvedValue(['Mature'])
    listQ.getListCoverMap.mockResolvedValue(new Map([['list-public', [{ coverImageUrl: STORED, slug: 'secret-backlog' }]]]))
    listQ.getListLikes.mockResolvedValue([
        { list_id: 'list-public', user_id: LIKER },
        { list_id: 'list-public', user_id: OTHER },
    ])
})

describe('loadUserLibrary', () => {
    it('hides a private library from a signed-out caller and from another player', async () => {
        await expect(loadUserLibrary('ada', null, LIBRARY_QUERY)).resolves.toBeNull()
        await expect(loadUserLibrary('ada', OTHER, LIBRARY_QUERY)).resolves.toBeNull()
    })

    it('returns the owner’s private library with a display cover, avg_rating, and numeric hours', async () => {
        const data = await loadUserLibrary('ada', OWNER, LIBRARY_QUERY)

        expect(data).toEqual({
            username: 'ada',
            facets: { genres: [], platforms: [], developers: [], publishers: [], esrb_ratings: [] },
            games: [{
                id: SECRET_GAME.id,
                name: 'Secret Backlog Game',
                slug: 'secret-backlog',
                cover_image_url: LARGE,
                released: '2020-01-01',
                developer: 'Studio',
                avg_rating: 8,
                user_rating: null,
                library_status: 'backlog',
                completed_all_achievements: false,
                hours_played: 3.5,
                play_count: 1,
            }],
        })
        expect(data).not.toHaveProperty('steam_appid')
        expect(JSON.parse(JSON.stringify(data))).toEqual(data)
    })

    it('returns the same library to a signed-out caller when the library is public', async () => {
        userQ.getAccountSettings.mockResolvedValue({
            id: OWNER, username: 'ada', library_public: true, loadout_public: false, default_list_public: true,
        })

        const data = await loadUserLibrary('ada', null, LIBRARY_QUERY)

        expect(data!.games.map(game => game.name)).toEqual(['Secret Backlog Game'])
        expect(data!.games[0].avg_rating).toBe(8)
    })

    it('does not fill an empty library with the rest of the catalogue', async () => {
        userQ.getAccountSettings.mockResolvedValue({ id: OWNER, library_public: true })
        libraryQ.getLibraryEntries.mockResolvedValue([])
        gameQ.queryGames.mockResolvedValue([{ ...SECRET_GAME, name: 'Whole Catalogue' }])

        const data = await loadUserLibrary('ada', null, LIBRARY_QUERY)

        expect(data!.games).toEqual([])
    })

    it('orders a public library by date added when that sort is selected', async () => {
        userQ.getAccountSettings.mockResolvedValue({ id: OWNER, library_public: true })
        libraryQ.getLibraryEntries.mockResolvedValue([
            { game_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', status: 'playing', created_at: '2026-01-01 00:00:00+00', completed_all_achievements: false, hours_played: null, play_count: 1 },
            { game_id: SECRET_GAME.id, status: 'backlog', created_at: '2026-03-01 00:00:00+00', completed_all_achievements: false, hours_played: null, play_count: 1 },
        ])
        gameQ.queryGames.mockResolvedValue([
            { ...SECRET_GAME, name: 'Older' },
            { ...SECRET_GAME, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Newer In Name', slug: 'newer' },
        ])

        const data = await loadUserLibrary('ada', null, { ...LIBRARY_QUERY, sort: 'date_added', order: 'desc' })

        expect(data!.games.map(game => game.id)).toEqual([SECRET_GAME.id, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'])
    })

    it('returns null when the username does not exist', async () => {
        userQ.getUserIdFromUsername.mockResolvedValue(null)

        await expect(loadUserLibrary('missing', null, LIBRARY_QUERY)).resolves.toBeNull()
    })
})

describe('loadUserLists', () => {
    const rows = [
        { id: 'list-public', name: 'Public List', description: 'open', is_public: true, is_default: false, is_pinned: false, created_at: 't', last_activity: '2026-02-01 00:00:00+00', game_count: '1', owner_username: 'ada', owner_avatar_url: null, owner_id: OWNER },
        { id: 'list-private', name: 'Secret List', description: 'hidden', is_public: false, is_default: false, is_pinned: true, created_at: 't', last_activity: '2026-02-02 00:00:00+00', game_count: 2, owner_username: 'ada', owner_avatar_url: null, owner_id: OWNER },
    ]

    beforeEach(() => {
        listQ.getUserLists.mockResolvedValue(rows)
        listQ.getLikedLists.mockResolvedValue(rows)
    })

    it('omits private lists for a signed-out caller and for another player', async () => {
        const signedOut = await loadUserLists('ada', null, 'user')
        const other = await loadUserLists('ada', OTHER, 'user')

        expect(signedOut!.lists.map(list => list.name)).toEqual(['Public List'])
        expect(other!.lists.map(list => list.name)).toEqual(['Public List'])
        expect(JSON.stringify(signedOut)).not.toContain('Secret List')
        expect(JSON.stringify(signedOut)).not.toContain(LIKER)
        expect(signedOut!.default_list_public).toBeNull()
        expect(signedOut!.lists[0]).toMatchObject({
            id: 'list-public',
            game_count: 1,
            like_count: 2,
            viewer_has_liked: false,
            covers: [{ cover_image_url: SMALL, slug: 'secret-backlog' }],
        })
    })

    it('includes the owner’s private list and whether the viewer liked the public one', async () => {
        const owned = await loadUserLists('ada', OWNER, 'user')
        const likedByOther = await loadUserLists('ada', OTHER, 'user')

        expect(owned!.lists.map(list => list.name)).toEqual(['Public List', 'Secret List'])
        expect(owned!.default_list_public).toBe(false)
        expect(likedByOther!.lists[0].viewer_has_liked).toBe(true)
    })

    it('drops a private list from the liked tab even for the owner', async () => {
        const data = await loadUserLists('ada', OWNER, 'liked')

        expect(data!.lists.map(list => list.name)).toEqual(['Public List'])
    })

    it('returns null for an unknown username', async () => {
        userQ.getProfileSummaryByUsername.mockResolvedValue(null)

        await expect(loadUserLists('missing', null, 'user')).resolves.toBeNull()
    })
})

describe('loadListPage', () => {
    const list = {
        id: 'list-1', name: 'Secret List', description: 'hidden', is_public: false,
        is_pinned: false, is_default: false, created_at: 't', updated_at: '2026-02-01 00:00:00+00', user_id: OWNER,
    }

    beforeEach(() => {
        listQ.getListById.mockResolvedValue(list)
        listQ.getListGames.mockResolvedValue([{
            games: { id: SECRET_GAME.id, name: 'Secret Backlog Game', slug: 'secret-backlog', cover_image_url: STORED, released: '2020-01-01' },
        }])
        listQ.getListLikes.mockResolvedValue([{ list_id: 'list-1', user_id: LIKER }])
        reviewQ.getAvgRatingsForGames.mockResolvedValue([{ game_id: SECRET_GAME.id, avg_rating: 7.5 }])
        reviewQ.getUserRatingsForGames.mockResolvedValue([{ game_id: SECRET_GAME.id, rating: 9 }])
        gameQ.getDeveloperNameMap.mockResolvedValue(new Map([[SECRET_GAME.id, 'Studio']]))
    })

    it('hides a private list, its games, and its likers from anyone but the owner', async () => {
        expect(await loadListPage('ada', 'list-1', null)).toBeNull()
        expect(await loadListPage('ada', 'list-1', OTHER)).toBeNull()
        expect(JSON.stringify(await loadListPage('ada', 'list-1', OTHER))).not.toContain('Secret Backlog Game')
    })

    it('returns the owner’s private list with community and viewer scores', async () => {
        const data = await loadListPage('ada', 'list-1', OWNER)

        expect(data).toMatchObject({
            list: { id: 'list-1', name: 'Secret List', is_public: false, game_count: 1 },
            like_count: 1,
            viewer: { is_owner: true, has_liked: false },
        })
        expect(data!.games).toEqual([{
            id: SECRET_GAME.id,
            name: 'Secret Backlog Game',
            slug: 'secret-backlog',
            cover_image_url: LARGE,
            released: '2020-01-01',
            developer: 'Studio',
            avg_rating: 7.5,
            user_rating: 9,
        }])
        expect(JSON.stringify(data)).not.toContain(LIKER)
    })

    it('returns a public list to a signed-out caller with viewer null and no user score', async () => {
        listQ.getListById.mockResolvedValue({ ...list, name: 'Public List', is_public: true })

        const data = await loadListPage('ada', 'list-1', null)

        expect(data!.viewer).toBeNull()
        expect(data!.games[0].user_rating).toBeNull()
        expect(data!.games[0].avg_rating).toBe(7.5)
        expect(data!.like_count).toBe(1)
    })

    it('returns null when the list belongs to a different player than the username', async () => {
        listQ.getListById.mockResolvedValue({ ...list, is_public: true, user_id: OTHER })

        expect(await loadListPage('ada', 'list-1', null)).toBeNull()
    })
})

describe('loadLoadoutPage', () => {
    beforeEach(() => {
        loadoutQ.buildLoadoutInput.mockResolvedValue({
            username: 'ada', totalGames: 4, completedGames: 2, totalRatings: 5, avgRating: 8.2,
            topGenres: [
                { genre_name: 'RPG', weighted_rating: 9, rated_count: 3, completed_count: 2 },
                { genre_name: 'Once', weighted_rating: 10, rated_count: 1, completed_count: 0 },
            ],
            topDevelopers: [{ developer_name: 'From', weighted_rating: 8, rated_count: 2, game_count: 4 }],
        })
        reviewQ.getUserRatings.mockResolvedValue([
            { game_id: 'g1', rating: 10, review: 'best kept review' },
            { game_id: 'g2', rating: 8, review: '' },
        ])
        reviewQ.getAvgRatingsForGames.mockResolvedValue([{ game_id: 'g1', avg_rating: 9 }])
        reviewQ.getUserRatingsForGames.mockResolvedValue([{ game_id: 'g1', rating: 4 }])
        statsQ.getLoadoutRatingHighlights.mockResolvedValue([{
            highlight_type: 'top', game_id: 'g1', game_name: 'Top Game', game_slug: 'top',
            cover_image_url: STORED, released: '2020-01-01', rating: 10,
        }])
        userQ.getCurrentLoadoutIdentity.mockResolvedValue({ loadout_identity: 'You chase rogues.', loadout_identity_at: 't' })
        gameQ.getDeveloperNameMap.mockResolvedValue(new Map([['g1', 'Studio']]))
    })

    it('hides a private loadout, including the read-out, from other callers', async () => {
        expect(await loadLoadoutPage('ada', null)).toBeNull()
        expect(await loadLoadoutPage('ada', OTHER)).toBeNull()
        expect(JSON.stringify(await loadLoadoutPage('ada', OTHER))).not.toContain('You chase rogues.')
    })

    it('returns the read-out and scores to the owner, without the raw review text', async () => {
        const data = await loadLoadoutPage('ada', OWNER)

        expect(data).toMatchObject({
            username: 'ada',
            total_games: 4,
            completed_games: 2,
            rating_count: 2,
            avg_rating: 8.2,
            identity: 'You chase rogues.',
            can_generate: true,
            viewer: { is_owner: true },
        })
        expect(data!.genres.map(genre => genre.genre_name)).toEqual(['RPG'])
        expect(data!.developers.map(dev => dev.developer_name)).toEqual(['From'])
        expect(data!.distribution).toEqual([
            { rating: 10, count: 1 }, { rating: 9, count: 0 }, { rating: 8, count: 1 },
            { rating: 7, count: 0 }, { rating: 6, count: 0 }, { rating: 5, count: 0 },
            { rating: 4, count: 0 }, { rating: 3, count: 0 }, { rating: 2, count: 0 },
            { rating: 1, count: 0 },
        ])
        expect(data!.top_games[0]).toMatchObject({ id: 'g1', avg_rating: 9, user_rating: 4, cover_image_url: LARGE })
        expect(JSON.stringify(data)).not.toContain('best kept review')
    })

    it('returns a public loadout to a signed-out caller with viewer null', async () => {
        userQ.getAccountSettings.mockResolvedValue({ id: OWNER, loadout_public: true, library_public: false })

        const data = await loadLoadoutPage('ada', null)

        expect(data!.identity).toBe('You chase rogues.')
        expect(data!.viewer).toBeNull()
        expect(data!.top_games[0].user_rating).toBeNull()
    })
})

describe('loadProfilePage', () => {
    beforeEach(() => {
        userQ.getFullProfile.mockResolvedValue({
            id: OWNER, username: 'ada', display_name: 'Ada', avatar_url: null,
            created_at: '2026-01-01 00:00:00+00', selected_title: 'Ranger',
            favorite_game_ids: ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', SECRET_GAME.id],
            user_bio: 'hello', profile_loadout_bio: 'secret readout',
            library_public: false, loadout_public: false, default_list_public: false,
        })
        userQ.getFollowers.mockResolvedValue([{ follower_id: LIKER }, { follower_id: OTHER }])
        userQ.getFollowing.mockResolvedValue([{ following_id: '44444444-4444-4444-8444-444444444444' }])
        libraryQ.getLibraryStatusBreakdown.mockResolvedValue({
            entries: [{ status: 'completed' }, { status: 'playing' }], totalCount: 2,
        })
        gameQ.queryGames.mockResolvedValue([
            { ...SECRET_GAME, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Second', slug: 'second' },
            SECRET_GAME,
        ])
        reviewQ.getRecentReviews.mockResolvedValue([{
            user_id: OWNER, rating: 9, review: 'Loved it', created_at: 't', updated_at: 't',
            users: { username: 'ada', display_name: 'Ada', avatar_url: '' },
            games: { name: 'Secret Backlog Game', slug: 'secret-backlog' },
        }])
        reviewQ.getUserRatings.mockResolvedValue([
            { game_id: 'g1', rating: 8, review: 'private words' },
            { game_id: 'g2', rating: 6, review: '' },
        ])
        statsQ.getLoadoutDeveloperStats.mockResolvedValue([
            { developer_name: 'Secret Studio', weighted_rating: 9, rated_count: 2, game_count: 2, avg_rating: 9 },
        ])
    })

    it('counts followers and hides library stats, the read-out, and follower ids when those are private', async () => {
        const data = await loadProfilePage('ada', null)

        expect(data!.profile.follower_count).toBe(2)
        expect(data!.profile.following_count).toBe(1)
        expect(data!.library_stats).toBeNull()
        expect(data!.profile.profile_loadout_bio).toBeNull()
        expect(data!.viewer).toBeNull()
        expect(data!.rating_count).toBe(2)
        expect(data!.avg_rating).toBe(7)
        expect(data!.recent_reviews[0].review).toBe('Loved it')
        const body = JSON.stringify(data)
        expect(body).not.toContain(LIKER)
        expect(body).not.toContain('44444444-4444-4444-8444-444444444444')
        expect(body).not.toContain('private words')
        expect(body).not.toContain('Secret Studio')
        expect(body).not.toContain('secret readout')
    })

    it('shows the owner library stats, the read-out, and title-picker developers', async () => {
        const data = await loadProfilePage('ada', OWNER)

        expect(data!.library_stats).toEqual({ total_games: 2, completed: 1 })
        expect(data!.profile.profile_loadout_bio).toBe('secret readout')
        expect(data!.viewer).toEqual({ is_owner: true, is_following: false, top_developer_names: ['Secret Studio'] })
        expect(data!.favorites.map(game => game.name)).toEqual(['Secret Backlog Game', 'Second'])
        expect(data!.favorites[0].cover_image_url).toBe(LARGE)
        expect(data!.favorites[0].avg_rating).toBe(8)
    })

    it('tells another player whether they follow, without opening a private library', async () => {
        const data = await loadProfilePage('ada', OTHER)

        expect(data!.viewer).toEqual({ is_owner: false, is_following: true, top_developer_names: [] })
        expect(data!.library_stats).toBeNull()
    })

    it('returns null for an unknown username', async () => {
        userQ.getFullProfile.mockResolvedValue(null)

        await expect(loadProfilePage('missing', null)).resolves.toBeNull()
    })
})

describe('loadGamesPage', () => {
    it('renames the community score to avg_rating and rewrites the cover', async () => {
        const data = await loadGamesPage({
            q: null, genre: null, platform: null, developer: null, publisher: null, esrb: null,
            sort: 'name', order: 'asc', page: 1, pageSize: 10,
        }, null)

        expect(data.games).toEqual([{
            id: SECRET_GAME.id,
            name: 'Secret Backlog Game',
            slug: 'secret-backlog',
            cover_image_url: LARGE,
            released: '2020-01-01',
            developer: 'Studio',
            avg_rating: 8,
            user_rating: null,
        }])
        expect(data.total).toBe(1)
        expect(data.total_pages).toBe(1)
        expect(data.genres).toEqual([{ id: 'g1', name: 'RPG', slug: 'rpg' }])
        expect(data.esrb_ratings).toEqual(['Mature'])
        expect(data.viewer).toBeNull()
        expect(JSON.stringify(data)).not.toContain('avg_ngplus_rating')
        expect(JSON.stringify(data)).not.toContain('steam_appid')
    })
})

describe('loadFeed', () => {
    it('returns an empty feed for a signed-out caller', async () => {
        feedQ.getFeed.mockResolvedValue([{ activity_type: 'rating', actor_username: 'someone' }])

        const data = await loadFeed(null, 0)

        expect(data).toEqual({ items: [], viewer: null })
    })

    it('returns the viewer’s feed without a retired critic score', async () => {
        feedQ.getFeed.mockResolvedValue([{
            activity_type: 'rating', created_at: '2026-02-01 00:00:00+00', actor_id: OTHER,
            actor_username: 'bea', actor_avatar_url: null, game_id: SECRET_GAME.id,
            game_name: 'Hades', game_slug: 'hades', game_cover_image_url: STORED,
            game_released: '2020-09-17', game_metacritic_score: 93, game_developer: 'Supergiant',
            game_avg_rating: 9, viewer_game_rating: 8, list_cover_urls: null, list_id: null,
            list_name: null, list_description: null, list_owner_username: null, list_game_count: null,
            list_last_activity: null, list_like_count: null, viewer_liked_list: null, rating: 8,
            review: 'sharp', review_created_at: 't', review_updated_at: 't', library_status: null,
            library_game_count: null, library_cover_urls: [STORED], library_game_names: null,
        }])

        const data = await loadFeed(OTHER, 12)

        expect(data.viewer).toEqual({ id: OTHER })
        expect(data.items[0].game_cover_image_url).toBe(SMALL)
        expect(data.items[0].library_cover_urls).toEqual([SMALL])
        expect(data.items[0].game_avg_rating).toBe(9)
        expect(JSON.stringify(data)).not.toContain('metacritic')
        expect(feedQ.getFeed).toHaveBeenCalledWith(OTHER, 12, 12)
    })
})

describe('loadExplore', () => {
    it('returns trending rows and no recommendations when signed out', async () => {
        exploreQ.getTrendingGames.mockResolvedValue([{
            game_id: SECRET_GAME.id, game_name: 'Hades', game_slug: 'hades', game_cover_image_url: STORED,
            game_released: '2020-09-17', game_developer: 'Supergiant', avg_rating: 9, user_rating: null,
            metacritic_score: 93,
        }])
        exploreQ.getTrendingLists.mockResolvedValue([{
            list_id: 'list-public', list_name: 'Public List', list_description: 'open', owner_username: 'ada',
            last_activity: 't', game_count: 1, like_count: 2, recent_like_count: 1, user_has_liked: false,
            cover_urls: [STORED],
        }])
        exploreQ.getExploreRecommendations.mockResolvedValue({
            games: [{ game_name: 'Should Not Leak' }], lists: [], users: [],
        })

        const data = await loadExplore(null, 'week')

        expect(data.recommendations).toBeNull()
        expect(data.viewer).toBeNull()
        expect(data.trending_games[0]).toMatchObject({ id: SECRET_GAME.id, avg_rating: 9, cover_image_url: LARGE })
        expect(data.trending_lists[0].covers).toEqual([{ cover_image_url: SMALL, slug: null }])
        expect(JSON.stringify(data)).not.toContain('Should Not Leak')
        expect(JSON.stringify(data)).not.toContain('metacritic')
        expect(exploreQ.getTrendingGames).toHaveBeenCalledWith(null, 7)
    })
})

describe('loadHomeLanding', () => {
    it('renames the hero score and keeps the sample read-out that is already public', async () => {
        gameQ.getHeroGame.mockResolvedValue({
            id: SECRET_GAME.id, name: 'Hades', slug: 'hades', cover_image_url: STORED,
            artwork_image_url: 'https://images.igdb.com/igdb/image/upload/t_1080p/y.jpg',
            screenshots: ['https://images.igdb.com/igdb/image/upload/t_screenshot_huge/s.jpg'],
            released: '2020-09-17', avg_ngplus_rating: 9, rating_count: 4,
        })
        exploreQ.getTrendingGames.mockResolvedValue([
            { game_id: '1', game_name: 'A', game_slug: 'a', game_cover_image_url: null, game_released: null, game_developer: null, avg_rating: 1, user_rating: null },
            { game_id: '2', game_name: 'B', game_slug: 'b', game_cover_image_url: null, game_released: null, game_developer: null, avg_rating: 1, user_rating: null },
            { game_id: '3', game_name: 'C', game_slug: 'c', game_cover_image_url: null, game_released: null, game_developer: null, avg_rating: 1, user_rating: null },
            { game_id: '4', game_name: 'D', game_slug: 'd', game_cover_image_url: null, game_released: null, game_developer: null, avg_rating: 1, user_rating: null },
            { game_id: '5', game_name: 'E', game_slug: 'e', game_cover_image_url: null, game_released: null, game_developer: null, avg_rating: 1, user_rating: null },
            { game_id: '6', game_name: 'F', game_slug: 'f', game_cover_image_url: null, game_released: null, game_developer: null, avg_rating: 1, user_rating: null },
        ])
        reviewQ.getRecentReviewsGlobal.mockResolvedValue([{
            user_id: OWNER, rating: 9, review: 'sharp', created_at: '2026-02-01 00:00:00+00', updated_at: 't',
            users: { username: 'ada', display_name: 'Ada', avatar_url: null },
            games: { name: 'Hades', slug: 'hades', cover_image_url: STORED },
        }])
        userQ.getFeaturedLoadout.mockResolvedValue({ username: 'hornflakes', avatar_url: null, loadout_identity: 'A public sample.' })

        const data = await loadHomeLanding()

        expect(data.hero).toMatchObject({ name: 'Hades', avg_rating: 9, rating_count: 4, cover_image_url: LARGE })
        expect(data.trending_games).toHaveLength(5)
        expect(data.trending_games.map(game => game.name)).toEqual(['A', 'B', 'C', 'D', 'E'])
        expect(data.recent_reviews[0].games.cover_image_url).toBe(SMALL)
        expect(data.featured_loadout).toEqual({ username: 'hornflakes', avatar_url: null, loadout_identity: 'A public sample.' })
        expect(JSON.stringify(data)).not.toContain('avg_ngplus_rating')
    })
})

describe('loadMe and loadSettings', () => {
    it('returns no user when signed out and no email on the signed-in card', async () => {
        await expect(loadMe(null)).resolves.toEqual({ user: null })
        userQ.getProfileById.mockResolvedValue({
            id: OWNER, username: 'ada', display_name: 'Ada', avatar_url: null, selected_title: 'Ranger', email: 'ada@x.test',
        })

        const data = await loadMe(OWNER)

        expect(data).toEqual({
            user: { id: OWNER, username: 'ada', display_name: 'Ada', avatar_url: null, selected_title: 'Ranger' },
        })
        expect(JSON.stringify(data)).not.toContain('ada@x.test')
    })

    it('returns the owner’s settings without the Steam id', async () => {
        steamQ.getSteamAccount.mockResolvedValue({ steam_id: '76561198000000000', profile_public: true })

        const data = await loadSettings({ id: OWNER, email: 'ada@x.test' })

        expect(data).toEqual({
            username: 'ada',
            avatar_url: null,
            selected_title: 'Ranger',
            created_at: '2026-01-01 00:00:00+00',
            email: 'ada@x.test',
            default_list_public: false,
            library_public: false,
            loadout_public: false,
            steam_linked: true,
        })
        expect(JSON.stringify(data)).not.toContain('76561198000000000')
    })
})

describe('loadUserReviews', () => {
    it('returns a public page of ratings with a display cover', async () => {
        reviewQ.getUserRatingsReviewsPage.mockResolvedValue([{
            rating: 9, review: '', created_at: 't', updated_at: '2026-02-01 00:00:00+00',
            game_id: SECRET_GAME.id, game_name: 'Hades', game_slug: 'hades', game_cover_image_url: STORED,
            game_released: '2020-09-17', game_developer: 'Supergiant', total_count: 1,
        }])
        reviewQ.getUserRatingsReviewsCounts.mockResolvedValue([{ total_count: 1, review_count: 0, rating_count: 1 }])
        gameQ.getDeveloperNameMap.mockResolvedValue(new Map([[SECRET_GAME.id, 'Supergiant']]))

        const data = await loadUserReviews('ada', { filter: 'all', sort: 'date', order: 'desc', page: 1, pageSize: 10 })

        expect(data).toEqual({
            username: 'ada',
            counts: { total_count: 1, review_count: 0, rating_count: 1 },
            total: 1,
            total_pages: 1,
            items: [{
                game_id: SECRET_GAME.id,
                game_name: 'Hades',
                game_slug: 'hades',
                cover_image_url: SMALL,
                released: '2020-09-17',
                developer: 'Supergiant',
                rating: 9,
                review: '',
                updated_at: '2026-02-01 00:00:00+00',
            }],
        })
    })

    it('returns null for an unknown username', async () => {
        userQ.getProfileSummaryByUsername.mockResolvedValue(null)

        await expect(loadUserReviews('missing', { filter: 'all', sort: 'date', order: 'desc', page: 1, pageSize: 10 })).resolves.toBeNull()
    })
})
