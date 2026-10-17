import type { NextRequest } from 'next/server'
import type { ListPinResult } from '@screenpeak/shared/api/writes'
import { listFieldsSchema, listPinSchema } from '@screenpeak/shared/schemas'
import { withAuth } from '@/lib/api'
import { requireBearerUser } from '@/lib/auth'
import { deleteList, setListPinned, updateList } from '@/lib/queries/list'
import { assertWriteOk, jsonPrivate, noContent, parseBody, readJson, uuidParam } from '@/lib/write-http'

export const PATCH = withAuth(async (req: NextRequest, ctx: RouteContext<'/api/v1/lists/[listId]'>) => {
    const user = await requireBearerUser()
    const { listId: raw } = await ctx.params
    const listId = uuidParam(raw, 'listId')
    const json = await readJson(req)
    const pin = listPinSchema.safeParse(json)
    if (pin.success) {
        const result = await setListPinned(listId, pin.data.isPinned, user.id)
        assertWriteOk(result.error)
        return jsonPrivate({ ok: true as const, isPinned: result.isPinned === true } satisfies ListPinResult)
    }
    const fields = parseBody(listFieldsSchema, json)
    const result = await updateList(listId, fields, user.id)
    assertWriteOk(result.error)
    return jsonPrivate({ ok: true as const })
})

export const DELETE = withAuth(async (_req: NextRequest, ctx: RouteContext<'/api/v1/lists/[listId]'>) => {
    const user = await requireBearerUser()
    const { listId: raw } = await ctx.params
    const listId = uuidParam(raw, 'listId')
    assertWriteOk((await deleteList(listId, user.id)).error)
    return noContent()
})
