import type { NextRequest } from 'next/server'
import { listGameSyncSchema } from '@screenpeak/shared/schemas'
import { withAuth } from '@/lib/api'
import { requireBearerUser } from '@/lib/auth'
import { syncListGames } from '@/lib/queries/list'
import { assertWriteOk, jsonPrivate, parseBody, readJson, uuidParam } from '@/lib/write-http'

export const POST = withAuth(async (req: NextRequest, ctx: RouteContext<'/api/v1/lists/[listId]/games/sync'>) => {
    const user = await requireBearerUser()
    const { listId: raw } = await ctx.params
    const listId = uuidParam(raw, 'listId')
    const body = parseBody(listGameSyncSchema, await readJson(req))
    const result = await syncListGames(listId, body, user.id)
    assertWriteOk(result.error)
    return jsonPrivate({ ok: true as const })
})
