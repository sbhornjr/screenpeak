// GET /api/v1/explore?range=week|month|year|alltime
//
// Trending games and lists are public. Recommendations exist only for a
// signed-in caller. Community score is `avg_rating`.
import type { GameCardData } from './games'
import type { ListCover } from './lists'

export type ExploreRange = 'week' | 'month' | 'year' | 'alltime'

export type ExploreListCard = {
    id: string
    name: string
    description: string
    owner_username: string
    last_activity: string
    game_count: number
    like_count: number
    viewer_has_liked: boolean
    covers: ListCover[]
    /** Present on recommended lists: how many people you follow liked it. */
    follower_like_count?: number
}

export type ExploreGameCard = GameCardData & {
    avg_follower_rating?: number | null
    follower_count?: number
    library_status?: string | null
}

export type ExploreUserCard = {
    id: string
    username: string
    avatar_url: string | null
    selected_title: string | null
    created_at: string
    mutual_follower_count: number
    follower_count: number
    following_count: number
    game_count: number
    avg_rating: number | null
}

export type ExplorePageData = {
    range: ExploreRange
    trending_games: GameCardData[]
    trending_lists: ExploreListCard[]
    recommendations: {
        games: ExploreGameCard[]
        lists: ExploreListCard[]
        users: ExploreUserCard[]
    } | null
    viewer: { id: string } | null
}
