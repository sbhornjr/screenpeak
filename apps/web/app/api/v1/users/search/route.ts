import type { NextRequest } from 'next/server'
import type { UserSearchPage } from '@screenpeak/shared/api/search'
import { ApiError, withAuth } from '@/lib/api'
import { getBearerUser } from '@/lib/auth'
import { searchUsersByUsername } from '@/lib/queries/user'
import { consumeSearchRateLimit } from '@/lib/rate-limit'
import { parseUserSearchQuery } from '@/lib/screen-query'
import { toUserSearchHit } from '@/lib/search-shape'

const PRIVATE = { headers: { 'Cache-Control': 'private, no-store' } }

// Username typeahead. Works signed out. A bad bearer still fails closed.
export const GET = withAuth(async (req: NextRequest) => {
    const user = await getBearerUser()
    const parsed = parseUserSearchQuery(req.nextUrl.searchParams)
    if (!parsed.ok) throw new ApiError(400, 'invalid_request', parsed.message)
    await consumeSearchRateLimit(user?.id ?? null, req.headers)

    const rows = await searchUsersByUsername(parsed.query.q, parsed.query.limit)
    const data: UserSearchPage = { users: rows.map(toUserSearchHit) }
    return Response.json(data satisfies UserSearchPage, PRIVATE)
})
