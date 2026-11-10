import type { NextRequest } from 'next/server'
import { avatarUrlSchema } from '@screenpeak/shared/schemas'
import { ApiError, withAuth } from '@/lib/api'
import { requireBearerUser } from '@/lib/auth'
import { consumeWriteRateLimit } from '@/lib/rate-limit'
import { isOwnAvatarUrl } from '@/lib/avatar-upload'
import { updateAvatarUrl } from '@/lib/queries/user'
import { assertWriteOk, jsonPrivate, parseBody, readJson } from '@/lib/write-http'

export const PUT = withAuth(async (req: NextRequest) => {
    const user = await requireBearerUser()
    await consumeWriteRateLimit(user.id)
    const body = parseBody(avatarUrlSchema, await readJson(req))
    if (!isOwnAvatarUrl(body.url, user.id)) {
        throw new ApiError(400, 'invalid_request', 'That image URL is not your avatar.')
    }
    assertWriteOk(await updateAvatarUrl(user.id, body.url))
    return jsonPrivate({ ok: true as const })
})
