import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// GET adapters over the read loaders. Auth and loaders are mocked; both are
// tested on their own. These tests check the HTTP contract: signed-out public
// reads, 404 for a missing or private resource, 400 for a bad query, 401 for a
// bad bearer, and Cache-Control.
const getBearerUser = vi.fn()
const loadGamesPage = vi.fn()
const loadFeed = vi.fn()
const loadExplore = vi.fn()
const loadHomeLanding = vi.fn()
const loadMe = vi.fn()
const loadSettings = vi.fn()
const loadProfilePage = vi.fn()
const loadUserLibrary = vi.fn()
const loadUserLists = vi.fn()
const loadListPage = vi.fn()
const loadUserReviews = vi.fn()
const loadLoadoutPage = vi.fn()

vi.mock('@/lib/auth', () => ({ getBearerUser }))
vi.mock('@/lib/loaders/games-page', () => ({ loadGamesPage }))
vi.mock('@/lib/loaders/feed', () => ({ loadFeed }))
vi.mock('@/lib/loaders/explore', () => ({ loadExplore }))
vi.mock('@/lib/loaders/home', () => ({ loadHomeLanding }))
vi.mock('@/lib/loaders/me', () => ({ loadMe, loadSettings }))
vi.mock('@/lib/loaders/profile-page', () => ({ loadProfilePage }))
vi.mock('@/lib/loaders/library-page', () => ({ loadUserLibrary }))
vi.mock('@/lib/loaders/lists-page', () => ({ loadUserLists }))
vi.mock('@/lib/loaders/list-page', () => ({ loadListPage }))
vi.mock('@/lib/loaders/user-reviews', () => ({ loadUserReviews }))
vi.mock('@/lib/loaders/loadout-page', () => ({ loadLoadoutPage }))

const games = await import('@/app/api/v1/games/route')
const feed = await import('@/app/api/v1/feed/route')
const explore = await import('@/app/api/v1/explore/route')
const home = await import('@/app/api/v1/home/route')
const me = await import('@/app/api/v1/me/route')
const settings = await import('@/app/api/v1/me/settings/route')
const profile = await import('@/app/api/v1/user/[username]/route')
const library = await import('@/app/api/v1/user/[username]/library/route')
const lists = await import('@/app/api/v1/user/[username]/lists/route')
const list = await import('@/app/api/v1/user/[username]/lists/[listId]/route')
const reviews = await import('@/app/api/v1/user/[username]/ratings_reviews/route')
const loadout = await import('@/app/api/v1/user/[username]/loadout/route')
const { UnauthenticatedError } = await import('@/lib/api')

const noCtx = { params: Promise.resolve({}) }
const userCtx = (username: string) => ({ params: Promise.resolve({ username }) })
const listCtx = (username: string, listId: string) => ({ params: Promise.resolve({ username, listId }) })

beforeEach(() => {
    getBearerUser.mockReset().mockResolvedValue(null)
    for (const fn of [
        loadGamesPage, loadFeed, loadExplore, loadHomeLanding, loadMe, loadSettings,
        loadProfilePage, loadUserLibrary, loadUserLists, loadListPage, loadUserReviews, loadLoadoutPage,
    ]) fn.mockReset()
    loadGamesPage.mockResolvedValue({ games: [], total: 0, viewer: null })
    loadFeed.mockResolvedValue({ items: [], viewer: null })
    loadExplore.mockResolvedValue({ recommendations: null, viewer: null })
    loadHomeLanding.mockResolvedValue({ hero: null })
    loadMe.mockResolvedValue({ user: null })
    loadSettings.mockResolvedValue({ username: 'ada', steam_linked: false })
    loadProfilePage.mockResolvedValue({ profile: { username: 'ada' }, viewer: null })
    loadUserLibrary.mockResolvedValue({ username: 'ada', games: [] })
    loadUserLists.mockResolvedValue({ username: 'ada', lists: [] })
    loadListPage.mockResolvedValue({ list: { id: 'list-1', name: 'Played' } })
    loadUserReviews.mockResolvedValue({ username: 'ada', reviews: [] })
    loadLoadoutPage.mockResolvedValue({ username: 'ada', identity: null })
})

describe('public read routes', () => {
    it('returns catalogue JSON for a signed-out caller and refuses a bad sort', async () => {
        const res = await games.GET(new NextRequest('http://localhost/api/v1/games'), noCtx)
        expect(res.status).toBe(200)
        expect(res.headers.get('cache-control')).toBe('private, no-store')
        expect(loadGamesPage).toHaveBeenCalledWith(
            expect.objectContaining({ sort: 'name', order: 'asc', page: 1, pageSize: 10 }),
            null,
        )

        const bad = await games.GET(new NextRequest('http://localhost/api/v1/games?sort=metacritic'), noCtx)
        expect(bad.status).toBe(400)
        expect((await bad.json()).error.code).toBe('invalid_request')
        expect(loadGamesPage).toHaveBeenCalledTimes(1)
    })

    it('returns an empty feed when signed out and rejects a bad offset', async () => {
        const res = await feed.GET(new NextRequest('http://localhost/api/v1/feed'), noCtx)
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ items: [], viewer: null })
        expect(loadFeed).toHaveBeenCalledWith(null, 0)

        const bad = await feed.GET(new NextRequest('http://localhost/api/v1/feed?offset=-1'), noCtx)
        expect(bad.status).toBe(400)
        expect((await bad.json()).error).toMatchObject({ code: 'invalid_request' })
    })

    it('passes a bearer id and the explore range, and rejects an unknown range', async () => {
        getBearerUser.mockResolvedValue({ id: 'viewer-1', email: 'me@x.test' })
        await explore.GET(new NextRequest('http://localhost/api/v1/explore?range=month'), noCtx)
        expect(loadExplore).toHaveBeenCalledWith('viewer-1', 'month')

        const bad = await explore.GET(new NextRequest('http://localhost/api/v1/explore?range=forever'), noCtx)
        expect(bad.status).toBe(400)
    })

    it('serves the landing page without reading a session', async () => {
        const res = await home.GET(new NextRequest('http://localhost/api/v1/home'), noCtx)
        expect(res.status).toBe(200)
        expect(loadHomeLanding).toHaveBeenCalledOnce()
        expect(getBearerUser).not.toHaveBeenCalled()
    })

    it('returns user null from /me when signed out, and 401 from settings', async () => {
        const card = await me.GET(new NextRequest('http://localhost/api/v1/me'), noCtx)
        expect(card.status).toBe(200)
        expect(await card.json()).toEqual({ user: null })
        expect(loadMe).toHaveBeenCalledWith(null)

        const locked = await settings.GET(new NextRequest('http://localhost/api/v1/me/settings'), noCtx)
        expect(locked.status).toBe(401)
        expect((await locked.json()).error.code).toBe('unauthenticated')
        expect(loadSettings).not.toHaveBeenCalled()
    })

    it('loads settings for a bearer caller and omits a missing account', async () => {
        getBearerUser.mockResolvedValue({ id: 'viewer-1', email: 'me@x.test' })
        const res = await settings.GET(new NextRequest('http://localhost/api/v1/me/settings'), noCtx)
        expect(res.status).toBe(200)
        expect(loadSettings).toHaveBeenCalledWith({ id: 'viewer-1', email: 'me@x.test' })

        loadSettings.mockResolvedValue(null)
        const missing = await settings.GET(new NextRequest('http://localhost/api/v1/me/settings'), noCtx)
        expect(missing.status).toBe(404)
    })
})

describe('user read routes', () => {
    it('returns a public profile for a signed-out caller and 404s an unknown name', async () => {
        const res = await profile.GET(
            new NextRequest('http://localhost/api/v1/user/ada'),
            userCtx('ada'),
        )
        expect(res.status).toBe(200)
        expect(res.headers.get('cache-control')).toBe('private, no-store')
        expect(loadProfilePage).toHaveBeenCalledWith('ada', null)

        loadProfilePage.mockResolvedValue(null)
        const missing = await profile.GET(
            new NextRequest('http://localhost/api/v1/user/nobody'),
            userCtx('nobody'),
        )
        expect(missing.status).toBe(404)
        expect(await missing.json()).toEqual({ error: { code: 'not_found', message: 'Not found.' } })
    })

    it('uses the same 404 for a private library and a missing player', async () => {
        loadUserLibrary.mockResolvedValue(null)
        const res = await library.GET(
            new NextRequest('http://localhost/api/v1/user/ada/library'),
            userCtx('ada'),
        )
        expect(res.status).toBe(404)
        expect(await res.json()).toEqual({ error: { code: 'not_found', message: 'Not found.' } })
        expect(loadUserLibrary).toHaveBeenCalledWith('ada', null, expect.objectContaining({ status: '', is100: false }))
    })

    it('rejects a bad library status before loading', async () => {
        const res = await library.GET(
            new NextRequest('http://localhost/api/v1/user/ada/library?status=wishlist'),
            userCtx('ada'),
        )
        expect(res.status).toBe(400)
        expect((await res.json()).error.message).toContain('status')
        expect(loadUserLibrary).not.toHaveBeenCalled()
    })

    it('passes the lists tab and 404s an unknown player', async () => {
        await lists.GET(
            new NextRequest('http://localhost/api/v1/user/ada/lists?tab=liked'),
            userCtx('ada'),
        )
        expect(loadUserLists).toHaveBeenCalledWith('ada', null, 'liked')

        const bad = await lists.GET(
            new NextRequest('http://localhost/api/v1/user/ada/lists?tab=secret'),
            userCtx('ada'),
        )
        expect(bad.status).toBe(400)

        loadUserLists.mockResolvedValue(null)
        const missing = await lists.GET(
            new NextRequest('http://localhost/api/v1/user/nobody/lists'),
            userCtx('nobody'),
        )
        expect(missing.status).toBe(404)
    })

    it('404s a private or missing list with the same message', async () => {
        loadListPage.mockResolvedValue(null)
        const res = await list.GET(
            new NextRequest('http://localhost/api/v1/user/ada/lists/list-1'),
            listCtx('ada', 'list-1'),
        )
        expect(res.status).toBe(404)
        expect((await res.json()).error).toEqual({ code: 'not_found', message: 'Not found.' })
        expect(loadListPage).toHaveBeenCalledWith('ada', 'list-1', null)
    })

    it('returns public ratings without a bearer and 404s an unknown player', async () => {
        const res = await reviews.GET(
            new NextRequest('http://localhost/api/v1/user/ada/ratings_reviews'),
            userCtx('ada'),
        )
        expect(res.status).toBe(200)
        expect(loadUserReviews).toHaveBeenCalledWith('ada', expect.objectContaining({ filter: 'all', page: 1 }))
        expect(getBearerUser).not.toHaveBeenCalled()

        const bad = await reviews.GET(
            new NextRequest('http://localhost/api/v1/user/ada/ratings_reviews?filter=notes'),
            userCtx('ada'),
        )
        expect(bad.status).toBe(400)

        loadUserReviews.mockResolvedValue(null)
        const missing = await reviews.GET(
            new NextRequest('http://localhost/api/v1/user/nobody/ratings_reviews'),
            userCtx('nobody'),
        )
        expect(missing.status).toBe(404)
    })

    it('404s a private loadout the same way as a missing player', async () => {
        loadLoadoutPage.mockResolvedValue(null)
        const res = await loadout.GET(
            new NextRequest('http://localhost/api/v1/user/ada/loadout'),
            userCtx('ada'),
        )
        expect(res.status).toBe(404)
        expect(loadLoadoutPage).toHaveBeenCalledWith('ada', null)
    })

    it('rejects a bad bearer before any loader runs', async () => {
        getBearerUser.mockRejectedValue(new UnauthenticatedError('invalid_token'))
        const res = await profile.GET(
            new NextRequest('http://localhost/api/v1/user/ada'),
            userCtx('ada'),
        )
        expect(res.status).toBe(401)
        expect((await res.json()).error.code).toBe('invalid_token')
        expect(loadProfilePage).not.toHaveBeenCalled()
    })
})
