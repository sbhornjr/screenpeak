// GET /api/v1/games/search?q=&limit=
// GET /api/v1/taxonomy/[table]/search?q=&limit=&ids=
// GET /api/v1/users/search?q=&limit=   -> UserSearchPage
// GET /api/v1/lists/search?q=&limit=   -> ListSearchPage
//
// Typeahead. Signed out is fine. `q` is required, trimmed, and at most
// SEARCH_QUERY_MAX_LENGTH. `limit` defaults to SEARCH_MAX_PAGE_SIZE and a
// larger value is 400. Taxonomy `table` is `developers` or `publishers`.
// `ids` is an optional comma-separated uuid list (TAXONOMY_SEARCH_ID_CAP).
//
// `avg_rating` is the community score out of 10 (null when nobody has rated
// the game). Covers are display-ready `t_cover_big_2x`, or null when the
// stored value is not an IGDB image. Ids are uuid strings.
//
// User search matches `username`. `follower_count` is bulk-computed and is 0
// for a user nobody follows. `avatar_url` is null when the user has none.
//
// List search matches list `name`. `ListSearchHit` mirrors `ListCard`'s shape
// (`@screenpeak/shared/api/lists`): `owner_username`, `game_count`,
// `like_count`, `viewer_has_liked`, `covers` (`ListCover[]`, display-ready
// URLs) and `last_activity`. `description` is always a string, never null,
// matching `ListCard`.

import type { TAXONOMY_SEARCH_TABLES } from '../constants'
import type { ListCover } from './lists'

export type TaxonomySearchTable = (typeof TAXONOMY_SEARCH_TABLES)[number]

export type GameSearchHit = {
    id: string
    name: string
    slug: string
    /** Display-ready cover, or null when the stored value is not an IGDB image. */
    cover_image_url: string | null
    released: string | null
    /** Community score out of 10. Null when the game has no ratings. */
    avg_rating: number | null
}

export type GameSearchPage = {
    games: GameSearchHit[]
}

export type TaxonomySearchHit = {
    id: string
    name: string
    slug: string
}

export type TaxonomySearchPage = {
    results: TaxonomySearchHit[]
}

export type UserSearchHit = {
    id: string
    username: string
    avatar_url: string | null
    /** Bulk-computed; 0 for a user nobody follows. */
    follower_count: number
}
export type UserSearchPage = { users: UserSearchHit[] }

export type ListSearchHit = {
    id: string
    name: string
    description: string
    owner_username: string
    last_activity: string
    game_count: number
    like_count: number
    viewer_has_liked: boolean
    covers: ListCover[]
}
export type ListSearchPage = { lists: ListSearchHit[] }
