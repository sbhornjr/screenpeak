// GET /api/v1/games/[slug] — the game page's data, and the shape the web page
// renders from too (both call the same loader, apps/web/lib/loaders/game-page.ts).
//
// This is a public contract: old app versions keep calling it, so change it
// additively only. Field names follow the database (snake_case), like the rest
// of @screenpeak/shared/types. Timestamps are Postgres text
// ("2026-09-23 04:16:14.25+00"), not ISO — parse them with parseDbTimestamp().
import type { GameRatingReview, GameRatingsStats } from '../types'

export type GameDetail = {
    id: string
    name: string
    slug: string
    /** Transitional preparation schema; removed by the coordinated prelaunch IGDB contract change. */
    rawg_id: number | null
    cover_image_url: string | null
    /** "YYYY-MM-DD" */
    released: string | null
    metacritic_score: number | null
    description: string | null
    esrb_rating: string | null
    reddit_url: string | null
    screenshots: string[] | null
    created_at: string | null
}

/** A genre, platform, developer or publisher. */
export type Taxon = { id: string; name: string; slug: string }

export type GameTaxonomy = {
    genres: Taxon[]
    platforms: Taxon[]
    developers: Taxon[]
    publishers: Taxon[]
}

/** The viewer's own library entry for this game. */
export type ViewerLibraryEntry = {
    id: string
    /** 'playing' | 'completed' | 'backlog' | 'abandoned' in practice, but the column has no
     *  CHECK constraint, so treat an unknown value gracefully rather than trusting a union. */
    status: string
    completed_all_achievements: boolean
    hours_played: number | null
    play_count: number
}

/** One of the viewer's lists, as the "add to list" control needs it. */
export type ViewerListOption = {
    id: string
    name: string
    game_count: number
}

/** Everything about this game that's specific to the signed-in viewer. */
export type GamePageViewer = {
    /** Their rating / review of this game, if any */
    review: GameRatingReview | null
    libraryEntry: ViewerLibraryEntry | null
    /** All their lists, private ones included */
    lists: ViewerListOption[]
    /** Ids of those lists that already contain this game */
    listIdsGameIsIn: string[]
    /** Whether a list they create from this page starts public */
    defaultListPrivacy: boolean
}

export type GamePageData = {
    game: GameDetail
    taxonomy: GameTaxonomy
    stats: GameRatingsStats
    /** null when signed out */
    viewer: GamePageViewer | null
}

// GET /api/v1/games/[slug]/reviews?page=&pageSize=&sort=&order=
//
// Written reviews of a game, one page at a time. Every parameter is optional:
// page (1-based) 1, pageSize GAME_REVIEWS_PAGE_SIZE (max GAME_REVIEWS_MAX_PAGE_SIZE),
// sort 'date' (last edited) | 'rating', order 'desc' | 'asc'. An out-of-range
// value is a 400 invalid_request — never silently adjusted — so the request the
// app sent is exactly the page it gets back. Another page exists while
// page < totalPages. Signed in, the viewer's own review is left out — it's
// `viewer.review` on GET /api/v1/games/[slug].

export type SortOrder = 'asc' | 'desc'

export type GameReviewsPage = {
    reviews: GameRatingReview[]
    /** Written reviews across all pages (excluding the viewer's own) */
    total: number
    totalPages: number
}

// GET /api/v1/games

export type GamesPageData = {
    
}