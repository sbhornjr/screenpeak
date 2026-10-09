import 'server-only'
import type { z } from 'zod'
import type { CatalogGame, CatalogTaxon } from '../catalog/types'
import type { IgdbGame, IgdbLookups, imageSchema } from './schema'
import { IgdbError } from './http'

function picture(image: z.infer<typeof imageSchema> | undefined, rendition: string): string | null {
    if (!image?.url) return null
    try {
        const url = new URL(image.url.startsWith('//') ? 'https:' + image.url : image.url)
        const path = url.pathname.match(/^\/igdb\/image\/upload\/t_[A-Za-z0-9_]+\/([A-Za-z0-9_-]+)\.(jpg|png|webp)$/)
        if (url.protocol !== 'https:' || url.hostname !== 'images.igdb.com' || url.port || url.username || url.password || url.search || url.hash || !path || (image.image_id && image.image_id !== path[1])) return null
        url.pathname = `/igdb/image/upload/t_${rendition}/${path[1]}.${path[2]}`
        return url.toString()
    } catch { return null }
}
function taxa(values: { id: number; name: string; slug?: string }[]): CatalogTaxon[] {
    return [...new Map(values.map(t => [t.id, { igdbId: t.id, name: t.name, slug: t.slug ?? 'igdb-' + t.id }])).values()]
}
export function normalizeIgdbGame(game: IgdbGame, lookups: IgdbLookups): CatalogGame {
    if (game.game_type !== undefined && !lookups.gameTypes.has(game.game_type)) throw new IgdbError('game type lookup is missing; refresh lookups.')
    const screenshots = [...new Set((game.screenshots ?? []).map(i => picture(i, 'screenshot_huge')).filter((s): s is string => !!s))]
    const artwork = (game.artworks ?? []).filter(i => i.width && i.height && i.width > i.height).map(i => picture(i, 'screenshot_huge')).find(Boolean)
    const esrb = new Set<string>()
    for (const age of game.age_ratings ?? []) {
        if (age.organization !== lookups.esrbOrganizationId || age.rating_category === undefined) continue
        const category = lookups.ageCategories.get(age.rating_category)
        if (!category || category.organization !== lookups.esrbOrganizationId) throw new IgdbError('age rating lookup is missing or inconsistent.')
        esrb.add(category.rating)
    }
    const reddit = (game.websites ?? []).filter(w => w.type === lookups.redditWebsiteTypeId).map(w => {
        try {
            const url = new URL(w.url ?? '')
            return url.protocol === 'https:' && !url.username && !url.password && (url.hostname === 'reddit.com' || url.hostname.endsWith('.reddit.com')) ? url.toString() : null
        } catch { return null }
    }).find(Boolean) ?? null
    const steamAppIds = [...new Set((game.external_games ?? []).filter(e => e.external_game_source === lookups.steamSourceId && /^[1-9]\d*$/.test(e.uid ?? '')).map(e => Number(e.uid)).filter(Number.isSafeInteger))]
    return {
        igdbId: game.id, name: game.name, providerSlug: game.slug, gameType: game.game_type ?? null,
        released: game.first_release_date === undefined ? null : new Date(game.first_release_date * 1000).toISOString().slice(0, 10),
        description: game.summary ?? null, coverImageUrl: picture(game.cover, 'cover_big_2x'),
        artworkImageUrl: artwork ?? screenshots[0] ?? null, screenshots,
        esrbRating: esrb.size === 1 ? [...esrb][0] : null, redditUrl: reddit,
        providerUpdatedAt: game.updated_at === undefined ? null : new Date(game.updated_at * 1000).toISOString(),
        genres: taxa(game.genres ?? []), platforms: taxa(game.platforms ?? []),
        developers: taxa((game.involved_companies ?? []).filter(c => c.developer && c.company).map(c => c.company!)),
        publishers: taxa((game.involved_companies ?? []).filter(c => c.publisher && c.company).map(c => c.company!)), steamAppIds,
    }
}
