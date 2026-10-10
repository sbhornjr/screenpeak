import { beforeEach, describe, expect, it, vi } from 'vitest'

const queries = { getGameBySlug: vi.fn(), getGameRatingsStats: vi.fn() }
vi.mock('@/lib/queries/game', () => ({ getGameBySlug: queries.getGameBySlug }))
vi.mock('@/lib/queries/review', () => ({ getGameRatingsStats: queries.getGameRatingsStats }))

const { default: gameImage } = await import('@/app/games/[slug]/opengraph-image')

const ART = 'https://images.igdb.com/igdb/image/upload/t_screenshot_huge/art.jpg'
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
const LONG = 'The Legend of Heroes: Trails through Daybreak II, and the Very Long Remainder of a Catalogue Title'

function pngSize(bytes: Uint8Array) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    return { width: view.getUint32(16), height: view.getUint32(20) }
}

async function render(slug = 'example') {
    const response = await gameImage({ params: Promise.resolve({ slug }) })
    const bytes = new Uint8Array(await response.arrayBuffer())
    return { response, bytes }
}

const realFetch = globalThis.fetch.bind(globalThis)

function stubImageFetch(image: (href: string) => Response | Promise<Response>) {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const href = String(input)
        if (href.includes('images.igdb.com')) return Promise.resolve(image(href))
        return realFetch(input, init)
    }))
}

beforeEach(() => {
    queries.getGameBySlug.mockReset()
    queries.getGameRatingsStats.mockReset()
    queries.getGameBySlug.mockResolvedValue({
        id: 'game-1',
        name: 'Hades',
        slug: 'hades',
        artwork_image_url: null,
        screenshots: [],
        cover_image_url: null,
    })
    queries.getGameRatingsStats.mockResolvedValue({ total_ratings: 4, avg_rating: 9.5 })
    vi.unstubAllGlobals()
})

describe('game share image', () => {
    it('renders the branded card when the game has no landscape art', async () => {
        const fetchImpl = vi.spyOn(globalThis, 'fetch')
        const { response, bytes } = await render()
        expect(response.status).toBe(200)
        expect(response.headers.get('content-type')).toContain('image/png')
        expect(bytes[0]).toBe(0x89)
        expect(pngSize(bytes)).toEqual({ width: 1200, height: 630 })
        expect(fetchImpl.mock.calls.some(call => String(call[0]).includes('images.igdb.com'))).toBe(false)
    }, 30_000)

    it('renders the branded card when the backdrop fetch fails', async () => {
        queries.getGameBySlug.mockResolvedValue({
            id: 'game-1', name: 'Hades', slug: 'hades', artwork_image_url: ART, screenshots: [],
        })
        stubImageFetch(() => new Response('missing', { status: 404, headers: { 'content-type': 'text/plain' } }))
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const { response, bytes } = await render()
        expect(response.status).toBe(200)
        expect(response.headers.get('content-type')).toContain('image/png')
        expect(pngSize(bytes)).toEqual({ width: 1200, height: 630 })
        expect(warn).not.toHaveBeenCalled()
    }, 30_000)

    it('renders a long title with a validated backdrop', async () => {
        queries.getGameBySlug.mockResolvedValue({
            id: 'game-1', name: LONG, slug: 'long', artwork_image_url: ART, screenshots: [],
        })
        stubImageFetch(() => new Response(PNG, { status: 200, headers: { 'content-type': 'image/png' } }))
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const { response, bytes } = await render('long')
        expect(response.status).toBe(200)
        expect(pngSize(bytes)).toEqual({ width: 1200, height: 630 })
        expect(warn).not.toHaveBeenCalled()
    }, 30_000)

    it('still fails when the ratings query fails', async () => {
        queries.getGameRatingsStats.mockRejectedValue(new Error('database unavailable'))
        await expect(render()).rejects.toThrow('database unavailable')
    })
})
