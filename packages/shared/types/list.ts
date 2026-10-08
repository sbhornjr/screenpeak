import { Game } from './game'

export type GameCover = {
    coverImageUrl: string | null
    slug: string | null
}

// Shape returned by get_user_lists / get_liked_lists RPCs
export type ListSummary = {
    id: number
    name: string
    description: string
    is_public: boolean
    is_default: boolean
    is_pinned: boolean
    created_at: string
    last_activity: string
    game_count: number
}

// ListSummary plus owner info, used on the user lists index page
export type ListWithOwner = ListSummary & {
    owner_username: string
    owner_avatar_url: string | null
    owner_id: string
}

// Row shape for a single list fetched directly from the `lists` table
export type ListDetail = {
    id: string
    name: string
    description: string
    is_public: boolean
    is_pinned: boolean
    is_default: boolean
    created_at: string
    updated_at: string
}

// list_games row joined with its game — a to-one join, so `games` is a single object,
// not an array (the untyped Supabase client can't infer join cardinality on its own).
export type ListGameEntry = {
    games: Game
}

export type AvgRatingsData = {
    game_id: number
    avg_rating: number
}
