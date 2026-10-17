import type { NextRequest } from 'next/server'
import type { AvatarUploadResult } from '@screenpeak/shared/api/writes'
import { avatarUploadSchema } from '@screenpeak/shared/schemas'
import { ApiError, withAuth } from '@/lib/api'
import { requireBearerUser } from '@/lib/auth'
import { avatarUploadErrorMessage } from '@/lib/avatar-upload'
import { createPresignedAvatarUploadUrl } from '@/lib/r2'
import { jsonPrivate, parseBody, readJson } from '@/lib/write-http'

export const POST = withAuth(async (req: NextRequest) => {
    const user = await requireBearerUser()
    const body = parseBody(avatarUploadSchema, await readJson(req))
    const result = await createPresignedAvatarUploadUrl(user.id, body.contentType, body.contentLength)
    if ('error' in result) throw new ApiError(400, 'invalid_request', avatarUploadErrorMessage(result.error))
    return jsonPrivate({ uploadUrl: result.uploadUrl, publicUrl: result.publicUrl } satisfies AvatarUploadResult)
})
