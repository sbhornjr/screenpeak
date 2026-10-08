import { NextRequest, NextResponse } from 'next/server'
import { getOptionalUser } from '@/lib/auth'
import { verifySteamCallback } from '@/lib/steam-openid'
import { upsertSteamAccount } from '@/lib/queries/steam'
import { logger } from '@/lib/logger'

export async function GET(request: NextRequest) {
    const user = await getOptionalUser()

    if (!user) {
        return NextResponse.redirect(new URL('/', request.url))
    }

    try {
        const steamId64 = await verifySteamCallback(request.nextUrl.origin, request.url)
        const { error } = await upsertSteamAccount(user.id, steamId64)

        if (error) {
            logger.error('api:steam-callback', 'Failed to save linked Steam account', { userId: user.id, error: error instanceof Error ? error.message : String(error) })
            return NextResponse.redirect(new URL('/settings?steam_error=1', request.url))
        }

        logger.info('api:steam-callback', 'Steam account linked', { userId: user.id })
        return NextResponse.redirect(new URL('/steamlink', request.url))
    } catch (error) {
        logger.error('api:steam-callback', 'Steam verification failed', { userId: user.id, error: (error as Error).message })
        return NextResponse.redirect(new URL('/settings?steam_error=1', request.url))
    }
}
