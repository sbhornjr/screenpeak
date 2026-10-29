// Plain constants both apps need. Dependency-free on purpose: client code (the
// web's 'use client' FeedList, the phone app) imports these, so this file must
// never pull in db/postgres — the reason FEED_PAGE_SIZE was split out of
// apps/web/lib/queries/feed.ts in the first place.

/** Feed items per page — the web's infinite scroll and the /api/v1 feed use the same size. */
export const FEED_PAGE_SIZE = 12

/** Game reviews per page by default, and the most the API allows (the web's
 *  "Results" menu offers 10 / 25 / 50 / 100). */
export const GAME_REVIEWS_PAGE_SIZE = 10
export const GAME_REVIEWS_MAX_PAGE_SIZE = 100

/** Typeahead search. The query is trimmed. `limit` defaults to this cap. */
export const SEARCH_QUERY_MAX_LENGTH = 100
export const SEARCH_MAX_PAGE_SIZE = 20

/** `ids` on taxonomy search, comma-separated on the API. */
export const TAXONOMY_SEARCH_ID_CAP = 200

export const TAXONOMY_SEARCH_TABLES = ['developers', 'publishers'] as const

/** A library row's status, in the order both apps list them. */
export const LIBRARY_STATUSES = ['backlog', 'playing', 'completed', 'abandoned'] as const
export type LibraryStatus = (typeof LIBRARY_STATUSES)[number]
