// GET /api/v1/user/[username]/lists
// GET /api/v1/user/[username]/lists/[listId]
//
// Private lists are included only for their owner, on the owner's user tab.
// A list detail that is private, missing, or owned by someone else is null
// (404). Like rows are a count plus the viewer's own flag — never the liker ids.
import type { GameCardData } from './games'

export type ListsTab = 'user' | 'liked'

export type ListCover = {
    cover_image_url: string | null
    slug: string | null
}

export type ListCard = {
    id: string
    name: string
    description: string
    is_public: boolean
    is_pinned: boolean
    is_default: boolean
    last_activity: string
    game_count: number
    owner_username: string
    owner_id: string
    covers: ListCover[]
    like_count: number
    viewer_has_liked: boolean
}

export type ListsPageData = {
    profile: { id: string; username: string; avatar_url: string | null }
    tab: ListsTab
    /** The owner's "new list starts public" setting. Null for everyone else. */
    default_list_public: boolean | null
    lists: ListCard[]
}

export type ListPageData = {
    profile: { id: string; username: string; avatar_url: string | null }
    list: {
        id: string
        name: string
        description: string
        is_public: boolean
        is_pinned: boolean
        is_default: boolean
        updated_at: string
        game_count: number
    }
    like_count: number
    games: GameCardData[]
    /** Null when signed out. */
    viewer: { is_owner: boolean; has_liked: boolean } | null
}
