import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { createLoggingFetch } from '@/lib/supabase-logging'
import { logger } from '@/lib/logger'
import { deleteUserAccount } from '@/lib/queries/user-auth'

// The only place the service-role (admin) client is created. The website's
// DELETE /api/delete-account and the phone's DELETE /api/v1/me both call this
// with the id their own auth check returned, never one from the request body.
export async function deleteAccount(userId: string): Promise<{ error: string | null }> {
    const adminClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SECRET_KEY!,
        { global: { fetch: createLoggingFetch('admin') } }
    )

    const error = await deleteUserAccount(adminClient, userId)
    if (error) {
        logger.error('account-deletion', 'Failed to delete user account', { userId, error: error.message })
        return { error: error.message }
    }

    logger.info('account-deletion', 'User account deleted', { userId })
    return { error: null }
}
