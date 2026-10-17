import type { NextRequest } from 'next/server'
import type { ListPageData } from '@screenpeak/shared/api/lists'
import { ApiError, withAuth } from '@/lib/api'
import { getBearerUser } from '@/lib/auth'
import { loadListPage } from '@/lib/loaders/list-page'

const PRIVATE = { headers: { 'Cache-Control': 'private, no-store' } }

// One list. Private, missing, and wrong-owner lists are the same 404.
export const GET = withAuth(async (_req: NextRequest, ctx: RouteContext<'/api/v1/user/[username]/lists/[listId]'>) => {
    const { username, listId } = await ctx.params
    const user = await getBearerUser()
    const data = await loadListPage(username, listId, user?.id ?? null)
    if (!data) throw new ApiError(404, 'not_found', 'Not found.')
    return Response.json(data satisfies ListPageData, PRIVATE)
})
