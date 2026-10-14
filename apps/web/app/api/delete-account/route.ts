import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { createLoggingFetch } from '@/lib/supabase-logging'
import { logger } from '@/lib/logger'
import { deleteUserAccount } from '@/lib/queries/user-auth'
import { requireUser } from '@/lib/auth'
import { apiError, withAuth } from '@/lib/api'

export const DELETE = withAuth(async () => {
    const user = await requireUser()

    const adminClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SECRET_KEY!,
        { global: { fetch: createLoggingFetch('admin') } }
    )

    const error = await deleteUserAccount(adminClient, user.id)

    if (error) {
        logger.error('api:delete-account', 'Failed to delete user account', { userId: user.id, error: error.message })
        return apiError(500, 'internal', 'Could not delete the account. Please try again.')
    }

    logger.info('api:delete-account', 'User account deleted', { userId: user.id })
    return NextResponse.json({ success: true })
})
