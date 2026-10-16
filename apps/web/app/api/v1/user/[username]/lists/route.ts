import type { NextRequest } from 'next/server'
import type { ListsPageData } from '@screenpeak/shared/api/lists'
import { ApiError, withAuth } from '@/lib/api'
import { getBearerUser } from '@/lib/auth'
import { loadUserLists } from '@/lib/loaders/lists-page'
import { parseListsTab } from '@/lib/screen-query'

const PRIVATE = { headers: { 'Cache-Control': 'private, no-store' } }

// A player's lists. Private lists are omitted unless the bearer caller owns them.
export const GET = withAuth(async (req: NextRequest, ctx: RouteContext<'/api/v1/user/[username]/lists'>) => {
    const { username } = await ctx.params
    const user = await getBearerUser()
    const parsed = parseListsTab(req.nextUrl.searchParams)
    if (!parsed.ok) throw new ApiError(400, 'invalid_request', parsed.message)

    const data = await loadUserLists(username, user?.id ?? null, parsed.query.tab)
    if (!data) throw new ApiError(404, 'not_found', 'Not found.')
    return Response.json(data satisfies ListsPageData, PRIVATE)
})
