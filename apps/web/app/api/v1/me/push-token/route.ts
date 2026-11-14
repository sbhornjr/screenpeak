import type { NextRequest } from 'next/server'
import type { OkResult } from '@screenpeak/shared/api/writes'
import { pushTokenRegisterSchema, pushTokenUnregisterSchema } from '@screenpeak/shared/schemas'
import { withAuth } from '@/lib/api'
import { requireBearerUser } from '@/lib/auth'
import { consumeWriteRateLimit } from '@/lib/rate-limit'
import { registerPushToken, unregisterPushToken } from '@/lib/queries/push'
import { jsonPrivate, parseBody, readJson } from '@/lib/write-http'

export const POST = withAuth(async (req: NextRequest) => {
    const user = await requireBearerUser()
    await consumeWriteRateLimit(user.id)
    const body = parseBody(pushTokenRegisterSchema, await readJson(req))
    await registerPushToken(user.id, body.token, body.platform)
    return jsonPrivate({ ok: true } satisfies OkResult)
})

export const DELETE = withAuth(async (req: NextRequest) => {
    const user = await requireBearerUser()
    await consumeWriteRateLimit(user.id)
    const body = parseBody(pushTokenUnregisterSchema, await readJson(req))
    await unregisterPushToken(user.id, body.token)
    return jsonPrivate({ ok: true } satisfies OkResult)
})
