import type { NextRequest } from 'next/server'
import type { OkResult } from '@screenpeak/shared/api/writes'
import { steamLinkCompleteSchema } from '@screenpeak/shared/schemas'
import { ApiError, withAuth } from '@/lib/api'
import { requireBearerUser } from '@/lib/auth'
import { consumeWriteRateLimit } from '@/lib/rate-limit'
import { completeSteamLink } from '@/lib/steam-link-intent'
import { jsonPrivate, parseBody, readJson } from '@/lib/write-http'

export const POST = withAuth(async (req: NextRequest) => {
    const user = await requireBearerUser()
    await consumeWriteRateLimit(user.id)
    const body = parseBody(steamLinkCompleteSchema, await readJson(req))
    const linked = await completeSteamLink(user.id, body.code, body.verifier)
    if (!linked) throw new ApiError(400, 'invalid_request', 'Steam link could not be completed.')
    return jsonPrivate({ ok: true } satisfies OkResult)
})
