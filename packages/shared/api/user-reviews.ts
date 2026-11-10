// GET /api/v1/user/[username]/ratings_reviews?filter=&sort=&order=&page=&pageSize=
//
// A player's ratings and written reviews. Public. Null (404) when the
// username does not exist.

export type UserReviewsQuery = {
    filter: 'all' | 'ratings' | 'reviews'
    sort: 'date' | 'rating'
    order: 'asc' | 'desc'
    page: number
    pageSize: number
}

export type UserReviewItem = {
    game_id: string
    game_name: string
    game_slug: string
    /** Display-ready thumb. */
    cover_image_url: string | null
    released: string | null
    developer: string | null
    rating: number
    review: string
    updated_at: string
}

export type UserReviewsPage = {
    username: string
    counts: { total_count: number; review_count: number; rating_count: number }
    total: number
    total_pages: number
    items: UserReviewItem[]
}
