import type { NextRequest } from 'next/server'
import type { SteamImportBatch } from '@screenpeak/shared/api/steam'
import { steamImportBatchSchema } from '@screenpeak/shared/schemas'
import { ApiError, withAuth } from '@/lib/api'
import { requireBearerUser } from '@/lib/auth'
import { runSteamImportBatch } from '@/lib/catalog/steam-import'
import { consumeWriteRateLimit } from '@/lib/rate-limit'
import { jsonPrivate, parseBody, readJson } from '@/lib/write-http'

function steamImportError(message: string): ApiError {
    if (
        message === 'Link Steam before importing.'
        || message === 'Steam library details are not public.'
        || message === 'Invalid import request.'
    ) {
        return new ApiError(400, 'invalid_request', message)
    }
    if (
        message === 'Steam is unavailable. Your matched games are still listed.'
        || message === 'Matching is unavailable. Your matched games are still listed.'
    ) {
        return new ApiError(503, 'unavailable', message, { 'Retry-After': '5' })
    }
    return new ApiError(500, 'internal', 'Something went wrong.')
}

export const POST = withAuth(async (req: NextRequest) => {
    const user = await requireBearerUser()
    await consumeWriteRateLimit(user.id)
    const body = parseBody(steamImportBatchSchema, await readJson(req))
    const result = await runSteamImportBatch(user.id, { retry: body.retry === true, cursor: body.cursor ?? null })
    if ('error' in result) throw steamImportError(result.error)
    return jsonPrivate(result satisfies SteamImportBatch)
})
