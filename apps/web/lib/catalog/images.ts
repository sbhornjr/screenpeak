// Catalogue art is IGDB-hosted. Rendering goes through these helpers so a
// leftover RAWG URL never reaches next/image, portrait covers stay in a 3:4
// frame, and a share card never stretches that portrait to 1200×630.

const PATH = /^\/igdb\/image\/upload\/t_([A-Za-z0-9_]+)\/([A-Za-z0-9_-]+)\.(jpg|png|webp)$/

export const IGDB_IMAGE_HOST = 'images.igdb.com'

/** cover_big is 264×374. A 3:4 frame is slightly wider, so object-cover crops a little height. */
export const COVER_FRAME = { width: 3, height: 4 } as const
export const COVER_BIG_PIXELS = { width: 264, height: 374 } as const

/** 16:9 panel inside the 1200×630 share card. A full-height slot would crop most of a landscape shot and leave the title about 480px. */
export const SOCIAL_PANEL = { width: 576, height: 324 } as const

type IgdbImage = { rendition: string; id: string; ext: string; href: string }

export function parseIgdbImage(value: string | null | undefined): IgdbImage | null {
    if (!value) return null
    let url: URL
    try {
        url = new URL(value.startsWith('//') ? `https:${value}` : value)
    } catch {
        return null
    }
    const match = url.pathname.match(PATH)
    if (
        url.protocol !== 'https:'
        || url.hostname !== IGDB_IMAGE_HOST
        || url.port
        || url.username
        || url.password
        || url.search
        || url.hash
        || !match
    ) return null
    const rendition = match[1]
    const id = match[2]
    const ext = match[3]
    return {
        rendition,
        id,
        ext,
        href: `https://${IGDB_IMAGE_HOST}/igdb/image/upload/t_${rendition}/${id}.${ext}`,
    }
}

/** Large frames (game page, cards, pickers) ask for cover_big at 2x. Thumbs use cover_big. */
export function displayCoverUrl(value: string | null | undefined, size: 'large' | 'small'): string | null {
    const image = parseIgdbImage(value)
    if (!image) return null
    const rendition = size === 'large' ? 'cover_big_2x' : 'cover_big'
    return `https://${IGDB_IMAGE_HOST}/igdb/image/upload/t_${rendition}/${image.id}.${image.ext}`
}

function isPortraitRendition(rendition: string) {
    return rendition === 'thumb'
        || rendition === 'micro'
        || rendition.startsWith('cover')
        || rendition.startsWith('logo')
}

/** Landscape artwork or screenshot. Portrait cover renditions are refused. */
export function displayLandscapeUrl(value: string | null | undefined): string | null {
    const image = parseIgdbImage(value)
    if (!image || isPortraitRendition(image.rendition)) return null
    return image.href
}

export type SocialBackdrop = { url: string; fit: 'cover'; width: number; height: number }

type LandscapeSource = {
    artworkImageUrl?: string | null
    artwork_image_url?: string | null
    screenshots?: readonly (string | null)[] | null
    coverImageUrl?: string | null
    cover_image_url?: string | null
}

export function landscapeUrls(source: LandscapeSource): string[] {
    const candidates = [
        source.artworkImageUrl ?? source.artwork_image_url,
        ...(source.screenshots ?? []),
    ]
    const urls: string[] = []
    for (const value of candidates) {
        const url = displayLandscapeUrl(value)
        if (url && !urls.includes(url)) urls.push(url)
    }
    return urls
}

export function socialBackdrop(source: LandscapeSource): SocialBackdrop | null {
    const url = landscapeUrls(source)[0]
    if (!url) return null
    return { url, fit: 'cover', width: SOCIAL_PANEL.width, height: SOCIAL_PANEL.height }
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
