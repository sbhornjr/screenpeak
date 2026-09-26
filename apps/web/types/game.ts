// Lightweight game shape used by GameCard and game-picker components
export type Game = {
    id: string
    name: string
    slug: string
    cover_image_url: string | null
    metacritic_score: number | null
    released: string | null
}

// Game shape returned by the `query_games` RPC (search/library/explore listings)
export type GameData = {
    id: number
    name: string
    slug: string
    cover_image_url: string
    metacritic_score: number
    released: string
    avg_ngplus_rating: number
    user_rating: number
    total_count: number
}

export type AdvancedStats = {
    is100: boolean
    hoursPlayed: number | null
    playCount: number
}
