import 'server-only'
import type { GameCardData } from '@screenpeak/shared/api/games'
import type { LoadoutPageData } from '@screenpeak/shared/api/loadout'
import { buildLoadoutInput } from '@/lib/loadout'
import { getDeveloperNameMap } from '@/lib/queries/game'
import { getAvgRatingsForGames, getUserRatings, getUserRatingsForGames } from '@/lib/queries/review'
import { getLoadoutRatingHighlights } from '@/lib/queries/stats'
import { getAccountSettings, getCurrentLoadoutIdentity, getUserIdFromUsername } from '@/lib/queries/user'
import { gameCard, num } from '@/lib/loaders/shape'

/** Null when the player is missing or the loadout is private to this caller. */
export async function loadLoadoutPage(username: string, viewerId: string | null): Promise<LoadoutPageData | null> {
    const owner = await getUserIdFromUsername(username)
    if (!owner) return null

    const isOwner = viewerId === owner.id
    if (!isOwner) {
        const settings = await getAccountSettings(owner.id)
        if (!settings?.loadout_public) return null
    }

    const [input, ratings, highlights, identity] = await Promise.all([
        buildLoadoutInput(owner.id, username),
        getUserRatings(owner.id),
        getLoadoutRatingHighlights(owner.id),
        getCurrentLoadoutIdentity(owner.id),
    ])

    const highlightIds = highlights.map(item => item.game_id)
    const [averages, viewerRatings, developers] = await Promise.all([
        highlightIds.length ? getAvgRatingsForGames(highlightIds) : Promise.resolve([]),
        viewerId && highlightIds.length ? getUserRatingsForGames(viewerId, highlightIds) : Promise.resolve([]),
        highlightIds.length ? getDeveloperNameMap(highlightIds) : Promise.resolve(new Map<string, string | null>()),
    ])
    const avgById = new Map(averages.map(row => [String(row.game_id), row.avg_rating]))
    const userById = new Map(viewerRatings.map(row => [String(row.game_id), row.rating]))

    const card = (item: typeof highlights[number]): GameCardData => gameCard({
        id: item.game_id,
        name: item.game_name,
        slug: item.game_slug,
        cover_image_url: item.cover_image_url,
        released: item.released,
        avg_rating: avgById.get(String(item.game_id)) ?? null,
        user_rating: viewerId ? (userById.get(String(item.game_id)) ?? null) : null,
    }, developers.get(String(item.game_id)) ?? null)

    const counts = new Map<number, number>()
    for (const rating of ratings) {
        const score = num(rating.rating)
        if (score == null) continue
        counts.set(score, (counts.get(score) ?? 0) + 1)
    }

    return {
        username,
        total_games: input.totalGames,
        completed_games: input.completedGames,
        rating_count: ratings.length,
        avg_rating: ratings.length > 0 ? input.avgRating : null,
        identity: identity?.loadout_identity ?? '',
        can_generate: input.totalRatings >= 5,
        genres: (input.topGenres ?? []).filter(genre => genre.rated_count > 1).slice(0, 6),
        developers: (input.topDevelopers ?? []).filter(developer => developer.rated_count > 1).slice(0, 6),
        distribution: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map(rating => ({ rating, count: counts.get(rating) ?? 0 })),
        top_games: highlights.filter(item => item.highlight_type === 'top').map(card),
        bottom_games: highlights.filter(item => item.highlight_type === 'bottom').map(card),
        viewer: viewerId ? { is_owner: isOwner } : null,
    }
}
