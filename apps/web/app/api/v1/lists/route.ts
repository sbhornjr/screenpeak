import type { NextRequest } from 'next/server'
import type { ListCreated } from '@screenpeak/shared/api/writes'
import { createListSchema } from '@screenpeak/shared/schemas'
import { withAuth } from '@/lib/api'
import { requireBearerUser } from '@/lib/auth'
import { consumeWriteRateLimit } from '@/lib/rate-limit'
import { createList, createListWithGame } from '@/lib/queries/list'
import { assertWriteOk, jsonPrivate, parseBody, readJson } from '@/lib/write-http'

export const POST = withAuth(async (req: NextRequest) => {
    const user = await requireBearerUser()
    await consumeWriteRateLimit(user.id)
    const body = parseBody(createListSchema, await readJson(req))
    const fields = { name: body.name, description: body.description, isPublic: body.isPublic, isPinned: body.isPinned }
    const result = body.gameId
        ? await createListWithGame(user.id, body.gameId, fields)
        : await createList(user.id, fields)
    assertWriteOk(result.error)
    if (!result.data) throw new Error('list create returned no row')
    return jsonPrivate({ id: result.data.id } satisfies ListCreated, 201)
})
