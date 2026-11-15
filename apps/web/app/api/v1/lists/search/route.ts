import type { NextRequest } from 'next/server'
import type { ListSearchPage } from '@screenpeak/shared/api/search'
import { ApiError, withAuth } from '@/lib/api'
import { getBearerUser } from '@/lib/auth'
import { searchListsByName } from '@/lib/queries/list'
import { consumeSearchRateLimit } from '@/lib/rate-limit'
import { parseListSearchQuery } from '@/lib/screen-query'
import { toListSearchHit } from '@/lib/search-shape'

const PRIVATE = { headers: { 'Cache-Control': 'private, no-store' } }

// List-name typeahead. Works signed out. A signed-in caller also matches
// their own private lists — `searchListsByName` forwards the viewer id for
// that ownership check.
export const GET = withAuth(async (req: NextRequest) => {
    const user = await getBearerUser()
    const parsed = parseListSearchQuery(req.nextUrl.searchParams)
    if (!parsed.ok) throw new ApiError(400, 'invalid_request', parsed.message)
    await consumeSearchRateLimit(user?.id ?? null, req.headers)

    const rows = await searchListsByName(parsed.query.q, parsed.query.limit, user?.id ?? null)
    const data: ListSearchPage = { lists: rows.map(toListSearchHit) }
    return Response.json(data satisfies ListSearchPage, PRIVATE)
})
