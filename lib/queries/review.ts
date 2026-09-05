import type { SupabaseClient } from '@supabase/supabase-js'
import { GameRatingReview, RatingReviewData, RatingReviewCounts, AvgRatingsData, GameRatingsStats } from '@/types'
import { ratingReviewSchema, parseOrError } from '@/lib/schemas'

// Rating counts + distribution for a game, computed server-side rather than
// pulling every rating/review row (with joined user data) into memory.
export async function getGameRatingsStats(supabase: SupabaseClient, gameId: string): Promise<GameRatingsStats> {
    const { data } = await supabase.rpc('get_game_ratings_stats', { p_game_id: gameId })
    return data?.[0] ?? {
        total_ratings: 0, total_reviews: 0, avg_rating: null,
        rating_1: 0, rating_2: 0, rating_3: 0, rating_4: 0, rating_5: 0,
        rating_6: 0, rating_7: 0, rating_8: 0, rating_9: 0, rating_10: 0,
    }
}

export async function getUserRatingReviewForGame(supabase: SupabaseClient, gameId: string, userId: string) {
    const { data } = await supabase
        .from('ratings_reviews')
        .select('user_id, rating, review, created_at, updated_at, users(username, display_name, avatar_url)')
        .eq('game_id', gameId)
        .eq('user_id', userId)
        .maybeSingle()

    return data as unknown as GameRatingReview | null
}

type GameReviewsPageParams = {
    limit: number
    offset: number
    sort: "date" | "rating"
    order: "asc" | "desc"
    excludeUserId?: string
}

// Paginated, written reviews for a game (rating rows with no review text are excluded).
export async function getGameReviewsForPage(supabase: SupabaseClient, gameId: string, { limit, offset, sort, order, excludeUserId }: GameReviewsPageParams) {
    const sortColumn = sort === "rating" ? "rating" : "updated_at"

    let query = supabase
        .from('ratings_reviews')
        .select('user_id, rating, review, created_at, updated_at, users(username, display_name, avatar_url)', { count: 'exact' })
        .eq('game_id', gameId)
        .neq('review', '')
        .order(sortColumn, { ascending: order === "asc" })
        .range(offset, offset + limit - 1)

    if (excludeUserId) {
        query = query.neq('user_id', excludeUserId)
    }

    const { data, count } = await query

    return { reviews: (data ?? []) as unknown as GameRatingReview[], count: count ?? 0 }
}

export async function createRatingReview(supabase: SupabaseClient, { userId, gameId, rating, review }: { userId: string, gameId: string, rating: number | string, review: string }) {
    const parsed = parseOrError(ratingReviewSchema, { rating, review })
    if (!parsed.success) return { data: null, error: parsed.error }

    const { data, error } = await supabase
        .from('ratings_reviews')
        .insert({ user_id: userId, game_id: gameId, rating: parsed.data.rating, review: parsed.data.review })
        .select('rating, review, user_id, created_at, updated_at')
        .single()

    if (error) return { data: null, error: error.message }
    return { data, error: null }
}

export async function updateRatingReview(supabase: SupabaseClient, { userId, gameId, rating, review }: { userId: string, gameId: string, rating: number | string, review: string }) {
    const parsed = parseOrError(ratingReviewSchema, { rating, review })
    if (!parsed.success) return { data: null, error: parsed.error }

    const { data, error } = await supabase
        .from('ratings_reviews')
        .update({ rating: parsed.data.rating, review: parsed.data.review })
        .eq('user_id', userId)
        .eq('game_id', gameId)
        .select('rating, review, user_id, created_at, updated_at')
        .single()

    if (error) return { data: null, error: error.message }
    return { data, error: null }
}

// Full rows (used by the loadout page's stats + rating distribution)
export async function getUserRatings(supabase: SupabaseClient, userId: string) {
    const { data } = await supabase
        .from('ratings_reviews')
        .select('game_id, rating, review')
        .eq('user_id', userId)

    return data ?? []
}

export async function getAvgRatingsForGames(supabase: SupabaseClient, gameIds: (string | number)[]): Promise<AvgRatingsData[]> {
    const { data } = await supabase.rpc('get_avg_ratings_for_games', { p_game_ids: gameIds })
    return data ?? []
}

export async function getUserRatingsForGames(supabase: SupabaseClient, userId: string, gameIds: (string | number)[]) {
    const { data } = await supabase
        .from('ratings_reviews')
        .select('game_id, rating')
        .eq('user_id', userId)
        .in('game_id', gameIds)

    return data ?? []
}

type RatingsReviewsPageParams = {
    userId?: string
    filter: string
    sort: string
    order: string
    limit: number
    offset: number
}

export async function getUserRatingsReviewsPage(supabase: SupabaseClient, params: RatingsReviewsPageParams): Promise<RatingReviewData[]> {
    const { data } = await supabase.rpc('get_user_ratings_reviews', {
        p_user_id: params.userId,
        p_filter: params.filter,
        p_sort: params.sort,
        p_order: params.order,
        p_limit: params.limit,
        p_offset: params.offset,
    })

    return data ?? []
}

export async function getUserRatingsReviewsCounts(supabase: SupabaseClient, userId?: string): Promise<RatingReviewCounts[]> {
    const { data } = await supabase.rpc('get_user_ratings_reviews_counts', { p_user_id: userId })
    return data ?? [{ total_count: 0, review_count: 0, rating_count: 0 }]
}

type RecentReview = GameRatingReview & { games: { name: string, slug: string } }

// Same shape as getRecentReviews, but site-wide — used on the logged-out
// landing page to show real activity instead of a personalized feed.
export async function getRecentReviewsGlobal(supabase: SupabaseClient, limit = 3): Promise<(RecentReview & { games: { name: string, slug: string, cover_image_url: string } })[]> {
    const { data } = await supabase
        .from('ratings_reviews')
        .select('user_id, rating, review, created_at, updated_at, users(username, display_name, avatar_url), games(name, slug, cover_image_url)')
        .neq('review', '')
        .order('created_at', { ascending: false })
        .limit(limit)

    return (data ?? []) as unknown as (RecentReview & { games: { name: string, slug: string, cover_image_url: string } })[]
}

export async function getRecentReviews(supabase: SupabaseClient, userId: string, limit = 3): Promise<RecentReview[]> {
    const { data } = await supabase
        .from('ratings_reviews')
        .select('user_id, rating, review, created_at, updated_at, users(username, display_name, avatar_url), games(name, slug)')
        .eq('user_id', userId)
        .neq('review', '')
        .order('created_at', { ascending: false })
        .limit(limit)

    return (data ?? []) as unknown as RecentReview[]
}
