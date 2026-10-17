import type { NextRequest } from 'next/server'
import type { ListLikeResult } from '@screenpeak/shared/api/writes'
import { withAuth } from '@/lib/api'
import { requireBearerUser } from '@/lib/auth'
import { likeList, unlikeList } from '@/lib/queries/list'
import { assertWriteOk, jsonPrivate, uuidParam } from '@/lib/write-http'

export const POST = withAuth(async (_req: NextRequest, ctx: RouteContext<'/api/v1/lists/[listId]/like'>) => {
    const user = await requireBearerUser()
    const { listId: raw } = await ctx.params
    const listId = uuidParam(raw, 'listId')
    const result = await likeList(listId, user.id)
    assertWriteOk(result.error)
    return jsonPrivate({ liked: true } satisfies ListLikeResult)
})

export const DELETE = withAuth(async (_req: NextRequest, ctx: RouteContext<'/api/v1/lists/[listId]/like'>) => {
    const user = await requireBearerUser()
    const { listId: raw } = await ctx.params
    const listId = uuidParam(raw, 'listId')
    const result = await unlikeList(listId, user.id)
    assertWriteOk(result.error)
    return jsonPrivate({ liked: false } satisfies ListLikeResult)
})
