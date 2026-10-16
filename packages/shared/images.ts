// Catalogue art is IGDB-hosted. These helpers pick a rendition and refuse any
// other host, so a leftover RAWG URL never becomes a request. Both apps and
// the /api/v1 game payload use them. No Node, no React — URL is the runtime
// global (Node, Hermes, and browsers all have it). The shared tsconfig omits
// the DOM lib, so the constructor is read off globalThis.

const PATH = /^\/igdb\/image\/upload\/t_([A-Za-z0-9_]+)\/([A-Za-z0-9_-]+)\.(jpg|png|webp)$/

export const IGDB_IMAGE_HOST = 'images.igdb.com'

/** cover_big is 264×374. A 3:4 frame is slightly wider, so object-cover crops a little height. */
export const COVER_FRAME = { width: 3, height: 4 } as const
export const COVER_BIG_PIXELS = { width: 264, height: 374 } as const

/** 16:9 panel inside the 1200×630 share card. A full-height slot would crop most of a landscape shot and leave the title about 480px. */
export const SOCIAL_PANEL = { width: 576, height: 324 } as const

type IgdbImage = { rendition: string; id: string; ext: string; href: string }

type UrlParts = {
    protocol: string
    hostname: string
    port: string
    username: string
    password: string
    search: string
    hash: string
    pathname: string
}

function parseUrl(value: string): UrlParts | null {
    const URLCtor = (globalThis as { URL?: new (input: string) => UrlParts }).URL
    if (!URLCtor) return null
    try {
        return new URLCtor(value)
    } catch {
        return null
    }
}

export function parseIgdbImage(value: string | null | undefined): IgdbImage | null {
    if (!value) return null
    const url = parseUrl(value.startsWith('//') ? `https:${value}` : value)
    if (!url) return null
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

/** The game-page payload's image fields: a large cover, landscape art, and landscape shots. */
export function displayGameImages(source: {
    cover_image_url: string | null
    artwork_image_url: string | null
    screenshots: string[] | null
}): { cover_image_url: string | null; artwork_image_url: string | null; screenshots: string[] } {
    return {
        cover_image_url: displayCoverUrl(source.cover_image_url, 'large'),
        artwork_image_url: displayLandscapeUrl(source.artwork_image_url),
        screenshots: (source.screenshots ?? []).flatMap(url => {
            const landscape = displayLandscapeUrl(url)
            return landscape ? [landscape] : []
        }),
    }
}
