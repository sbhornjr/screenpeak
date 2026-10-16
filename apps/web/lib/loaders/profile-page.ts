import 'server-only'
import type { ProfilePageData, ProfileReview } from '@screenpeak/shared/api/profile'
import { getDeveloperNameMap, queryGames } from '@/lib/queries/game'
import { getLibraryStatusBreakdown } from '@/lib/queries/library'
import { getRecentReviews, getUserRatings } from '@/lib/queries/review'
import { getLoadoutDeveloperStats } from '@/lib/queries/stats'
import { getFollowers, getFollowing, getFullProfile } from '@/lib/queries/user'
import { gameCard, num, text } from '@/lib/loaders/shape'

/** Null when the username does not exist. */
export async function loadProfilePage(username: string, viewerId: string | null): Promise<ProfilePageData | null> {
    const profile = await getFullProfile(username)
    if (!profile) return null

    const isOwner = viewerId === profile.id
    const canSeeLibrary = isOwner || !!profile.library_public
    const canSeeLoadout = isOwner || !!profile.loadout_public
    const favoriteIds = profile.favorite_game_ids ?? []

    const [followers, following, library, favorites, reviews, ratings, developers] = await Promise.all([
        getFollowers(profile.id),
        getFollowing(profile.id),
        canSeeLibrary ? getLibraryStatusBreakdown(profile.id) : Promise.resolve(null),
        favoriteIds.length
            ? queryGames({ userId: viewerId, gameIds: favoriteIds })
            : Promise.resolve([]),
        getRecentReviews(profile.id),
        getUserRatings(profile.id),
        isOwner ? getLoadoutDeveloperStats(profile.id) : Promise.resolve([]),
    ])

    const developerNames = await getDeveloperNameMap(favoriteIds)
    const byId = new Map(favorites.map(game => [String(game.id), game]))
    const ordered = favoriteIds
        .map(id => byId.get(String(id)))
        .filter((game): game is NonNullable<typeof game> => !!game)
        .reverse()

    const ratingCount = ratings.length
    const average = ratingCount === 0
        ? null
        : ratings.reduce((sum, row) => sum + (num(row.rating) ?? 0), 0) / ratingCount

    const recent: ProfileReview[] = reviews.map(review => ({
        user_id: String(review.user_id),
        rating: num(review.rating) ?? 0,
        review: review.review ?? '',
        created_at: text(review.created_at) ?? '',
        updated_at: text(review.updated_at) ?? '',
        users: {
            username: review.users?.username ?? '',
            display_name: review.users?.display_name ?? '',
            avatar_url: review.users?.avatar_url ?? '',
        },
        games: { name: review.games?.name ?? '', slug: review.games?.slug ?? '' },
    }))

    return {
        profile: {
            id: profile.id,
            username: profile.username,
            display_name: profile.display_name,
            avatar_url: profile.avatar_url,
            created_at: text(profile.created_at),
            selected_title: profile.selected_title,
            user_bio: profile.user_bio,
            profile_loadout_bio: canSeeLoadout ? (profile.profile_loadout_bio ?? null) : null,
            library_public: !!profile.library_public,
            loadout_public: !!profile.loadout_public,
            follower_count: followers.length,
            following_count: following.length,
        },
        library_stats: library
            ? {
                total_games: library.totalCount,
                completed: library.entries.filter(entry => entry.status === 'completed').length,
            }
            : null,
        favorites: ordered.map(game => gameCard(game, developerNames.get(String(game.id)) ?? null)),
        recent_reviews: recent,
        rating_count: ratingCount,
        avg_rating: average,
        viewer: viewerId
            ? {
                is_owner: isOwner,
                is_following: followers.some(row => row.follower_id === viewerId),
                top_developer_names: isOwner ? developers.slice(0, 6).map(row => row.developer_name) : [],
            }
            : null,
    }
}
