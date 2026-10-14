import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import {
    COVER_BIG_PIXELS,
    COVER_FRAME,
    SOCIAL_PANEL,
    displayCoverUrl,
    displayLandscapeUrl,
    resolveHeroVisual,
    resolveSocialBackdrop,
    socialBackdrop,
} from '@/lib/catalog/images'

const COVER = 'https://images.igdb.com/igdb/image/upload/t_thumb/co123.jpg'
const ART = 'https://images.igdb.com/igdb/image/upload/t_screenshot_huge/art123.jpg'
const SHOT = 'https://images.igdb.com/igdb/image/upload/t_screenshot_huge/sc123.jpg'
const RAWG = 'https://media.rawg.io/media/games/example.jpg'

describe('catalogue images', () => {
    it('uses cover_big at 2x for a large frame and cover_big for a thumb', () => {
        expect(displayCoverUrl(COVER, 'large')).toBe('https://images.igdb.com/igdb/image/upload/t_cover_big_2x/co123.jpg')
        expect(displayCoverUrl('//images.igdb.com/igdb/image/upload/t_cover_small/co123.png', 'small'))
            .toBe('https://images.igdb.com/igdb/image/upload/t_cover_big/co123.png')
    })

    it('keeps a deliberate 3:4 frame, which crops cover_big slightly', () => {
        expect(COVER_FRAME).toEqual({ width: 3, height: 4 })
        const frame = COVER_FRAME.width / COVER_FRAME.height
        const cover = COVER_BIG_PIXELS.width / COVER_BIG_PIXELS.height
        expect(frame).toBeCloseTo(0.75)
        expect(frame).toBeGreaterThan(cover)
    })

    it('never renders a RAWG url or any other host', () => {
        expect(displayCoverUrl(RAWG, 'large')).toBeNull()
        expect(displayCoverUrl('http://images.igdb.com/igdb/image/upload/t_thumb/co123.jpg', 'large')).toBeNull()
        expect(displayCoverUrl('https://images.igdb.com/igdb/image/upload/t_thumb/co123.jpg?x=1', 'large')).toBeNull()
        expect(displayLandscapeUrl(RAWG)).toBeNull()
        expect(displayCoverUrl(null, 'large')).toBeNull()
    })

    it('uses landscape artwork for the share image and refuses a portrait cover', () => {
        expect(socialBackdrop({ cover_image_url: COVER, artwork_image_url: null, screenshots: [] })).toBeNull()
        expect(socialBackdrop({ artwork_image_url: COVER })).toBeNull()
        expect(displayLandscapeUrl(ART)).toBe(ART)

        const backdrop = socialBackdrop({
            cover_image_url: COVER,
            artwork_image_url: ART,
            screenshots: [SHOT],
        })
        expect(backdrop).toEqual({ url: ART, fit: 'cover', width: SOCIAL_PANEL.width, height: SOCIAL_PANEL.height })
        expect(SOCIAL_PANEL.width / SOCIAL_PANEL.height).toBeCloseTo(16 / 9, 5)
        expect(backdrop!.width).not.toBe(1200)
        expect(backdrop!.url).not.toContain('t_cover')
    })

    it('falls back to the first screenshot when artwork is missing', () => {
        expect(socialBackdrop({ artwork_image_url: null, screenshots: [COVER, SHOT] })?.url).toBe(SHOT)
        expect(socialBackdrop({ screenshots: [] })).toBeNull()
    })

    it('drops a landscape url whose bytes are not an image and falls back to the cover', async () => {
        const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
        const fetchImpl = (async (input: string | URL | Request) => {
            const href = String(input)
            if (href === ART || href === SHOT) return new Response('nope', { status: 404, headers: { 'content-type': 'text/plain' } })
            return new Response(png, { status: 200, headers: { 'content-type': 'image/png' } })
        }) as typeof fetch
        const source = { cover_image_url: COVER, artwork_image_url: ART, screenshots: [SHOT] }
        await expect(resolveSocialBackdrop(source, fetchImpl)).resolves.toBeNull()
        await expect(resolveHeroVisual(source, fetchImpl)).resolves.toEqual({
            url: 'https://images.igdb.com/igdb/image/upload/t_cover_big_2x/co123.jpg',
            frame: 'portrait',
        })
        const ok = (async () => new Response(png, { status: 200, headers: { 'content-type': 'image/png' } })) as typeof fetch
        const backdrop = await resolveSocialBackdrop({ artwork_image_url: ART }, ok)
        expect(backdrop?.url.startsWith('data:image/png;base64,')).toBe(true)
        expect(backdrop?.width).toBe(SOCIAL_PANEL.width)
        await expect(resolveHeroVisual({ artwork_image_url: ART, cover_image_url: COVER }, ok)).resolves.toEqual({
            url: ART,
            frame: 'landscape',
        })
    })

    it('allowlists only the IGDB CDN path in the Next image config', async () => {
        const source = await readFile('next.config.ts', 'utf8')
        expect(source).toContain("hostname: 'images.igdb.com'")
        expect(source).toContain("pathname: '/igdb/image/upload/**'")
        expect(source).not.toContain('media.rawg.io')
    })
})
