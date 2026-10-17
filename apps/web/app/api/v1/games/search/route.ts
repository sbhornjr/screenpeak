import type { NextRequest } from 'next/server'
import type { GameSearchPage } from '@screenpeak/shared/api/search'
import { ApiError, withAuth } from '@/lib/api'
import { getBearerUser } from '@/lib/auth'
import { searchGamesByName } from '@/lib/queries/game'
import { consumeSearchRateLimit } from '@/lib/rate-limit'
import { parseGameSearchQuery } from '@/lib/screen-query'
import { toGameSearchHit } from '@/lib/search-shape'

const PRIVATE = { headers: { 'Cache-Control': 'private, no-store' } }

// Typeahead for game names. Works signed out. A bad bearer still fails closed.
// Static `search` wins over games/[slug], so a game whose slug is "search"
// is not served here.
export const GET = withAuth(async (req: NextRequest) => {
    const user = await getBearerUser()
    const parsed = parseGameSearchQuery(req.nextUrl.searchParams)
    if (!parsed.ok) throw new ApiError(400, 'invalid_request', parsed.message)
    await consumeSearchRateLimit(user?.id ?? null, req.headers)

    const rows = await searchGamesByName(parsed.query.q, parsed.query.limit)
    const data: GameSearchPage = { games: rows.map(toGameSearchHit) }
    return Response.json(data satisfies GameSearchPage, PRIVATE)
})
