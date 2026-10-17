import 'server-only'
import type { HomeLandingData } from '@screenpeak/shared/api/home'
import { getTrendingGames } from '@/lib/queries/explore'
import { getHeroGame } from '@/lib/queries/game'
import { getRecentReviewsGlobal } from '@/lib/queries/review'
import { getFeaturedLoadout } from '@/lib/queries/user'
import { cover, gameCard, int, landscapes, num, text } from '@/lib/loaders/shape'
import { displayLandscapeUrl } from '@screenpeak/shared/images'

const FEATURED_LOADOUT_USERNAME = 'hornflakes'

/** The signed-out landing page. Nothing here is viewer-specific. */
export async function loadHomeLanding(): Promise<HomeLandingData> {
    const [hero, trending, reviews, featured] = await Promise.all([
        getHeroGame(),
        getTrendingGames(null, 30),
        getRecentReviewsGlobal(3),
        getFeaturedLoadout(FEATURED_LOADOUT_USERNAME),
    ])

    return {
        hero: hero && {
            id: String(hero.id),
            name: hero.name,
            slug: hero.slug,
            cover_image_url: cover(hero.cover_image_url, 'large'),
            artwork_image_url: displayLandscapeUrl(hero.artwork_image_url),
            screenshots: landscapes(hero.screenshots),
            released: text(hero.released),
            avg_rating: num(hero.avg_ngplus_rating) ?? 0,
            rating_count: int(hero.rating_count),
        },
        trending_games: trending.slice(0, 5).map(game => gameCard({
            id: game.game_id,
            name: game.game_name,
            slug: game.game_slug,
            cover_image_url: game.game_cover_image_url,
            released: game.game_released,
            avg_rating: game.avg_rating,
            user_rating: null,
        }, game.game_developer)),
        recent_reviews: reviews.map(review => ({
            user_id: String(review.user_id),
            rating: num(review.rating) ?? 0,
            review: review.review ?? '',
            created_at: text(review.created_at) ?? '',
            updated_at: text(review.updated_at) ?? '',
            users: {
                username: review.users?.username ?? '',
                display_name: review.users?.display_name ?? '',
                avatar_url: review.users?.avatar_url ?? null,
            },
            games: {
                name: review.games?.name ?? '',
                slug: review.games?.slug ?? '',
                cover_image_url: cover(review.games?.cover_image_url, 'small'),
            },
        })),
        featured_loadout: featured,
    }
}
