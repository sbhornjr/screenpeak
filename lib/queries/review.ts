import { eq, and, ne, desc, asc, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { ratingsReviews, users, games } from '@/db/schema'
import { GameRatingReview, RatingReviewData, RatingReviewCounts, AvgRatingsData, GameRatingsStats } from '@/types'
import { ratingReviewSchema, parseOrError } from '@/lib/schemas'
import { uuidArrayParam } from '@/lib/sql-helpers'

const DEFAULT_STATS: GameRatingsStats = {
    total_ratings: 0, total_reviews: 0, avg_rating: null,
    rating_1: 0, rating_2: 0, rating_3: 0, rating_4: 0, rating_5: 0,
    rating_6: 0, rating_7: 0, rating_8: 0, rating_9: 0, rating_10: 0,
}

// Rating counts + distribution for a game, computed server-side rather than
// pulling every rating/review row (with joined user data) into memory.
export async function getGameRatingsStats(gameId: string): Promise<GameRatingsStats> {
    try {
        const rows = await db.execute(sql`select * from get_game_ratings_stats(p_game_id => ${gameId})`)
        return (rows[0] as unknown as GameRatingsStats) ?? DEFAULT_STATS
    } catch {
        return DEFAULT_STATS
    }
}

export async function getUserRatingReviewForGame(gameId: string, userId: string) {
    try {
        const rows = await db
            .select({
                user_id: ratingsReviews.userId,
                rating: ratingsReviews.rating,
                review: ratingsReviews.review,
                created_at: ratingsReviews.createdAt,
                updated_at: ratingsReviews.updatedAt,
                users: { username: users.username, display_name: users.displayName, avatar_url: users.avatarUrl },
            })
            .from(ratingsReviews)
            .innerJoin(users, eq(ratingsReviews.userId, users.id))
            .where(and(eq(ratingsReviews.gameId, gameId), eq(ratingsReviews.userId, userId)))
            .limit(1)

        return (rows[0] as unknown as GameRatingReview) ?? null
    } catch {
        return null
    }
}

type GameReviewsPageParams = {
    limit: number
    offset: number
    sort: "date" | "rating"
    order: "asc" | "desc"
    excludeUserId?: string
}

// Paginated, written reviews for a game (rating rows with no review text are excluded).
export async function getGameReviewsForPage(gameId: string, { limit, offset, sort, order, excludeUserId }: GameReviewsPageParams) {
    const conditions = [eq(ratingsReviews.gameId, gameId), ne(ratingsReviews.review, '')]
    if (excludeUserId) conditions.push(ne(ratingsReviews.userId, excludeUserId))

    const sortColumn = sort === "rating" ? ratingsReviews.rating : ratingsReviews.updatedAt
    const orderFn = order === "asc" ? asc : desc

    try {
        const [rows, countRows] = await Promise.all([
            db
                .select({
                    user_id: ratingsReviews.userId,
                    rating: ratingsReviews.rating,
                    review: ratingsReviews.review,
                    created_at: ratingsReviews.createdAt,
                    updated_at: ratingsReviews.updatedAt,
                    users: { username: users.username, display_name: users.displayName, avatar_url: users.avatarUrl },
                })
                .from(ratingsReviews)
                .innerJoin(users, eq(ratingsReviews.userId, users.id))
                .where(and(...conditions))
                .orderBy(orderFn(sortColumn))
                .limit(limit)
                .offset(offset),
            db.select({ count: sql<number>`count(*)::int` }).from(ratingsReviews).where(and(...conditions)),
        ])

        return { reviews: rows as unknown as GameRatingReview[], count: countRows[0]?.count ?? 0 }
    } catch {
        return { reviews: [], count: 0 }
    }
}

export async function createRatingReview({ userId, gameId, rating, review }: { userId: string, gameId: string, rating: number | string, review: string }) {
    const parsed = parseOrError(ratingReviewSchema, { rating, review })
    if (!parsed.success) return { data: null, error: parsed.error }

    try {
        const rows = await db
            .insert(ratingsReviews)
            .values({ userId, gameId, rating: parsed.data.rating, review: parsed.data.review })
            .returning({
                rating: ratingsReviews.rating,
                review: ratingsReviews.review,
                user_id: ratingsReviews.userId,
                created_at: ratingsReviews.createdAt,
                updated_at: ratingsReviews.updatedAt,
            })

        return { data: rows[0], error: null }
    } catch (error) {
        return { data: null, error: error instanceof Error ? error.message : String(error) }
    }
}

export async function updateRatingReview({ userId, gameId, rating, review }: { userId: string, gameId: string, rating: number | string, review: string }) {
    const parsed = parseOrError(ratingReviewSchema, { rating, review })
    if (!parsed.success) return { data: null, error: parsed.error }

    try {
        const rows = await db
            .update(ratingsReviews)
            .set({ rating: parsed.data.rating, review: parsed.data.review })
            .where(and(eq(ratingsReviews.userId, userId), eq(ratingsReviews.gameId, gameId)))
            .returning({
                rating: ratingsReviews.rating,
                review: ratingsReviews.review,
                user_id: ratingsReviews.userId,
                created_at: ratingsReviews.createdAt,
                updated_at: ratingsReviews.updatedAt,
            })

        return { data: rows[0], error: null }
    } catch (error) {
        return { data: null, error: error instanceof Error ? error.message : String(error) }
    }
}

// Full rows (used by the loadout page's stats + rating distribution)
export async function getUserRatings(userId: string) {
    try {
        return await db
            .select({ game_id: ratingsReviews.gameId, rating: ratingsReviews.rating, review: ratingsReviews.review })
            .from(ratingsReviews)
            .where(eq(ratingsReviews.userId, userId))
    } catch {
        return []
    }
}

export async function getAvgRatingsForGames(gameIds: (string | number)[]): Promise<AvgRatingsData[]> {
    try {
        const rows = await db.execute(sql`select * from get_avg_ratings_for_games(p_game_ids => ${uuidArrayParam(gameIds)})`)
        return rows as unknown as AvgRatingsData[]
    } catch {
        return []
    }
}

export async function getUserRatingsForGames(userId: string, gameIds: (string | number)[]) {
    try {
        return await db
            .select({ game_id: ratingsReviews.gameId, rating: ratingsReviews.rating })
            .from(ratingsReviews)
            .where(and(eq(ratingsReviews.userId, userId), inArray(ratingsReviews.gameId, gameIds.map(String))))
    } catch {
        return []
    }
}

type RatingsReviewsPageParams = {
    userId?: string
    filter: string
    sort: string
    order: string
    limit: number
    offset: number
}

export async function getUserRatingsReviewsPage(params: RatingsReviewsPageParams): Promise<RatingReviewData[]> {
    try {
        const rows = await db.execute(sql`
            select * from get_user_ratings_reviews(
                p_user_id => ${params.userId ?? null},
                p_filter => ${params.filter},
                p_sort => ${params.sort},
                p_order => ${params.order},
                p_limit => ${params.limit},
                p_offset => ${params.offset}
            )
        `)
        return rows as unknown as RatingReviewData[]
    } catch {
        return []
    }
}

export async function getUserRatingsReviewsCounts(userId?: string): Promise<RatingReviewCounts[]> {
    const fallback = [{ total_count: 0, review_count: 0, rating_count: 0 }]
    try {
        const rows = await db.execute(sql`select * from get_user_ratings_reviews_counts(p_user_id => ${userId ?? null})`)
        return rows.length > 0 ? (rows as unknown as RatingReviewCounts[]) : fallback
    } catch {
        return fallback
    }
}

type RecentReview = GameRatingReview & { games: { name: string, slug: string } }

// Same shape as getRecentReviews, but site-wide — used on the logged-out
// landing page to show real activity instead of a personalized feed.
export async function getRecentReviewsGlobal(limit = 3): Promise<(RecentReview & { games: { name: string, slug: string, cover_image_url: string } })[]> {
    try {
        const rows = await db
            .select({
                user_id: ratingsReviews.userId,
                rating: ratingsReviews.rating,
                review: ratingsReviews.review,
                created_at: ratingsReviews.createdAt,
                updated_at: ratingsReviews.updatedAt,
                users: { username: users.username, display_name: users.displayName, avatar_url: users.avatarUrl },
                games: { name: games.name, slug: games.slug, cover_image_url: games.coverImageUrl },
            })
            .from(ratingsReviews)
            .innerJoin(users, eq(ratingsReviews.userId, users.id))
            .innerJoin(games, eq(ratingsReviews.gameId, games.id))
            .where(ne(ratingsReviews.review, ''))
            .orderBy(desc(ratingsReviews.createdAt))
            .limit(limit)

        return rows as unknown as (RecentReview & { games: { name: string, slug: string, cover_image_url: string } })[]
    } catch {
        return []
    }
}

export async function getRecentReviews(userId: string, limit = 3): Promise<RecentReview[]> {
    try {
        const rows = await db
            .select({
                user_id: ratingsReviews.userId,
                rating: ratingsReviews.rating,
                review: ratingsReviews.review,
                created_at: ratingsReviews.createdAt,
                updated_at: ratingsReviews.updatedAt,
                users: { username: users.username, display_name: users.displayName, avatar_url: users.avatarUrl },
                games: { name: games.name, slug: games.slug },
            })
            .from(ratingsReviews)
            .innerJoin(users, eq(ratingsReviews.userId, users.id))
            .innerJoin(games, eq(ratingsReviews.gameId, games.id))
            .where(and(eq(ratingsReviews.userId, userId), ne(ratingsReviews.review, '')))
            .orderBy(desc(ratingsReviews.createdAt))
            .limit(limit)

        return rows as unknown as RecentReview[]
    } catch {
        return []
    }
}
