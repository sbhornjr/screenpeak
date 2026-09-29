import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { withAuth } from '@/lib/api'
import { getSteamAuthUrl } from '@/lib/steam-openid'
import { logger } from '@/lib/logger'

export const GET = withAuth(async (request: NextRequest) => {
    const user = await requireUser()

    try {
        const authUrl = await getSteamAuthUrl(request.nextUrl.origin)
        return NextResponse.redirect(authUrl)
    } catch (error) {
        logger.error('api:steam-link', 'Failed to build Steam auth URL', { userId: user.id, error: (error as Error).message })
        return NextResponse.redirect(new URL('/settings?steam_error=1', request.url))
    }
})
