import { eq, and, ne, desc, asc, avg, count, inArray, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { ratingsReviews, users, games } from '@/db/schema'
import { GameRatingReview, RatingReviewData, RatingReviewCounts, AvgRatingsData, GameRatingsStats } from '@screenpeak/shared/types'
import type { GameReviewsPage } from '@screenpeak/shared/api/games'
import type { GameReviewsQuery } from '@/lib/game-reviews-query'
import { ratingReviewSchema, parseOrError } from '@screenpeak/shared/schemas'
import { parseDbTimestamp } from '@/lib/dates'
import { writeErrorText } from '@/lib/write-http'
import { uuidArrayParam } from '@/lib/sql-helpers'

const DEFAULT_STATS: GameRatingsStats = {
    total_ratings: 0, total_reviews: 0, avg_rating: null,
    rating_1: 0, rating_2: 0, rating_3: 0, rating_4: 0, rating_5: 0,
    rating_6: 0, rating_7: 0, rating_8: 0, rating_9: 0, rating_10: 0,
}

// Rating counts + distribution for a game, computed server-side rather than
// pulling every rating/review row (with joined user data) into memory.
export async function getGameRatingsStats(gameId: string): Promise<GameRatingsStats> {
    // No row is an unrated game. A thrown query is an outage, not an empty board.
    const rows = await db.execute(sql`select * from get_game_ratings_stats(p_game_id => ${gameId})`)
    return (rows[0] as unknown as GameRatingsStats) ?? DEFAULT_STATS
}

export async function getUserRatingReviewForGame(gameId: string, userId: string) {
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
}

// One page of a game's written reviews (rating rows with no review text are
// excluded), in the shared GameReviewsPage shape — the game page renders it and
// GET /api/v1/games/[slug]/reviews returns it as-is. Reviews are public: no
// privacy gate. Signed in, the viewer's own review is left out (they see it
// separately, as `viewer.review`).
//
// Unlike most queries here, a DB error THROWS rather than returning an empty
// page: through the API, an outage must be a 500, not "this game has no
// reviews". The web page catches it and shows the empty list, as it always has.
export async function getGameReviewsForPage(gameId: string, query: GameReviewsQuery, viewerId: string | null): Promise<GameReviewsPage> {
    const { page, pageSize, sort, order } = query
    const conditions = [eq(ratingsReviews.gameId, gameId), ne(ratingsReviews.review, '')]
    if (viewerId) conditions.push(ne(ratingsReviews.userId, viewerId))

    const sortColumn = sort === "rating" ? ratingsReviews.rating : ratingsReviews.updatedAt
    const orderFn = order === "asc" ? asc : desc

    const [rows, countRows] = await Promise.all([
        db
            // Exactly the contract's fields — this select is what the API sends
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
            // Tie-breakers make the order total: many reviews share a rating, and
            // with OFFSET paging an unstable order repeats some rows across pages
            // and skips others. Most recently edited first among equal ratings,
            // then the row id (unique) as the final word.
            .orderBy(
                orderFn(sortColumn),
                ...(sort === "rating" ? [desc(ratingsReviews.updatedAt)] : []),
                asc(ratingsReviews.id),
            )
            .limit(pageSize)
            .offset((page - 1) * pageSize),
        db.select({ count: sql<number>`count(*)::int` }).from(ratingsReviews).where(and(...conditions)),
    ])

    const total = countRows[0]?.count ?? 0
    return {
        reviews: rows as unknown as GameRatingReview[],
        total,
        totalPages: Math.ceil(total / pageSize),
    }
}

/** The website's Rate action and PUT /api/v1/games/[slug]/review both call this. */
export async function saveRatingReview(userId: string, gameId: string, rating: number | string, review: string, isUpdate: boolean) {
    // isUpdate only tells the route whether to answer 201 or 200. The write
    // itself is INSERT … ON CONFLICT so two first ratings cannot 500.
    void isUpdate
    return upsertRatingReview({ userId, gameId, rating, review })
}

async function upsertRatingReview({ userId, gameId, rating, review }: { userId: string, gameId: string, rating: number | string, review: string }) {
    const parsed = parseOrError(ratingReviewSchema, { rating, review })
    if (!parsed.success) return { data: null, error: parsed.error }

    try {
        const rows = await db
            .insert(ratingsReviews)
            .values({ userId, gameId, rating: parsed.data.rating, review: parsed.data.review })
            .onConflictDoUpdate({
                target: [ratingsReviews.userId, ratingsReviews.gameId],
                set: { rating: parsed.data.rating, review: parsed.data.review },
            })
            .returning({
                rating: ratingsReviews.rating,
                review: ratingsReviews.review,
                user_id: ratingsReviews.userId,
                created_at: ratingsReviews.createdAt,
                updated_at: ratingsReviews.updatedAt,
            })

        const row = rows[0]
        if (!row) return { data: null, error: 'rating write returned no row' }
        return {
            data: {
                ...row,
                created_at: row.created_at ? parseDbTimestamp(row.created_at).toISOString() : null,
                updated_at: row.updated_at ? parseDbTimestamp(row.updated_at).toISOString() : null,
            },
            error: null,
        }
    } catch (error) {
        return { data: null, error: writeErrorText(error) }
    }
}

export async function createRatingReview(input: { userId: string, gameId: string, rating: number | string, review: string }) {
    return upsertRatingReview(input)
}

export async function updateRatingReview(input: { userId: string, gameId: string, rating: number | string, review: string }) {
    return upsertRatingReview(input)
}

/** One aggregate row. A database error rejects. Null average means the player has no ratings. */
export async function getRatingSummary(userId: string): Promise<{ rating_count: number; avg_rating: number | null }> {
    const rows = await db
        .select({
            rating_count: count(),
            avg_rating: avg(ratingsReviews.rating),
        })
        .from(ratingsReviews)
        .where(eq(ratingsReviews.userId, userId))
    const row = rows[0]
    const ratingCount = row?.rating_count ?? 0
    const average = row?.avg_rating == null || row.avg_rating === '' ? null : Number(row.avg_rating)
    return {
        rating_count: ratingCount,
        avg_rating: ratingCount === 0 || average == null || !Number.isFinite(average) ? null : average,
    }
}

// Full rows (used by the loadout page's stats + rating distribution)
export async function getUserRatings(userId: string) {
    // A database error must reject. An empty list would look like a player with no ratings.
    return await db
        .select({ game_id: ratingsReviews.gameId, rating: ratingsReviews.rating, review: ratingsReviews.review })
        .from(ratingsReviews)
        .where(eq(ratingsReviews.userId, userId))
}

export async function getAvgRatingsForGames(gameIds: (string | number)[]): Promise<AvgRatingsData[]> {
    const rows = await db.execute(sql`select * from get_avg_ratings_for_games(p_game_ids => ${uuidArrayParam(gameIds)})`)
    return rows as unknown as AvgRatingsData[]
}

export async function getUserRatingsForGames(userId: string, gameIds: (string | number)[]) {
    return await db
        .select({ game_id: ratingsReviews.gameId, rating: ratingsReviews.rating })
        .from(ratingsReviews)
        .where(and(eq(ratingsReviews.userId, userId), inArray(ratingsReviews.gameId, gameIds.map(String))))
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
}

export async function getUserRatingsReviewsCounts(userId?: string): Promise<RatingReviewCounts[]> {
    const rows = await db.execute(sql`select * from get_user_ratings_reviews_counts(p_user_id => ${userId ?? null})`)
    if (rows.length > 0) return rows as unknown as RatingReviewCounts[]
    return [{ total_count: 0, review_count: 0, rating_count: 0 }]
}

type RecentReview = GameRatingReview & { games: { name: string, slug: string } }

// Same shape as getRecentReviews, but site-wide — used on the logged-out
// landing page to show real activity instead of a personalized feed.
export async function getRecentReviewsGlobal(limit = 3): Promise<(RecentReview & { games: { name: string, slug: string, cover_image_url: string } })[]> {
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
}

export async function getRecentReviews(userId: string, limit = 3): Promise<RecentReview[]> {
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
}
