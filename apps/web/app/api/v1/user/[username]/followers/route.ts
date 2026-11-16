import type { NextRequest } from 'next/server'
import type { FollowListPage } from '@screenpeak/shared/api/profile'
import { ApiError, withAuth } from '@/lib/api'
import { getBearerUser } from '@/lib/auth'
import { loadFollowList } from '@/lib/loaders/follow-list'

const PRIVATE = { headers: { 'Cache-Control': 'private, no-store' } }

// A missing player and a viewer the player has blocked are the same 404.
export const GET = withAuth(async (req: NextRequest, ctx: RouteContext<'/api/v1/user/[username]/followers'>) => {
    const { username } = await ctx.params
    const user = await getBearerUser()
    const users = await loadFollowList(username, 'followers', user?.id ?? null)
    if (!users) throw new ApiError(404, 'not_found', 'Not found.')
    return Response.json({ users } satisfies FollowListPage, PRIVATE)
})
