import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { ApiError, UnauthenticatedError } from '@/lib/api'

const USER = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'a@x.test' }
const OTHER = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', email: 'b@x.test' }
const BATCH = {
    entries: [],
    remaining: 0,
    totalApps: 1,
    matchedGameCount: 0,
    unmatchedAppCount: 0,
    ambiguousAppCount: 0,
    retryableAppCount: 0,
    nextCursor: null,
}

const CHALLENGE = 'a'.repeat(43)

const {
    requireBearerUser, requireUser, getOptionalUser, consumeWriteRateLimit,
    issueSteamLinkIntent, peekSteamLinkIntent, stageSteamLink, completeSteamLink, readSteamLinkIntent,
    SteamLinkIntentConfigError, getSteamAuthUrl, verifySteamCallback, runSteamImportBatch, upsertSteamAccount,
} = vi.hoisted(() => {
    class SteamLinkIntentConfigError extends Error {
        constructor(reason: 'missing' | 'short' = 'missing') {
            super(reason === 'missing'
                ? 'STEAM_LINK_INTENT_SECRET is not set'
                : 'STEAM_LINK_INTENT_SECRET must be at least 32 characters')
            this.name = 'SteamLinkIntentConfigError'
        }
    }
    return {
        requireBearerUser: vi.fn(),
        requireUser: vi.fn(),
        getOptionalUser: vi.fn(),
        consumeWriteRateLimit: vi.fn(async () => {}),
        issueSteamLinkIntent: vi.fn(),
        peekSteamLinkIntent: vi.fn(),
        stageSteamLink: vi.fn(),
        completeSteamLink: vi.fn(),
        readSteamLinkIntent: vi.fn(),
        SteamLinkIntentConfigError,
        getSteamAuthUrl: vi.fn(),
        verifySteamCallback: vi.fn(),
        runSteamImportBatch: vi.fn(),
        upsertSteamAccount: vi.fn(),
    }
})

vi.mock('@/lib/auth', () => ({ requireBearerUser, requireUser, getOptionalUser, getBearerUser: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ consumeWriteRateLimit }))
vi.mock('@/lib/steam-link-intent', async () => {
    const { mobileSteamCodeUrl, mobileSteamResultUrl } = await import('@screenpeak/shared/api/steam')
    return {
        issueSteamLinkIntent,
        peekSteamLinkIntent,
        stageSteamLink,
        completeSteamLink,
        readSteamLinkIntent,
        SteamLinkIntentConfigError,
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
vi.mock('@/lib/steam-openid', () => ({ getSteamAuthUrl, verifySteamCallback }))
vi.mock('@/lib/catalog/steam-import', () => ({ runSteamImportBatch }))
vi.mock('@/lib/queries/steam', () => ({ upsertSteamAccount, unlinkSteamAccount: vi.fn() }))

const linkIntent = await import('@/app/api/v1/me/steam/link-intent/route')
const linkComplete = await import('@/app/api/v1/me/steam/link-complete/route')
const steamImport = await import('@/app/api/v1/me/steam/import/route')
const appConfig = await import('@/app/api/v1/app-config/route')
const steamLink = await import('@/app/api/steam/link/route')
const steamCallback = await import('@/app/api/steam/callback/route')

function call(handler: unknown, url: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
    const invoke = handler as (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>
    return invoke(new NextRequest(url, init), { params: Promise.resolve({}) })
}

beforeEach(() => {
    requireBearerUser.mockReset().mockResolvedValue(USER)
    requireUser.mockReset().mockResolvedValue(OTHER)
    getOptionalUser.mockReset().mockResolvedValue(OTHER)
    consumeWriteRateLimit.mockReset().mockResolvedValue(undefined)
    for (const fn of [
        issueSteamLinkIntent, peekSteamLinkIntent, stageSteamLink, completeSteamLink, readSteamLinkIntent,
        getSteamAuthUrl, verifySteamCallback, runSteamImportBatch, upsertSteamAccount,
    ]) fn.mockReset()
})

describe('POST /api/v1/me/steam/link-intent', () => {
    it('rejects a missing bearer before minting a token or spending the write budget', async () => {
        requireBearerUser.mockRejectedValue(new UnauthenticatedError())

        const res = await call(linkIntent.POST, 'http://localhost/api/v1/me/steam/link-intent', {
            method: 'POST', headers: { 'content-type': 'application/json', cookie: 'sb=website' }, body: '{}',
        })

        expect(res.status).toBe(401)
        expect(issueSteamLinkIntent).not.toHaveBeenCalled()
        expect(consumeWriteRateLimit).not.toHaveBeenCalled()
    })

    it('rejects a caller-supplied redirect and returns only a relative path', async () => {
        const bad = await call(linkIntent.POST, 'http://localhost/api/v1/me/steam/link-intent', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ codeChallenge: CHALLENGE, redirect: 'https://evil.example', userId: OTHER.id }),
        })
        expect(bad.status).toBe(400)
        expect(issueSteamLinkIntent).not.toHaveBeenCalled()

        issueSteamLinkIntent.mockResolvedValue({
            state: 'v1.signed',
            expiresAt: '2026-10-17T06:05:00.000Z',
            path: '/api/steam/link?state=v1.signed&client=mobile',
        })
        const res = await call(linkIntent.POST, 'http://127.0.0.1:3210/api/v1/me/steam/link-intent', {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ codeChallenge: CHALLENGE }),
        })
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({
            state: 'v1.signed',
            expiresAt: '2026-10-17T06:05:00.000Z',
            path: '/api/steam/link?state=v1.signed&client=mobile',
        })
        expect(issueSteamLinkIntent).toHaveBeenCalledWith(USER.id, CHALLENGE)
        expect(res.headers.get('cache-control')).toBe('private, no-store')
        expect(consumeWriteRateLimit).toHaveBeenCalledWith(USER.id)
    })

    it('fails closed when the signing secret is missing and does not name it', async () => {
        issueSteamLinkIntent.mockRejectedValue(new SteamLinkIntentConfigError('missing'))
        const res = await call(linkIntent.POST, 'http://localhost/api/v1/me/steam/link-intent', {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ codeChallenge: CHALLENGE }),
        })
        expect(res.status).toBe(500)
        const body = await res.text()
        expect(body).not.toMatch(/STEAM_LINK_INTENT_SECRET/)
        expect(body).toContain('Something went wrong.')
    })
})

describe('GET /api/steam/link and callback with state', () => {
    it('does not fall back to the website cookie when state is missing, reused, or paired with a return URL', async () => {
        peekSteamLinkIntent.mockResolvedValue(null)
        requireUser.mockResolvedValue(OTHER)

        const res = await call(
            steamLink.GET,
            'http://localhost/api/steam/link?state=forged&client=mobile&return=https://evil.example',
            { headers: { cookie: 'sb=website' } },
        )

        expect(res.status).toBe(302)
        expect(res.headers.get('location')).toBe('screenpeak://steamlink?ok=0')
        expect(requireUser).not.toHaveBeenCalled()
        expect(getSteamAuthUrl).not.toHaveBeenCalled()
        expect(res.headers.get('location')).not.toContain('evil.example')
    })

    it('sends a live intent to Steam without reading the session', async () => {
        peekSteamLinkIntent.mockResolvedValue({ userId: USER.id })
        getSteamAuthUrl.mockResolvedValue('https://steamcommunity.com/openid/login')

        const res = await call(steamLink.GET, 'http://localhost/api/steam/link?state=live&client=mobile', {
            headers: { cookie: 'sb=website' },
        })

        expect(res.status).toBe(307)
        expect(res.headers.get('location')).toBe('https://steamcommunity.com/openid/login')
        expect(res.headers.get('cache-control')).toBe('no-store')
        expect(res.headers.get('referrer-policy')).toBe('no-referrer')
        expect(getSteamAuthUrl).toHaveBeenCalledWith('live')
        expect(requireUser).not.toHaveBeenCalled()
        expect(peekSteamLinkIntent).toHaveBeenCalledWith('live')
    })

    it('refuses a redirect that is not the Steam login endpoint', async () => {
        peekSteamLinkIntent.mockResolvedValue({ userId: USER.id })
        getSteamAuthUrl.mockResolvedValue('https://evil.example/openid/login')
        const res = await call(steamLink.GET, 'http://evil.example/api/steam/link?state=live')
        expect(res.headers.get('location')).toBe('screenpeak://steamlink?ok=0')
        expect(res.headers.get('location')).not.toContain('evil.example')
    })

    it('keeps the website button on the cookie session', async () => {
        getSteamAuthUrl.mockResolvedValue('https://steamcommunity.com/openid/login')
        const res = await call(steamLink.GET, 'http://localhost/api/steam/link')
        expect(res.headers.get('location')).toBe('https://steamcommunity.com/openid/login')
        expect(res.headers.get('cache-control')).toBe('no-store')
        expect(res.headers.get('referrer-policy')).toBe('no-referrer')
        expect(requireUser).toHaveBeenCalledOnce()
        expect(peekSteamLinkIntent).not.toHaveBeenCalled()
        expect(getSteamAuthUrl).toHaveBeenCalledWith()
    })

    it('stages the Steam id and does not link the cookie session', async () => {
        readSteamLinkIntent.mockReturnValue({ userId: USER.id, jti: 'jti', exp: 1 })
        verifySteamCallback.mockResolvedValue('76561198000000000')
        stageSteamLink.mockResolvedValue('one-time-code')

        const res = await call(
            steamCallback.GET,
            'http://localhost/api/steam/callback?state=live&openid.mode=id_res&return=https://evil.example',
            { headers: { cookie: 'sb=website' } },
        )

        expect(res.status).toBe(302)
        expect(res.headers.get('location')).toBe('screenpeak://steamlink?code=one-time-code')
        expect(getOptionalUser).not.toHaveBeenCalled()
        expect(upsertSteamAccount).not.toHaveBeenCalled()
        expect(completeSteamLink).not.toHaveBeenCalled()
        expect(verifySteamCallback).toHaveBeenCalledWith(expect.stringContaining('state=live'), 'live')
        expect(stageSteamLink).toHaveBeenCalledWith('live', '76561198000000000')
    })

    it('drops a forged or replayed state before Steam verification and before the cookie user', async () => {
        readSteamLinkIntent.mockReturnValue(null)
        const res = await call(steamCallback.GET, 'http://localhost/api/steam/callback?state=forged', {
            headers: { cookie: 'sb=website' },
        })
        expect(res.headers.get('location')).toBe('screenpeak://steamlink?ok=0')
        expect(verifySteamCallback).not.toHaveBeenCalled()
        expect(stageSteamLink).not.toHaveBeenCalled()
        expect(getOptionalUser).not.toHaveBeenCalled()
        expect(upsertSteamAccount).not.toHaveBeenCalled()
    })

    it('redirects to a failure when the signing secret is missing', async () => {
        readSteamLinkIntent.mockImplementation(() => { throw new SteamLinkIntentConfigError('missing') })
        const res = await call(steamCallback.GET, 'http://localhost/api/steam/callback?state=live')
        expect(res.status).toBe(302)
        expect(res.headers.get('location')).toBe('screenpeak://steamlink?ok=0')
        expect(stageSteamLink).not.toHaveBeenCalled()

        peekSteamLinkIntent.mockRejectedValue(new SteamLinkIntentConfigError('short'))
        const opened = await call(steamLink.GET, 'http://localhost/api/steam/link?state=live')
        expect(opened.headers.get('location')).toBe('screenpeak://steamlink?ok=0')
    })

    it('still links the cookie session when the website callback has no state', async () => {
        verifySteamCallback.mockResolvedValue('76561198000000000')
        upsertSteamAccount.mockResolvedValue({ data: { steam_id: '76561198000000000' }, error: null })
        const res = await call(steamCallback.GET, 'http://localhost/api/steam/callback?openid.mode=id_res')
        expect(res.headers.get('location')).toBe('http://localhost/steamlink')
        expect(getOptionalUser).toHaveBeenCalledOnce()
        expect(upsertSteamAccount).toHaveBeenCalledWith(OTHER.id, '76561198000000000')
        expect(readSteamLinkIntent).not.toHaveBeenCalled()
        expect(verifySteamCallback).toHaveBeenCalledWith(expect.stringContaining('/api/steam/callback'))
    })
})

describe('POST /api/v1/me/steam/link-complete', () => {
    const body = { code: 'c'.repeat(43), verifier: 'v'.repeat(43) }

    it('links only when the bearer exchange succeeds', async () => {
        completeSteamLink.mockResolvedValue({ userId: USER.id })
        const res = await call(linkComplete.POST, 'http://localhost/api/v1/me/steam/link-complete', {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
        })
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ ok: true })
        expect(completeSteamLink).toHaveBeenCalledWith(USER.id, body.code, body.verifier)
        expect(consumeWriteRateLimit).toHaveBeenCalledWith(USER.id)
        expect(upsertSteamAccount).not.toHaveBeenCalled()
    })

    it('does not link when the bearer or the verifier does not match', async () => {
        completeSteamLink.mockResolvedValue(null)
        const res = await call(linkComplete.POST, 'http://localhost/api/v1/me/steam/link-complete', {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, userId: OTHER.id }),
        })
        expect(res.status).toBe(400)
        expect(completeSteamLink).not.toHaveBeenCalled()
    })
})

describe('POST /api/v1/me/steam/import', () => {
    it('uses the bearer user and the existing batch function', async () => {
        runSteamImportBatch.mockResolvedValue({ charged: true, batch: { ...BATCH, nextCursor: { phase: 'pending', afterAppId: 40 }, remaining: 12 } })
        const res = await call(steamImport.POST, 'http://localhost/api/v1/me/steam/import', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ retry: false, cursor: { phase: 'pending', afterAppId: 10 }, userId: OTHER.id }),
        })
        expect(res.status).toBe(400)
        expect(runSteamImportBatch).not.toHaveBeenCalled()

        const ok = await call(steamImport.POST, 'http://localhost/api/v1/me/steam/import', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ retry: true, cursor: { phase: 'miss', afterAppId: 10 } }),
        })
        expect(ok.status).toBe(200)
        expect(await ok.json()).toMatchObject({ nextCursor: { phase: 'pending', afterAppId: 40 }, remaining: 12 })
        expect(consumeWriteRateLimit).toHaveBeenCalledWith(USER.id)
        expect(runSteamImportBatch).toHaveBeenCalledWith(USER.id, { retry: true, cursor: { phase: 'miss', afterAppId: 10 } })
        expect(ok.headers.get('cache-control')).toBe('private, no-store')
    })

    it('rejects an unbounded cursor and a missing bearer before matching', async () => {
        const huge = await call(steamImport.POST, 'http://localhost/api/v1/me/steam/import', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ cursor: { phase: 'pending', afterAppId: 2_147_483_648 } }),
        })
        expect(huge.status).toBe(400)
        expect(runSteamImportBatch).not.toHaveBeenCalled()

        consumeWriteRateLimit.mockClear()
        requireBearerUser.mockRejectedValue(new UnauthenticatedError())
        const signedOut = await call(steamImport.POST, 'http://localhost/api/v1/me/steam/import', {
            method: 'POST', headers: { 'content-type': 'application/json', cookie: 'sb=website' }, body: '{}',
        })
        expect(signedOut.status).toBe(401)
        expect(consumeWriteRateLimit).not.toHaveBeenCalled()
    })

    it('does not spend a write on a busy lease, and maps codes without the lease hint', async () => {
        runSteamImportBatch.mockResolvedValueOnce({
            charged: false,
            batch: {
                ...BATCH,
                remaining: 1,
                retryableAppCount: 1,
                nextCursor: { phase: 'pending', afterAppId: 3 },
                notice: 'Matching is already running for your library.',
                retryAfterMs: 5000,
            },
        })
        const busy = await call(steamImport.POST, 'http://localhost/api/v1/me/steam/import', {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
        })
        expect(busy.status).toBe(200)
        expect(await busy.json()).toMatchObject({ notice: 'Matching is already running for your library.', retryAfterMs: 5000 })
        expect(consumeWriteRateLimit).not.toHaveBeenCalled()

        runSteamImportBatch.mockResolvedValueOnce({ charged: true, error: 'steam_unavailable' })
        const down = await call(steamImport.POST, 'http://localhost/api/v1/me/steam/import', {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
        })
        expect(down.status).toBe(503)
        expect(down.headers.get('retry-after')).toBe('5')
        expect(await down.json()).toMatchObject({
            error: { code: 'unavailable', message: 'Steam is unavailable. Your matched games are still listed.', retry_after: 5 },
        })
        expect(consumeWriteRateLimit).toHaveBeenCalledOnce()

        consumeWriteRateLimit.mockClear()
        runSteamImportBatch.mockResolvedValueOnce({ charged: false, error: 'lease_not_installed' })
        const leaked = await call(steamImport.POST, 'http://localhost/api/v1/me/steam/import', {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
        })
        expect(leaked.status).toBe(500)
        expect(await leaked.text()).not.toMatch(/0008_steam_import_lease/)
        expect(consumeWriteRateLimit).not.toHaveBeenCalled()
    })

    it('does not spend the write budget when the budget is already spent', async () => {
        runSteamImportBatch.mockResolvedValueOnce({ charged: true, batch: BATCH })
        consumeWriteRateLimit.mockRejectedValueOnce(new ApiError(429, 'rate_limited', 'Too many requests. Try again soon.', { 'Retry-After': '3' }))
        const res = await call(steamImport.POST, 'http://localhost/api/v1/me/steam/import', {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
        })
        expect(res.status).toBe(429)
        expect(runSteamImportBatch).toHaveBeenCalledOnce()
    })
})

describe('GET /api/v1/app-config', () => {
    it('answers the minimum version with no session', async () => {
        const res = await call(appConfig.GET, 'http://localhost/api/v1/app-config', {
            headers: { authorization: 'Bearer not-a-session', cookie: 'sb=website' },
        })
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ minSupportedVersion: '1.0.0' })
        expect(res.headers.get('cache-control')).toBe('no-store')
        expect(requireBearerUser).not.toHaveBeenCalled()
        expect(getOptionalUser).not.toHaveBeenCalled()
        expect(consumeWriteRateLimit).not.toHaveBeenCalled()
    })
})
