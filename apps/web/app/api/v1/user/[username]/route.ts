import type { NextRequest } from 'next/server'
import type { ProfilePageData } from '@screenpeak/shared/api/profile'
import { ApiError, withAuth } from '@/lib/api'
import { getBearerUser } from '@/lib/auth'
import { loadProfilePage } from '@/lib/loaders/profile-page'

const PRIVATE = { headers: { 'Cache-Control': 'private, no-store' } }

// A player's profile. Works signed out. Follower lists are counts only.
export const GET = withAuth(async (_req: NextRequest, ctx: RouteContext<'/api/v1/user/[username]'>) => {
    const { username } = await ctx.params
    const user = await getBearerUser()
    const data = await loadProfilePage(username, user?.id ?? null)
    if (!data) throw new ApiError(404, 'not_found', 'Not found.')
    return Response.json(data satisfies ProfilePageData, PRIVATE)
})
