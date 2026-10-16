import type { NextRequest } from 'next/server'
import type { GamesListPage } from '@screenpeak/shared/api/games'
import { ApiError, withAuth } from '@/lib/api'
import { getBearerUser } from '@/lib/auth'
import { loadGamesPage } from '@/lib/loaders/games-page'
import { parseGamesListQuery } from '@/lib/screen-query'

const PRIVATE = { headers: { 'Cache-Control': 'private, no-store' } }

// The games catalogue. Works signed out (viewer null, user_rating null).
// Community score is avg_rating. A database error is 500, not an empty grid.
export const GET = withAuth(async (req: NextRequest) => {
    const user = await getBearerUser()
    const parsed = parseGamesListQuery(req.nextUrl.searchParams)
    if (!parsed.ok) throw new ApiError(400, 'invalid_request', parsed.message)

    const data = await loadGamesPage(parsed.query, user?.id ?? null)
    return Response.json(data satisfies GamesListPage, PRIVATE)
})
