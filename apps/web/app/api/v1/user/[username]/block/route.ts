import type { NextRequest } from 'next/server'
import type { BlockResult } from '@screenpeak/shared/api/writes'
import { ApiError, withAuth } from '@/lib/api'
import { requireBearerUser } from '@/lib/auth'
import { consumeWriteRateLimit } from '@/lib/rate-limit'
import { blockUser, unblockUser, userExists } from '@/lib/queries/user'
import { jsonPrivate, uuidParam } from '@/lib/write-http'

// The segment is the account id. The folder stays [username] because that
// dynamic path already serves the profile reads.
async function targetId(ctx: { params: Promise<{ username: string }> }, callerId: string) {
    const { username } = await ctx.params
    const userId = uuidParam(username, 'userId')
    if (userId === callerId) throw new ApiError(400, 'invalid_request', 'You cannot block yourself.')
    if (!await userExists(userId)) throw new ApiError(404, 'not_found', 'Not found.')
    return userId
}

export const POST = withAuth(async (_req: NextRequest, ctx: RouteContext<'/api/v1/user/[username]/block'>) => {
    const user = await requireBearerUser()
    await consumeWriteRateLimit(user.id)
    const userId = await targetId(ctx, user.id)
    await blockUser(user.id, userId)
    return jsonPrivate({ blocked: true } satisfies BlockResult)
})

export const DELETE = withAuth(async (_req: NextRequest, ctx: RouteContext<'/api/v1/user/[username]/block'>) => {
    const user = await requireBearerUser()
    await consumeWriteRateLimit(user.id)
    const userId = await targetId(ctx, user.id)
    await unblockUser(user.id, userId)
    return jsonPrivate({ blocked: false } satisfies BlockResult)
})
