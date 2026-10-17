import { NextRequest, NextResponse } from 'next/server'
import { getOptionalUser } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { verifySteamCallback } from '@/lib/steam-openid'
import { upsertSteamAccount } from '@/lib/queries/steam'
import { mobileSteamCodeRedirect, mobileSteamRedirect, readSteamLinkIntent, stageSteamLink } from '@/lib/steam-link-intent'

const STEAM_ID_RE = /^[0-9]{17}$/

/**
 * Phone return. Stores the verified Steam id on the intent and hands the phone
 * a one-time code. The account link waits for POST /api/v1/me/steam/link-complete.
 */
export async function mobileSteamCallback(request: NextRequest, state: string): Promise<Response> {
    try {
        if (!readSteamLinkIntent(state)) return mobileSteamRedirect(false)
        const steamId = await verifySteamCallback(request.url, state)
        if (!STEAM_ID_RE.test(steamId)) return mobileSteamRedirect(false)
        const code = await stageSteamLink(state, steamId)
        if (!code) return mobileSteamRedirect(false)
        logger.info('api:steam-callback', 'Steam sign-in staged', {})
        return mobileSteamCodeRedirect(code)
    } catch (error) {
        logger.error('api:steam-callback', 'Steam verification failed', { error: error instanceof Error ? error.message : String(error) })
        return mobileSteamRedirect(false)
    }
}

export async function GET(request: NextRequest) {
    const state = request.nextUrl.searchParams.get('state')
    if (state !== null) return mobileSteamCallback(request, state)

    const user = await getOptionalUser()

    if (!user) {
        return NextResponse.redirect(new URL('/', request.url))
    }

    try {
        const steamId64 = await verifySteamCallback(request.url)
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
