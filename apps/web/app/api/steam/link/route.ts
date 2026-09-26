import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getViewer } from '@/lib/queries/user-auth'
import { getSteamAuthUrl } from '@/lib/steam-openid'
import { logger } from '@/lib/logger'

export async function GET(request: NextRequest) {
    const supabase = await createClient()
    const user = await getViewer(supabase)

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const authUrl = await getSteamAuthUrl(request.nextUrl.origin)
        return NextResponse.redirect(authUrl)
    } catch (error) {
        logger.error('api:steam-link', 'Failed to build Steam auth URL', { userId: user.id, error: (error as Error).message })
        return NextResponse.redirect(new URL('/settings?steam_error=1', request.url))
    }
}
