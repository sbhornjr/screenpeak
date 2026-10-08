export type DeveloperStatType = {
    developer_name: string
    avg_rating: number
    weighted_rating: number
    game_count: number
    rated_count: number
}

export type GenreStatType = {
    avg_rating: number
    completed_count: number
    genre_id: string
    genre_name: string
    rated_count: number
    total_count: number
    weighted_rating: number
}

export type StatusStatType = {
    status: string
    count: number
}

export type HighlightType = {
    cover_image_url: string
    game_id: string
    game_name: string
    game_slug: string
    highlight_type: string
    rating: number
    released: string
    metacritic_score: number
}
