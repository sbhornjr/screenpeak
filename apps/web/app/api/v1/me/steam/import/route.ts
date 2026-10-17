import type { NextRequest } from 'next/server'
import type { SteamImportBatch } from '@screenpeak/shared/api/steam'
import { steamImportBatchSchema } from '@screenpeak/shared/schemas'
import { withAuth } from '@/lib/api'
import { requireBearerUser } from '@/lib/auth'
import { steamImportHttpError } from '@/lib/catalog/steam-import-errors'
import { runSteamImportBatch } from '@/lib/catalog/steam-import'
import { consumeWriteRateLimit } from '@/lib/rate-limit'
import { jsonPrivate, parseBody, readJson } from '@/lib/write-http'

export const POST = withAuth(async (req: NextRequest) => {
    const user = await requireBearerUser()
    const body = parseBody(steamImportBatchSchema, await readJson(req))
    const outcome = await runSteamImportBatch(user.id, { retry: body.retry === true, cursor: body.cursor ?? null })
    if (outcome.charged) await consumeWriteRateLimit(user.id)
    if ('error' in outcome) throw steamImportHttpError(outcome.error)
    return jsonPrivate(outcome.batch satisfies SteamImportBatch)
})
