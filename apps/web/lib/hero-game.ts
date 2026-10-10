// Public hero selection. The minimum is a ranking rule: one or two ratings
// must not put a game on the homepage or the default share image.
export const HERO_MIN_RATINGS = 3

export type HeroCandidate = {
    id: string
    name: string
    slug: string
    cover_image_url: string | null
    artwork_image_url?: string | null
    screenshots?: unknown
    released: string | null
    avg_ngplus_rating: number | string | null
    rating_count: number | string
}

export type HeroGame = {
    id: string
    name: string
    slug: string
    cover_image_url: string | null
    artwork_image_url: string | null
    screenshots: string[] | null
    released: string | null
    avg_ngplus_rating: number
    rating_count: number
}

/** Array, a single URL, or a Postgres text-array literal. Anything else is no screenshots, not a throw. */
export function screenshotUrls(value: unknown): string[] | null {
    if (Array.isArray(value)) {
        const urls = value.filter((item): item is string => typeof item === 'string' && item.length > 0)
        return urls.length > 0 ? urls : null
    }
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    if (!trimmed) return null
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        const urls = parsePgTextArray(trimmed).filter(item => item.length > 0)
        return urls.length > 0 ? urls : null
    }
    return [trimmed]
}

function parsePgTextArray(value: string): string[] {
    const body = value.slice(1, -1)
    if (!body) return []
    const out: string[] = []
    let i = 0
    while (i < body.length) {
        if (body[i] === '"') {
            let piece = ''
            i += 1
            while (i < body.length && body[i] !== '"') {
                if (body[i] === '\\' && i + 1 < body.length) {
                    piece += body[i + 1]
                    i += 2
                    continue
                }
                piece += body[i]
                i += 1
            }
            out.push(piece)
            i += 1
            if (body[i] === ',') i += 1
            continue
        }
        const comma = body.indexOf(',', i)
        const end = comma === -1 ? body.length : comma
        const piece = body.slice(i, end).trim()
        if (piece && piece.toUpperCase() !== 'NULL') out.push(piece)
        i = end + 1
    }
    return out
}

// Most ScreenPeak ratings, then community average descending, then UUID.
// A missing average is not eligible, and it is never treated as zero.
export function selectHeroGame(candidates: HeroCandidate[]): HeroGame | null {
    const eligible: HeroGame[] = []
    for (const game of candidates) {
        const ratingCount = Number(game.rating_count)
        const average = game.avg_ngplus_rating == null || game.avg_ngplus_rating === ''
            ? null
            : Number(game.avg_ngplus_rating)
        if (!Number.isInteger(ratingCount) || ratingCount < HERO_MIN_RATINGS) continue
        if (average == null || !Number.isFinite(average) || average <= 0) continue
        eligible.push({
            id: game.id,
            name: game.name,
            slug: game.slug,
            cover_image_url: game.cover_image_url,
            artwork_image_url: game.artwork_image_url ?? null,
            screenshots: screenshotUrls(game.screenshots),
            released: game.released,
            avg_ngplus_rating: average,
            rating_count: ratingCount,
        })
    }
    eligible.sort((a, b) =>
        b.rating_count - a.rating_count
        || b.avg_ngplus_rating - a.avg_ngplus_rating
        || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    return eligible[0] ?? null
}
