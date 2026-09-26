import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase-server'
import { createLoggingFetch } from '@/lib/supabase-logging'
import { logger } from '@/lib/logger'
import { NextResponse } from 'next/server'
import { getViewer, deleteUserAccount } from '@/lib/queries/user-auth'

export async function DELETE() {
    const supabase = await createServerClient()
    const user = await getViewer(supabase)

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const adminClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SECRET_KEY!,
        { global: { fetch: createLoggingFetch('admin') } }
    )

    const error = await deleteUserAccount(adminClient, user.id)

    if (error) {
        logger.error('api:delete-account', 'Failed to delete user account', { userId: user.id, error: error.message })
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    logger.info('api:delete-account', 'User account deleted', { userId: user.id })
    return NextResponse.json({ success: true })
}