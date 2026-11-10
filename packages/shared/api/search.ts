// GET /api/v1/games/search?q=&limit=
// GET /api/v1/taxonomy/[table]/search?q=&limit=&ids=
//
// Typeahead. Signed out is fine. `q` is required, trimmed, and at most
// SEARCH_QUERY_MAX_LENGTH. `limit` defaults to SEARCH_MAX_PAGE_SIZE and a
// larger value is 400. Taxonomy `table` is `developers` or `publishers`.
// `ids` is an optional comma-separated uuid list (TAXONOMY_SEARCH_ID_CAP).
//
// `avg_rating` is the community score out of 10 (null when nobody has rated
// the game). Covers are display-ready `t_cover_big_2x`, or null when the
// stored value is not an IGDB image. Ids are uuid strings.

import type { TAXONOMY_SEARCH_TABLES } from '../constants'

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
