import type { NextRequest } from 'next/server'
import type { UserReviewsPage } from '@screenpeak/shared/api/user-reviews'
import { ApiError, withAuth } from '@/lib/api'
import { loadUserReviews } from '@/lib/loaders/user-reviews'
import { parseUserReviewsQuery } from '@/lib/screen-query'

const PRIVATE = { headers: { 'Cache-Control': 'private, no-store' } }

// A player's ratings and reviews. Public, including when the caller is signed out.
export const GET = withAuth(async (req: NextRequest, ctx: RouteContext<'/api/v1/user/[username]/ratings_reviews'>) => {
    const { username } = await ctx.params
    const parsed = parseUserReviewsQuery(req.nextUrl.searchParams)
    if (!parsed.ok) throw new ApiError(400, 'invalid_request', parsed.message)

    const data = await loadUserReviews(username, parsed.query)
    if (!data) throw new ApiError(404, 'not_found', 'Not found.')
    return Response.json(data satisfies UserReviewsPage, PRIVATE)
})
