import type { NextRequest } from 'next/server'
import type { FollowResult } from '@screenpeak/shared/api/writes'
import { ApiError, withAuth } from '@/lib/api'
import { requireBearerUser } from '@/lib/auth'
import { consumeWriteRateLimit } from '@/lib/rate-limit'
import { followUser, unfollowUser, userExists } from '@/lib/queries/user'
import { jsonPrivate, uuidParam } from '@/lib/write-http'

// The segment is the account id. The folder stays [username] because that
// dynamic path already serves the profile reads.
async function targetId(ctx: { params: Promise<{ username: string }> }, callerId: string) {
    const { username } = await ctx.params
    const userId = uuidParam(username, 'userId')
    if (userId === callerId) throw new ApiError(400, 'invalid_request', 'You cannot follow yourself.')
    if (!await userExists(userId)) throw new ApiError(404, 'not_found', 'Not found.')
    return userId
}

export const POST = withAuth(async (_req: NextRequest, ctx: RouteContext<'/api/v1/user/[username]/follow'>) => {
    const user = await requireBearerUser()
    await consumeWriteRateLimit(user.id)
    const userId = await targetId(ctx, user.id)
    await followUser(user.id, userId)
    return jsonPrivate({ following: true } satisfies FollowResult)
})

export const DELETE = withAuth(async (_req: NextRequest, ctx: RouteContext<'/api/v1/user/[username]/follow'>) => {
    const user = await requireBearerUser()
    await consumeWriteRateLimit(user.id)
    const userId = await targetId(ctx, user.id)
    await unfollowUser(user.id, userId)
    return jsonPrivate({ following: false } satisfies FollowResult)
})
