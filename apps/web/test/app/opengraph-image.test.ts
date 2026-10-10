import { beforeEach, describe, expect, it, vi } from 'vitest'

const queries = { getHeroGame: vi.fn() }
vi.mock('@/lib/queries/game', () => ({ getHeroGame: queries.getHeroGame }))

const { default: siteImage } = await import('@/app/opengraph-image')

const ART = 'https://images.igdb.com/igdb/image/upload/t_screenshot_huge/art.jpg'
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

function pngSize(bytes: Uint8Array) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    return { width: view.getUint32(16), height: view.getUint32(20) }
}

async function render() {
    const response = await siteImage()
    const bytes = new Uint8Array(await response.arrayBuffer())
    return { response, bytes }
}

const realFetch = globalThis.fetch.bind(globalThis)

function stubImageFetch(image: () => Response | Promise<Response>) {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const href = String(input)
        if (href.includes('images.igdb.com')) return Promise.resolve(image())
        return realFetch(input, init)
    }))
}

beforeEach(() => {
    queries.getHeroGame.mockReset()
    queries.getHeroGame.mockResolvedValue(null)
    vi.unstubAllGlobals()
})

describe('site share image', () => {
    it('renders the branded card when there is no hero art', async () => {
        const fetchImpl = vi.spyOn(globalThis, 'fetch')
        const { response, bytes } = await render()
        expect(response.status).toBe(200)
        expect(response.headers.get('content-type')).toContain('image/png')
        expect(pngSize(bytes)).toEqual({ width: 1200, height: 630 })
        expect(fetchImpl.mock.calls.some(call => String(call[0]).includes('images.igdb.com'))).toBe(false)
    }, 30_000)

    it('renders the branded card when the hero backdrop fetch fails', async () => {
        queries.getHeroGame.mockResolvedValue({
            id: 'g', name: 'Hades', slug: 'hades', cover_image_url: null,
            artwork_image_url: ART, screenshots: [], released: null,
            avg_ngplus_rating: 9, rating_count: 4,
        })
        stubImageFetch(() => { throw new Error('timeout') })
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const { response, bytes } = await render()
        expect(response.status).toBe(200)
        expect(pngSize(bytes)).toEqual({ width: 1200, height: 630 })
        expect(warn).not.toHaveBeenCalled()
    }, 30_000)

    it('renders a long hero name with a validated backdrop', async () => {
        queries.getHeroGame.mockResolvedValue({
            id: 'g',
            name: 'The Legend of Heroes: Trails through Daybreak II, and the Very Long Remainder of a Catalogue Title',
            slug: 'long',
            cover_image_url: null,
            artwork_image_url: ART,
            screenshots: [],
            released: null,
            avg_ngplus_rating: 8.5,
            rating_count: 12,
        })
        stubImageFetch(() => new Response(PNG, { status: 200, headers: { 'content-type': 'image/png' } }))
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const { response, bytes } = await render()
        expect(response.status).toBe(200)
        expect(pngSize(bytes)).toEqual({ width: 1200, height: 630 })
        expect(warn).not.toHaveBeenCalled()
    }, 30_000)
})
