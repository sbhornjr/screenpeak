// Public hero selection. The minimum is a ranking rule: one or two ratings
// must not put a game on the homepage or the default share image.
export const HERO_MIN_RATINGS = 3

export type HeroCandidate = {
    id: string
    name: string
    slug: string
    cover_image_url: string | null
    released: string | null
    avg_ngplus_rating: number | string | null
    rating_count: number | string
}

export type HeroGame = {
    id: string
    name: string
    slug: string
    cover_image_url: string | null
    released: string | null
    avg_ngplus_rating: number
    rating_count: number
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
