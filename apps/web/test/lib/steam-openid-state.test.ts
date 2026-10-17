import { beforeEach, describe, expect, it, vi } from 'vitest'

const ctor = vi.hoisted(() => vi.fn())

vi.mock('openid', () => {
    class RelyingParty {
        constructor(returnUrl: string, realm: string, stateless: boolean, strict: boolean, extensions: unknown[]) {
            ctor(returnUrl, realm, stateless, strict, extensions)
        }
        authenticate(_identifier: string, _immediate: boolean, callback: (error: null, url: string) => void) {
            callback(null, 'https://steamcommunity.com/openid/login')
        }
        verifyAssertion(_url: string, callback: (error: null, result: { authenticated: boolean, claimedIdentifier: string }) => void) {
            callback(null, {
                authenticated: true,
                claimedIdentifier: 'https://steamcommunity.com/openid/id/76561198000000000',
            })
        }
    }
    return { RelyingParty }
})

import { getSteamAuthUrl, verifySteamCallback } from '@/lib/steam-openid'

describe('Steam OpenID return_to', () => {
    beforeEach(() => {
        ctor.mockClear()
        process.env.NEXT_PUBLIC_SITE_URL = 'https://screenpeak.test'
    })

    it('pins the website realm to NEXT_PUBLIC_SITE_URL', async () => {
        await expect(getSteamAuthUrl()).resolves.toBe('https://steamcommunity.com/openid/login')
        expect(ctor).toHaveBeenCalledWith('https://screenpeak.test/api/steam/callback', 'https://screenpeak.test', true, false, [])
    })

    it('puts the mobile state on return_to so Steam signs it', async () => {
        const state = 'v1.user.jti.1700000300.sig'
        await getSteamAuthUrl(state)
        const returnUrl = 'https://screenpeak.test/api/steam/callback?state=' + encodeURIComponent(state)
        await verifySteamCallback(returnUrl + '&openid.return_to=' + encodeURIComponent(returnUrl), state)
        expect(ctor).toHaveBeenNthCalledWith(1, returnUrl, 'https://screenpeak.test', true, false, [])
        expect(ctor).toHaveBeenNthCalledWith(2, returnUrl, 'https://screenpeak.test', true, false, [])
    })
})
