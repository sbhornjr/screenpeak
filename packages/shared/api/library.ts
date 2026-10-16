// GET /api/v1/user/[username]/library
//
// Null from the loader (404 from the route) when the player does not exist or
// the library is private and the caller is not the owner. A public library is
// readable signed out, with viewer scores null.
import type { GameCardData } from './games'

export type LibrarySort = 'name' | 'ngplus_rating' | 'your_rating' | 'date_added'
export type LibraryStatus = '' | 'playing' | 'completed' | 'backlog' | 'abandoned'

export type LibraryQuery = {
    q: string | null
    genre: string | null
    platform: string | null
    developer: string | null
    publisher: string | null
    esrb: string | null
    sort: LibrarySort
    order: 'asc' | 'desc'
    status: LibraryStatus
    is100: boolean
}

export type LibraryFacet = { id: string; name: string; slug: string }

export type LibraryGameCard = GameCardData & {
    library_status: string | null
    completed_all_achievements: boolean
    hours_played: number | null
    play_count: number
}

export type LibraryPageData = {
    username: string
    facets: {
        genres: LibraryFacet[]
        platforms: LibraryFacet[]
        developers: LibraryFacet[]
        publishers: LibraryFacet[]
        esrb_ratings: string[]
    }
    games: LibraryGameCard[]
}
