import { withAuth } from '@/lib/api'
import { requireBearerUser } from '@/lib/auth'
import { consumeWriteRateLimit } from '@/lib/rate-limit'
import { unlinkSteamAccount } from '@/lib/queries/steam'
import { noContent } from '@/lib/write-http'

export const DELETE = withAuth(async () => {
    const user = await requireBearerUser()
    await consumeWriteRateLimit(user.id)
    await unlinkSteamAccount(user.id)
    return noContent()
})
