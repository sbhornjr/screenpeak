import 'server-only'
import type { UserReviewsPage, UserReviewsQuery } from '@screenpeak/shared/api/user-reviews'
import { getDeveloperNameMap } from '@/lib/queries/game'
import { getUserRatingsReviewsCounts, getUserRatingsReviewsPage } from '@/lib/queries/review'
import { getProfileSummaryByUsername } from '@/lib/queries/user'
import { cover, int, num, text } from '@/lib/loaders/shape'

/** Null when the username does not exist. Ratings and reviews are public. */
export async function loadUserReviews(username: string, query: UserReviewsQuery): Promise<UserReviewsPage | null> {
    const profile = await getProfileSummaryByUsername(username)
    if (!profile) return null

    const [rows, counts] = await Promise.all([
        getUserRatingsReviewsPage({
            userId: profile.id,
            filter: query.filter,
            sort: query.sort,
            order: query.order,
            limit: query.pageSize,
            offset: (query.page - 1) * query.pageSize,
        }),
        getUserRatingsReviewsCounts(profile.id),
    ])

    const developers = await getDeveloperNameMap(rows.map(row => row.game_id))
    const total = int(rows[0]?.total_count)
    const count = counts[0] ?? { total_count: 0, review_count: 0, rating_count: 0 }

    return {
        username: profile.username,
        counts: {
            total_count: int(count.total_count),
            review_count: int(count.review_count),
            rating_count: int(count.rating_count),
        },
        total,
        total_pages: query.pageSize > 0 ? Math.ceil(total / query.pageSize) : 0,
        items: rows.map(row => ({
            game_id: String(row.game_id),
            game_name: row.game_name,
            game_slug: row.game_slug,
            cover_image_url: cover(row.game_cover_image_url, 'small'),
            released: text(row.game_released),
            developer: developers.get(String(row.game_id)) ?? row.game_developer ?? null,
            rating: num(row.rating) ?? 0,
            review: row.review ?? '',
            updated_at: text(row.updated_at) ?? '',
        })),
    }
}
