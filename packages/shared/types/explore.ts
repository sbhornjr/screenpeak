export type TrendingGame = {
    game_id: string
    game_name: string
    game_slug: string
    game_cover_image_url: string | null
    game_released: string | null
    metacritic_score: number | null
    game_developer: string | null
    avg_rating: number | null
    user_rating: number | null
}

export type TrendingList = {
    list_id: string
    list_name: string
    list_description: string | null
    owner_username: string
    last_activity: string
    game_count: number
    like_count: number
    recent_like_count: number
    user_has_liked: boolean
    cover_urls: string[] | null
}

export type RecommendedGame = {
    game_id: string
    game_name: string
    game_slug: string
    game_cover_image_url: string | null
    game_released: string | null
    metacritic_score: number | null
    game_developer: string | null
    avg_follower_rating: number | null
    follower_count: number | null
    platform_avg_rating: number | null
    user_library_status: string | null
}

export type RecommendedList = {
    list_id: string
    list_name: string
    list_description: string | null
    owner_username: string
    last_activity: string
    follower_like_count: number
    total_like_count: number
    user_has_liked: boolean
    cover_urls: string[] | null
    game_count: number
}

export type RecommendedUser = {
    user_id: string
    username: string
    display_name: string | null
    avatar_url: string | null
    selected_title: string | null
    created_at: string
    mutual_follower_count: number
    follower_count: number
    following_count: number
    game_count: number
    avg_rating: number | null
}
