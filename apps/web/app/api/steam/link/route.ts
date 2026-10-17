import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { withAuth } from '@/lib/api'
import { logger } from '@/lib/logger'
import { getSteamAuthUrl } from '@/lib/steam-openid'
import { mobileSteamRedirect, peekSteamLinkIntent } from '@/lib/steam-link-intent'

/** Phone sheet. `state` is the only credential. A cookie on the same request is ignored. */
export async function mobileSteamLink(request: NextRequest, state: string): Promise<Response> {
    const intent = await peekSteamLinkIntent(state)
    if (!intent) return mobileSteamRedirect(false)
    try {
        const authUrl = await getSteamAuthUrl(request.nextUrl.origin, state)
        return NextResponse.redirect(authUrl)
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
        const authUrl = await getSteamAuthUrl(request.nextUrl.origin)
        return NextResponse.redirect(authUrl)
    } catch (error) {
        logger.error('api:steam-link', 'Failed to build Steam auth URL', { userId: user.id, error: (error as Error).message })
        return NextResponse.redirect(new URL('/settings?steam_error=1', request.url))
    }
})
