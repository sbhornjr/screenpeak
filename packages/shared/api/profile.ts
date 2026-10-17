// GET /api/v1/user/[username]
//
// Followers and following are counts. Library totals and the profile read-out
// are omitted unless the caller is the owner or that section is public.
import type { GameCardData } from './games'

export type ProfileReview = {
    user_id: string
    rating: number
    review: string
    created_at: string
    updated_at: string
    users: { username: string; display_name: string; avatar_url: string }
    games: { name: string; slug: string }
}

export type ProfileViewer = {
    is_owner: boolean
    is_following: boolean
    /** Names for the owner's title picker. Empty for everyone else. */
    top_developer_names: string[]
}

export type ProfilePageData = {
    profile: {
        id: string
        username: string
        display_name: string | null
        avatar_url: string | null
        created_at: string | null
        selected_title: string | null
        user_bio: string | null
        /** Null when the loadout is private and the caller is not the owner. */
        profile_loadout_bio: string | null
        library_public: boolean
        loadout_public: boolean
        follower_count: number
        following_count: number
    }
    /** Null when the library is private and the caller is not the owner. */
    library_stats: { total_games: number; completed: number } | null
    favorites: GameCardData[]
    recent_reviews: ProfileReview[]
    rating_count: number
    /** Null when the player has no ratings. */
    avg_rating: number | null
    viewer: ProfileViewer | null
}
