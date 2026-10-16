// Catalogue art is IGDB-hosted. Rendition choice lives in @screenpeak/shared/images
// so the phone and GET /api/v1/games/[slug] pick the same URLs. This file
// re-exports those helpers and keeps the byte checks, which need fetch and
// Node's Buffer and do not ship in the phone app.

export {
    COVER_BIG_PIXELS,
    COVER_FRAME,
    IGDB_IMAGE_HOST,
    SOCIAL_PANEL,
    displayCoverUrl,
    displayGameImages,
    displayLandscapeUrl,
    landscapeUrls,
    parseIgdbImage,
    socialBackdrop,
    type SocialBackdrop,
} from '@screenpeak/shared/images'

import { IGDB_IMAGE_HOST, SOCIAL_PANEL, displayCoverUrl, landscapeUrls, parseIgdbImage, type SocialBackdrop } from '@screenpeak/shared/images'

type LandscapeSource = {
    artworkImageUrl?: string | null
    artwork_image_url?: string | null
    screenshots?: readonly (string | null)[] | null
    coverImageUrl?: string | null
    cover_image_url?: string | null
}

const IMAGE_TYPES: Record<string, (bytes: Uint8Array) => boolean> = {
    'image/png': bytes => bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47,
    'image/jpeg': bytes => bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
    'image/gif': bytes => bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46,
    'image/webp': bytes => bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57 && bytes[9] === 0x45,
}

const MAX_IMAGE_BYTES = 6_000_000

export type CatalogImageBytes = { type: string; bytes: Uint8Array }

/** Fetch an IGDB image and keep it only when the status, host, type, and magic bytes all agree. */
export async function readCatalogImage(url: string, fetchImpl: typeof fetch = fetch): Promise<CatalogImageBytes | null> {
    const parsed = parseIgdbImage(url)
    if (!parsed || parsed.href !== url) return null
    try {
        const response = await fetchImpl(parsed.href, { signal: AbortSignal.timeout(4000) })
        if (!response.ok) return null
        let finalHost = ''
        try { finalHost = new URL(response.url || parsed.href).hostname } catch { return null }
        if (finalHost !== IGDB_IMAGE_HOST) return null
        const type = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
        const magic = IMAGE_TYPES[type]
        if (!magic) return null
        const bytes = new Uint8Array(await response.arrayBuffer())
        if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES || !magic(bytes)) return null
        return { type, bytes }
    } catch {
        return null
    }
}

export async function inlineCatalogImage(url: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
    const image = await readCatalogImage(url, fetchImpl)
    if (!image) return null
    return `data:${image.type};base64,${Buffer.from(image.bytes).toString('base64')}`
}

/** Share-card backdrop whose bytes were checked. A 404, timeout, or non-image body becomes null so the card can draw without the art. */
export async function resolveSocialBackdrop(source: LandscapeSource, fetchImpl: typeof fetch = fetch): Promise<SocialBackdrop | null> {
    for (const url of landscapeUrls(source)) {
        const inline = await inlineCatalogImage(url, fetchImpl)
        if (inline) return { url: inline, fit: 'cover', width: SOCIAL_PANEL.width, height: SOCIAL_PANEL.height }
    }
    return null
}

export type HeroVisual = { url: string; frame: 'landscape' | 'portrait' }

/** Landscape art when its bytes load; otherwise the portrait cover. A 404 does not stay in the 16:9 frame. */
export async function resolveHeroVisual(source: LandscapeSource, fetchImpl: typeof fetch = fetch): Promise<HeroVisual | null> {
    for (const url of landscapeUrls(source)) {
        if (await readCatalogImage(url, fetchImpl)) return { url, frame: 'landscape' }
    }
    const cover = displayCoverUrl(source.coverImageUrl ?? source.cover_image_url, 'large')
    if (!cover) return null
    return { url: cover, frame: 'portrait' }
}
