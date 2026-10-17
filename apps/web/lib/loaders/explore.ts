import 'server-only'
import type { ExploreListCard, ExplorePageData, ExploreRange, ExploreUserCard } from '@screenpeak/shared/api/explore'
import { getExploreRecommendations, getTrendingGames, getTrendingLists } from '@/lib/queries/explore'
import { cover, int, num, text } from '@/lib/loaders/shape'

const RANGE_DAYS: Record<ExploreRange, number> = { week: 7, month: 30, year: 365, alltime: 3650 }

export async function loadExplore(viewerId: string | null, range: ExploreRange): Promise<ExplorePageData> {
    const days = RANGE_DAYS[range]
    const [games, lists, recommendations] = await Promise.all([
        getTrendingGames(viewerId, days),
        getTrendingLists(viewerId, days),
        viewerId ? getExploreRecommendations(viewerId) : Promise.resolve(null),
    ])

    return {
        range,
        trending_games: games.map(game => ({
            id: String(game.game_id),
            name: game.game_name,
            slug: game.game_slug,
            cover_image_url: cover(game.game_cover_image_url, 'large'),
            released: text(game.game_released),
            developer: game.game_developer,
            avg_rating: num(game.avg_rating),
            user_rating: num(game.user_rating),
        })),
        trending_lists: lists.map(list => listCard(list)),
        recommendations: recommendations && {
            games: recommendations.games.map(game => ({
                id: String(game.game_id),
                name: game.game_name,
                slug: game.game_slug,
                cover_image_url: cover(game.game_cover_image_url, 'large'),
                released: text(game.game_released),
                developer: game.game_developer,
                avg_rating: num(game.platform_avg_rating),
                user_rating: null,
                avg_follower_rating: num(game.avg_follower_rating),
                follower_count: int(game.follower_count),
                library_status: game.user_library_status,
            })),
            lists: recommendations.lists.map(list => ({
                ...listCard({
                    list_id: list.list_id,
                    list_name: list.list_name,
                    list_description: list.list_description,
                    owner_username: list.owner_username,
                    last_activity: list.last_activity,
                    game_count: list.game_count,
                    like_count: list.total_like_count,
                    user_has_liked: list.user_has_liked,
                    cover_urls: list.cover_urls,
                }),
                follower_like_count: int(list.follower_like_count),
            })),
            users: recommendations.users.map(user => userCard(user)),
        },
        viewer: viewerId ? { id: viewerId } : null,
    }
}

function listCard(list: {
    list_id: unknown
    list_name: unknown
    list_description?: unknown
    owner_username?: unknown
    last_activity?: unknown
    game_count?: unknown
    like_count?: unknown
    user_has_liked?: unknown
    cover_urls?: unknown
}): ExploreListCard {
    const urls = Array.isArray(list.cover_urls) ? list.cover_urls : []
    return {
        id: String(list.list_id),
        name: String(list.list_name ?? ''),
        description: text(list.list_description) ?? '',
        owner_username: text(list.owner_username) ?? '',
        last_activity: text(list.last_activity) ?? '',
        game_count: int(list.game_count),
        like_count: int(list.like_count),
        viewer_has_liked: !!list.user_has_liked,
        covers: urls.map(url => ({ cover_image_url: cover(url, 'small'), slug: null })),
    }
}

function userCard(user: {
    user_id: unknown
    username: unknown
    avatar_url?: unknown
    selected_title?: unknown
    created_at?: unknown
    mutual_follower_count?: unknown
    follower_count?: unknown
    following_count?: unknown
    game_count?: unknown
    avg_rating?: unknown
}): ExploreUserCard {
    return {
        id: String(user.user_id),
        username: String(user.username ?? ''),
        avatar_url: text(user.avatar_url),
        selected_title: text(user.selected_title),
        created_at: text(user.created_at) ?? '',
        mutual_follower_count: int(user.mutual_follower_count),
        follower_count: int(user.follower_count),
        following_count: int(user.following_count),
        game_count: int(user.game_count),
        avg_rating: num(user.avg_rating),
    }
}
