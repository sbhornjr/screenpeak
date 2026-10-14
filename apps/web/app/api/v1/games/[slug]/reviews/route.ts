import type { NextRequest } from 'next/server'
import type { GameReviewsPage } from '@screenpeak/shared/api/games'
import { ApiError, withAuth } from '@/lib/api'
import { getOptionalUser } from '@/lib/auth'
import { parseGameReviewsQuery } from '@/lib/game-reviews-query'
import { getGameIdBySlug } from '@/lib/queries/game'
import { getGameReviewsForPage } from '@/lib/queries/review'

// A game's written reviews, one page at a time, for the phone app — the same
// query the game page renders its review list from. Works signed out; signed
// in, the viewer's own review is left out (it's `viewer.review` on GET /api/v1/games/[slug]).
// A DB error propagates to withAuth → 500, rather than looking like "no reviews".
export const GET = withAuth(async (req: NextRequest, ctx: RouteContext<'/api/v1/games/[slug]/reviews'>) => {
    const { slug } = await ctx.params
    const user = await getOptionalUser()

    const parsed = parseGameReviewsQuery(req.nextUrl.searchParams)
    if (!parsed.ok) throw new ApiError(400, 'invalid_request', parsed.message)

    const gameId = await getGameIdBySlug(slug)
    if (!gameId) throw new ApiError(404, 'not_found', 'No game with that slug.')

    const data = await getGameReviewsForPage(gameId, parsed.query, user?.id ?? null)

    // Which reviews come back depends on who's asking (their own is excluded):
    // never let a shared cache store it and serve it to someone else.
    return Response.json(data satisfies GameReviewsPage, { headers: { 'Cache-Control': 'private, no-store' } })
})
