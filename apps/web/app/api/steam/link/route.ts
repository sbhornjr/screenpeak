import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { withAuth } from '@/lib/api'
import { logger } from '@/lib/logger'
import { getSteamAuthUrl } from '@/lib/steam-openid'
import { mobileSteamRedirect, peekSteamLinkIntent } from '@/lib/steam-link-intent'

const STEAM_LOGIN = 'https://steamcommunity.com/openid/login'

function redirectToSteam(authUrl: string): Response | null {
    if (!authUrl.startsWith(STEAM_LOGIN)) return null
    const response = NextResponse.redirect(authUrl)
    response.headers.set('Cache-Control', 'no-store')
    response.headers.set('Referrer-Policy', 'no-referrer')
    return response
}

/** Phone sheet. `state` is the only credential. A cookie on the same request is ignored. */
export async function mobileSteamLink(_request: NextRequest, state: string): Promise<Response> {
    try {
        const intent = await peekSteamLinkIntent(state)
        if (!intent) return mobileSteamRedirect(false)
        const redirect = redirectToSteam(await getSteamAuthUrl(state))
        if (!redirect) return mobileSteamRedirect(false)
        return redirect
    } catch (error) {
        logger.error('api:steam-link', 'Failed to build Steam auth URL', { error: error instanceof Error ? error.message : String(error) })
        return mobileSteamRedirect(false)
    }
}

export const GET = withAuth(async (request: NextRequest) => {
    const state = request.nextUrl.searchParams.get('state')
    if (state !== null) return mobileSteamLink(request, state)

    const user = await requireUser()
    try {
        const redirect = redirectToSteam(await getSteamAuthUrl())
        if (!redirect) return NextResponse.redirect(new URL('/settings?steam_error=1', request.url))
        return redirect
    } catch (error) {
        logger.error('api:steam-link', 'Failed to build Steam auth URL', { userId: user.id, error: (error as Error).message })
        return NextResponse.redirect(new URL('/settings?steam_error=1', request.url))
    }
})
