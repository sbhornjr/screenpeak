import { NextRequest, NextResponse } from 'next/server'
import { getOptionalUser } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { verifySteamCallback } from '@/lib/steam-openid'
import { upsertSteamAccount } from '@/lib/queries/steam'
import { consumeSteamLinkIntent, mobileSteamRedirect, readSteamLinkIntent } from '@/lib/steam-link-intent'

const STEAM_ID_RE = /^\d{17}$/

/** Phone return. The user id comes from the spent intent, never from a session cookie. */
export async function mobileSteamCallback(request: NextRequest, state: string): Promise<Response> {
    if (!readSteamLinkIntent(state)) return mobileSteamRedirect(false)
    let steamId: string
    try {
        steamId = await verifySteamCallback(request.nextUrl.origin, request.url, state)
    } catch (error) {
        logger.error('api:steam-callback', 'Steam verification failed', { error: error instanceof Error ? error.message : String(error) })
        return mobileSteamRedirect(false)
    }
    if (!STEAM_ID_RE.test(steamId)) return mobileSteamRedirect(false)
    try {
        const linked = await consumeSteamLinkIntent(state, steamId)
        if (!linked) return mobileSteamRedirect(false)
        logger.info('api:steam-callback', 'Steam account linked', { userId: linked.userId })
    } catch (error) {
        logger.error('api:steam-callback', 'Failed to save linked Steam account', { error: error instanceof Error ? error.message : String(error) })
        return mobileSteamRedirect(false)
    }
    return mobileSteamRedirect(true)
}

export async function GET(request: NextRequest) {
    const state = request.nextUrl.searchParams.get('state')
    if (state !== null) return mobileSteamCallback(request, state)

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
