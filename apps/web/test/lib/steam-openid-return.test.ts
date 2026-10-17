import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const stageSteamLink = vi.hoisted(() => vi.fn(async () => 'one-time-code'))
const completeSteamLink = vi.hoisted(() => vi.fn(async () => ({ userId: 'user' })))

// Stub only the OpenID HTTP helper, before openid.js captures get/post.
// Discovery and check_authentication never leave the process. RelyingParty stays real.
const xrds = `<?xml version="1.0" encoding="UTF-8"?>
<xrds:XRDS xmlns:xrds="xri://$xrds" xmlns="xri://$xrd*($v*2.0)">
  <XRD><Service>
    <Type>http://specs.openid.net/auth/2.0/signon</Type>
    <URI>https://steamcommunity.com/openid/login</URI>
  </Service></XRD>
</xrds:XRDS>`
const openidHttp = createRequire(import.meta.url)('openid/http') as {
    get: (url: string, params: unknown, callback: (data: string, headers: Record<string, string>, status: number) => void) => void
    post: (url: string, data: unknown, callback: (data: string, headers: Record<string, string>, status: number) => void) => void
}
openidHttp.get = (_url, _params, callback) => {
    callback(xrds, { 'content-type': 'application/xrds+xml' }, 200)
}
openidHttp.post = (_url, _data, callback) => {
    callback('is_valid:true\n', {}, 200)
}

vi.mock('@/lib/auth', () => ({
    getOptionalUser: vi.fn(async () => ({ id: 'cookie-user', email: 'cookie@example.com' })),
    requireUser: vi.fn(async () => ({ id: 'cookie-user', email: 'cookie@example.com' })),
}))

vi.mock('@/lib/steam-link-intent', async () => {
    const { mobileSteamResultUrl, mobileSteamCodeUrl } = await import('@screenpeak/shared/api/steam')
    return {
        readSteamLinkIntent: (token: string) => token ? { userId: 'user', jti: 'jti', exp: 1 } : null,
        stageSteamLink,
        completeSteamLink,
        peekSteamLinkIntent: vi.fn(),
        SteamLinkIntentConfigError: class SteamLinkIntentConfigError extends Error {},
        mobileSteamRedirect: (ok: boolean) => new Response(null, {
            status: 302,
            headers: { Location: mobileSteamResultUrl(ok), 'Cache-Control': 'no-store' },
        }),
        mobileSteamCodeRedirect: (code: string) => new Response(null, {
            status: 302,
            headers: { Location: mobileSteamCodeUrl(code), 'Cache-Control': 'no-store' },
        }),
    }
})

const { verifySteamCallback } = await import('@/lib/steam-openid')
const steamCallback = await import('@/app/api/steam/callback/route')
// These dynamic imports must run after the openid/http patch above. A static
// import would load RelyingParty first and capture the real HTTP helpers.

const ORIGIN = 'https://screenpeak.test'
const STEAM_ID = '76561198000000021'
const STATE = 'v1.' + randomUUID() + '.' + randomUUID() + '.1700000300.sig'
const OTHER = 'v1.' + randomUUID() + '.' + randomUUID() + '.1700000300.sig'

function nonce(): string {
    return new Date().toISOString().replace(/\.\d+/, '') + createHash('sha256').update(randomUUID()).digest('hex')
}

function assertion(returnTo: string, requestState?: string): string {
    const claimed = `https://steamcommunity.com/openid/id/${STEAM_ID}`
    const params = new URLSearchParams({
        'openid.ns': 'http://specs.openid.net/auth/2.0',
        'openid.mode': 'id_res',
        'openid.op_endpoint': 'https://steamcommunity.com/openid/login',
        'openid.claimed_id': claimed,
        'openid.identity': claimed,
        'openid.return_to': returnTo,
        'openid.response_nonce': nonce(),
        'openid.assoc_handle': 'handle',
        'openid.signed': 'op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle',
        'openid.sig': 'c2ln',
    })
    if (requestState !== undefined) params.set('state', requestState)
    return `${ORIGIN}/api/steam/callback?${params}`
}

function call(url: string) {
    const invoke = steamCallback.GET as (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>
    return invoke(new NextRequest(url), { params: Promise.resolve({}) })
}

beforeEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = ORIGIN
    stageSteamLink.mockClear()
    completeSteamLink.mockClear()
})

describe('OpenID return_to state is bound by our check, not the library', () => {
    it('rejects a bare signed return_to with an appended state, a different signed state, and accepts the same state', async () => {
        const bare = () => assertion(`${ORIGIN}/api/steam/callback`, STATE)
        await expect(verifySteamCallback(bare(), STATE)).rejects.toThrow(/state/i)
        const bareResponse = await call(bare())
        expect(bareResponse.headers.get('location')).toBe('screenpeak://steamlink?ok=0')
        expect(stageSteamLink).not.toHaveBeenCalled()
        expect(completeSteamLink).not.toHaveBeenCalled()

        const swapped = () => assertion(`${ORIGIN}/api/steam/callback?state=${encodeURIComponent(OTHER)}`, STATE)
        await expect(verifySteamCallback(swapped(), STATE)).rejects.toThrow(/state/i)
        const swappedResponse = await call(swapped())
        expect(swappedResponse.headers.get('location')).toBe('screenpeak://steamlink?ok=0')
        expect(stageSteamLink).not.toHaveBeenCalled()

        const same = () => assertion(`${ORIGIN}/api/steam/callback?state=${encodeURIComponent(STATE)}`, STATE)
        await expect(verifySteamCallback(same(), STATE)).resolves.toBe(STEAM_ID)
        const accepted = await call(same())
        expect(accepted.headers.get('location')).toBe('screenpeak://steamlink?code=one-time-code')
        expect(stageSteamLink).toHaveBeenCalledWith(STATE, STEAM_ID)
        expect(completeSteamLink).not.toHaveBeenCalled()
    })

    it('accepts the website flow only when the signed return_to also has no state', async () => {
        const clean = assertion(`${ORIGIN}/api/steam/callback`)
        await expect(verifySteamCallback(clean)).resolves.toBe(STEAM_ID)

        const signed = assertion(`${ORIGIN}/api/steam/callback?state=${encodeURIComponent(STATE)}`)
        await expect(verifySteamCallback(signed)).rejects.toThrow(/state/i)
    })
})
