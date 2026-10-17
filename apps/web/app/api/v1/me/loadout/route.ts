import { withAuth } from '@/lib/api'
import { requireBearerUser } from '@/lib/auth'
import { clearLoadoutIdentity } from '@/lib/queries/user'
import { assertWriteOk, jsonPrivate } from '@/lib/write-http'

export const DELETE = withAuth(async () => {
    const user = await requireBearerUser()
    const result = await clearLoadoutIdentity(user.id)
    assertWriteOk(result.error)
    return jsonPrivate({ ok: true as const })
})
