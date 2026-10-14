import { z } from 'zod'
import { GAME_REVIEWS_MAX_PAGE_SIZE, GAME_REVIEWS_PAGE_SIZE } from '@screenpeak/shared/constants'

// The ?page=&pageSize=&sort=&order= parameters for a game's reviews, read from a
// URL two ways: strictly for GET /api/v1/games/[slug]/reviews (a bad value is the
// caller's error → 400) and leniently for the game page (a hand-edited URL falls
// back per parameter, as it always has). Both feed getGameReviewsForPage.

const fields = {
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(GAME_REVIEWS_MAX_PAGE_SIZE).default(GAME_REVIEWS_PAGE_SIZE),
    sort: z.enum(['date', 'rating']).default('date'),
    order: z.enum(['asc', 'desc']).default('desc'),
}
const strictSchema = z.object(fields)

/** The parsed parameters getGameReviewsForPage takes. Server-side only — the app
 *  just sends the URL params, so this isn't part of the shared contract. */
export type GameReviewsQuery = z.infer<typeof strictSchema>

// Per-field fallback: one bad value doesn't reset the others.
const lenientSchema = z.object({
    page: fields.page.catch(1),
    pageSize: fields.pageSize.catch(GAME_REVIEWS_PAGE_SIZE),
    sort: fields.sort.catch('date'),
    order: fields.order.catch('desc'),
})

/** For the API: `message` names the bad parameter, for a 400 invalid_request. */
export function parseGameReviewsQuery(params: URLSearchParams):
    { ok: true; query: GameReviewsQuery } | { ok: false; message: string } {
    const result = strictSchema.safeParse(Object.fromEntries(params))
    if (result.success) return { ok: true, query: result.data }
    const issue = result.error.issues[0]
    return { ok: false, message: `Invalid \`${issue.path.join('.')}\`: ${issue.message}` }
}

/** For the game page: an invalid value falls back to its default. */
export function parseGameReviewsQueryLenient(params: Record<string, string | string[] | undefined>): GameReviewsQuery {
    return lenientSchema.parse(params)
}
