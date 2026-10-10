// Catalogue art is IGDB-hosted. Rendering goes through these helpers so a
// leftover RAWG URL never reaches next/image, portrait covers stay in a 3:4
// frame, and a share card never stretches that portrait to 1200×630.

const PATH = /^\/igdb\/image\/upload\/t_([A-Za-z0-9_]+)\/([A-Za-z0-9_-]+)\.(jpg|png|webp)$/

export const IGDB_IMAGE_HOST = 'images.igdb.com'

/** cover_big is 264×374. A 3:4 frame is slightly wider, so object-cover crops a little height. */
export const COVER_FRAME = { width: 3, height: 4 } as const
export const COVER_BIG_PIXELS = { width: 264, height: 374 } as const

/** Wide slot inside the 1200×630 share card. object-fit: cover preserves the landscape aspect. */
export const SOCIAL_PANEL = { width: 720, height: 630 } as const

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

export function socialBackdrop(source: {
    artworkImageUrl?: string | null
    artwork_image_url?: string | null
    screenshots?: readonly (string | null)[] | null
    coverImageUrl?: string | null
    cover_image_url?: string | null
}): SocialBackdrop | null {
    const candidates = [
        source.artworkImageUrl ?? source.artwork_image_url,
        ...(source.screenshots ?? []),
    ]
    const url = candidates.map(value => displayLandscapeUrl(value)).find((item): item is string => item != null)
    if (!url) return null
    return { url, fit: 'cover', width: SOCIAL_PANEL.width, height: SOCIAL_PANEL.height }
}
