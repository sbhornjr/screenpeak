// Rating/review row joined with the reviewing user, used on the game detail page
export type GameRatingReview = {
    user_id: string
    rating: number
    review: string
    created_at: string
    updated_at: string
    users: {
        username: string
        display_name: string
        avatar_url: string
    }
}

// Row returned by get_user_ratings_reviews RPC (user's ratings/reviews page)
export type RatingReviewData = {
    rating: number
    review: string
    created_at: string
    updated_at: string
    game_id: number
    game_name: string
    game_slug: string
    game_cover_image_url: string
    game_released: string
    game_developer: string
    total_count: number
}

export type RatingReviewCounts = {
    total_count: number
    review_count: number
    rating_count: number
}

// Row returned by get_game_ratings_stats RPC (game detail page rating summary + distribution)
export type GameRatingsStats = {
    total_ratings: number
    total_reviews: number
    rating_1: number
    rating_2: number
    rating_3: number
    rating_4: number
    rating_5: number
    rating_6: number
    rating_7: number
    rating_8: number
    rating_9: number
    rating_10: number
    avg_rating: number | null
}

// Minimal rating/review shape used for loadout stat calculations
export type SimpleRatingReview = {
    game_id: number
    rating: number
    review: string
}
