import type { NextRequest } from 'next/server'
import type { ExplorePageData } from '@screenpeak/shared/api/explore'
import { ApiError, withAuth } from '@/lib/api'
import { getBearerUser } from '@/lib/auth'
import { loadExplore } from '@/lib/loaders/explore'
import { parseExploreQuery } from '@/lib/screen-query'

const PRIVATE = { headers: { 'Cache-Control': 'private, no-store' } }

// Trending games and lists. Recommendations are present only for a bearer caller.
export const GET = withAuth(async (req: NextRequest) => {
    const user = await getBearerUser()
    const parsed = parseExploreQuery(req.nextUrl.searchParams)
    if (!parsed.ok) throw new ApiError(400, 'invalid_request', parsed.message)

    const data = await loadExplore(user?.id ?? null, parsed.query.range)
    return Response.json(data satisfies ExplorePageData, PRIVATE)
})
