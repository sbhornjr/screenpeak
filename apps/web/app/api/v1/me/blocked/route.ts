import type { BlockedUsersPage } from '@screenpeak/shared/api/moderation'
import { withAuth } from '@/lib/api'
import { requireBearerUser } from '@/lib/auth'
import { getBlockedUsers } from '@/lib/queries/user'
import { jsonPrivate } from '@/lib/write-http'

// A read, same as GET /api/v1/me/library/[gameId] — requires a bearer but
// never spends the write budget.
export const GET = withAuth(async () => {
    const user = await requireBearerUser()
    const users = await getBlockedUsers(user.id)
    return jsonPrivate({ users } satisfies BlockedUsersPage)
})
