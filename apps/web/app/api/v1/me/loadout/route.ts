import type { LoadoutGenerated } from '@screenpeak/shared/api/writes'
import { ApiError, withAuth } from '@/lib/api'
import { requireBearerUser } from '@/lib/auth'
import { generateReadout } from '@/lib/loadout-readout'
import { consumeWriteRateLimit } from '@/lib/rate-limit'
import { clearLoadoutIdentity } from '@/lib/queries/user'
import { assertWriteOk, jsonPrivate } from '@/lib/write-http'

// How long the phone waits after the model came back empty before it may retry.
const GENERATION_RETRY_SECONDS = 30

/** Generates and saves the caller's Read-out, then returns it. */
export const POST = withAuth(async () => {
    const user = await requireBearerUser()
    await consumeWriteRateLimit(user.id)
    const outcome = await generateReadout(user.id)
    if (outcome.ok) return jsonPrivate({ identity: outcome.identity } satisfies LoadoutGenerated)
    switch (outcome.reason) {
        case 'too_soon':
            throw new ApiError(429, 'rate_limited', 'You just generated a Read-out. Try again in a minute.', { 'Retry-After': String(outcome.retryAfter) })
        case 'not_eligible':
            throw new ApiError(400, 'invalid_request', 'Rate at least 5 games first.')
        case 'no_profile':
            throw new ApiError(404, 'not_found', 'Not found.')
        case 'generation_failed':
            throw new ApiError(503, 'unavailable', "Couldn't write a Read-out right now. Try again shortly.", { 'Retry-After': String(GENERATION_RETRY_SECONDS) })
        case 'save_failed':
            throw new Error('Read-out save failed')
    }
})

export const DELETE = withAuth(async () => {
    const user = await requireBearerUser()
    await consumeWriteRateLimit(user.id)
    const result = await clearLoadoutIdentity(user.id)
    assertWriteOk(result.error)
    return jsonPrivate({ ok: true as const })
})
