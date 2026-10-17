import type { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api'
import { requireBearerUser } from '@/lib/auth'
import { addGameToList, removeGameFromList } from '@/lib/queries/list'
import { assertWriteOk, jsonPrivate, uuidParam } from '@/lib/write-http'

export const POST = withAuth(async (_req: NextRequest, ctx: RouteContext<'/api/v1/lists/[listId]/games/[gameId]'>) => {
    const user = await requireBearerUser()
    const { listId: rawList, gameId: rawGame } = await ctx.params
    const listId = uuidParam(rawList, 'listId')
    const gameId = uuidParam(rawGame, 'gameId')
    const result = await addGameToList(listId, gameId, user.id)
    assertWriteOk(result.error)
    return jsonPrivate({ ok: true as const })
})

export const DELETE = withAuth(async (_req: NextRequest, ctx: RouteContext<'/api/v1/lists/[listId]/games/[gameId]'>) => {
    const user = await requireBearerUser()
    const { listId: rawList, gameId: rawGame } = await ctx.params
    const listId = uuidParam(rawList, 'listId')
    const gameId = uuidParam(rawGame, 'gameId')
    const result = await removeGameFromList(listId, gameId, user.id)
    assertWriteOk(result.error)
    return jsonPrivate({ ok: true as const })
})
