// GET /api/v1/user/[username]/loadout
//
// Null (404) when the player does not exist or the loadout is private and the
// caller is not the owner. The read-out text is `identity`.
import type { GameCardData } from './games'

export type LoadoutGenre = {
    genre_name: string
    weighted_rating: number
    rated_count: number
    completed_count: number
}

export type LoadoutDeveloper = {
    developer_name: string
    weighted_rating: number
    rated_count: number
    game_count: number
}

export type LoadoutPageData = {
    username: string
    total_games: number
    completed_games: number
    rating_count: number
    /** Null when the player has no ratings. */
    avg_rating: number | null
    identity: string
    /** True when the saved stats include at least five ratings. */
    can_generate: boolean
    genres: LoadoutGenre[]
    developers: LoadoutDeveloper[]
    distribution: { rating: number; count: number }[]
    top_games: GameCardData[]
    bottom_games: GameCardData[]
    viewer: { is_owner: boolean } | null
}
