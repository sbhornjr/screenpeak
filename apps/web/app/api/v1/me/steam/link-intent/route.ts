import type { NextRequest } from 'next/server'
import type { SteamLinkIntent } from '@screenpeak/shared/api/steam'
import { steamLinkIntentSchema } from '@screenpeak/shared/schemas'
import { withAuth } from '@/lib/api'
import { requireBearerUser } from '@/lib/auth'
import { consumeWriteRateLimit } from '@/lib/rate-limit'
import { issueSteamLinkIntent } from '@/lib/steam-link-intent'
import { jsonPrivate, parseBody, readJson } from '@/lib/write-http'

export const POST = withAuth(async (req: NextRequest) => {
    const user = await requireBearerUser()
    await consumeWriteRateLimit(user.id)
    const body = parseBody(steamLinkIntentSchema, await readJson(req))
    const intent = await issueSteamLinkIntent(user.id, body.codeChallenge)
    return jsonPrivate(intent satisfies SteamLinkIntent)
})
