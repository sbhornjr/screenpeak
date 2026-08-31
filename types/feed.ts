export type FeedItem = {
    activity_type: string
    created_at: string
    actor_id: string
    actor_username: string
    actor_avatar_url: string | null
    game_id: string | null
    game_name: string | null
    game_slug: string | null
    game_cover_image_url: string | null
    game_released: string | null
    game_metacritic_score: number | null
    game_developer: string | null
    game_avg_rating: number | null
    viewer_game_rating: number | null
    list_cover_urls: string[] | null
    list_id: string | null
    list_name: string | null
    list_description: string | null
    list_owner_username: string | null
    list_game_count: number | null
    list_last_activity: string | null
    list_like_count: number | null
    viewer_liked_list: boolean | null
    rating: number | null
    review: string | null
    review_created_at: string | null
    review_updated_at: string | null
    library_status: string | null
    library_game_count: number | null
    library_cover_urls: string[] | null
    library_game_names: string[] | null
}
