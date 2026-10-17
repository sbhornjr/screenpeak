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

const {
    requireBearerUser, requireUser, getOptionalUser, consumeWriteRateLimit,
    issueSteamLinkIntent, peekSteamLinkIntent, consumeSteamLinkIntent, readSteamLinkIntent,
    SteamLinkIntentConfigError, getSteamAuthUrl, verifySteamCallback, runSteamImportBatch, upsertSteamAccount,
} = vi.hoisted(() => {
    class SteamLinkIntentConfigError extends Error {
        constructor() {
            super('STEAM_LINK_INTENT_SECRET is not set')
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
        consumeSteamLinkIntent: vi.fn(),
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
    const { mobileSteamResultUrl } = await import('@screenpeak/shared/api/steam')
    return {
        issueSteamLinkIntent,
        peekSteamLinkIntent,
        consumeSteamLinkIntent,
        readSteamLinkIntent,
        SteamLinkIntentConfigError,
        mobileSteamRedirect: (ok: boolean) => new Response(null, {
            status: 302,
            headers: { Location: mobileSteamResultUrl(ok), 'Cache-Control': 'no-store' },
        }),
    }
})
vi.mock('@/lib/steam-openid', () => ({ getSteamAuthUrl, verifySteamCallback }))
vi.mock('@/lib/catalog/steam-import', () => ({ runSteamImportBatch }))
vi.mock('@/lib/queries/steam', () => ({ upsertSteamAccount, unlinkSteamAccount: vi.fn() }))

const linkIntent = await import('@/app/api/v1/me/steam/link-intent/route')
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
        issueSteamLinkIntent, peekSteamLinkIntent, consumeSteamLinkIntent, readSteamLinkIntent,
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
            body: JSON.stringify({ redirect: 'https://evil.example', userId: OTHER.id }),
        })
        expect(bad.status).toBe(400)
        expect(issueSteamLinkIntent).not.toHaveBeenCalled()

        issueSteamLinkIntent.mockResolvedValue({
            state: 'v1.signed',
            expiresAt: '2026-10-17T06:05:00.000Z',
            path: '/api/steam/link?state=v1.signed&client=mobile',
        })
        const res = await call(linkIntent.POST, 'http://127.0.0.1:3210/api/v1/me/steam/link-intent', {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
        })
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({
            state: 'v1.signed',
            expiresAt: '2026-10-17T06:05:00.000Z',
            path: '/api/steam/link?state=v1.signed&client=mobile',
        })
        expect(issueSteamLinkIntent).toHaveBeenCalledWith(USER.id)
        expect(res.headers.get('cache-control')).toBe('private, no-store')
        expect(consumeWriteRateLimit).toHaveBeenCalledWith(USER.id)
    })

    it('fails closed when the signing secret is missing and does not name it', async () => {
        issueSteamLinkIntent.mockRejectedValue(new SteamLinkIntentConfigError())
        const res = await call(linkIntent.POST, 'http://localhost/api/v1/me/steam/link-intent', {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
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
        expect(getSteamAuthUrl).toHaveBeenCalledWith('http://localhost', 'live')
        expect(requireUser).not.toHaveBeenCalled()
        expect(peekSteamLinkIntent).toHaveBeenCalledWith('live')
    })

    it('keeps the website button on the cookie session', async () => {
        getSteamAuthUrl.mockResolvedValue('https://steamcommunity.com/openid/login')
        const res = await call(steamLink.GET, 'http://localhost/api/steam/link')
        expect(res.headers.get('location')).toBe('https://steamcommunity.com/openid/login')
        expect(requireUser).toHaveBeenCalledOnce()
        expect(peekSteamLinkIntent).not.toHaveBeenCalled()
        expect(getSteamAuthUrl).toHaveBeenCalledWith('http://localhost')
    })

    it('links the token user and does not call the cookie session', async () => {
        readSteamLinkIntent.mockReturnValue({ userId: USER.id, jti: 'jti', exp: 1 })
        verifySteamCallback.mockResolvedValue('76561198000000000')
        consumeSteamLinkIntent.mockResolvedValue({ userId: USER.id })

        const res = await call(
            steamCallback.GET,
            'http://localhost/api/steam/callback?state=live&openid.mode=id_res&return=https://evil.example',
            { headers: { cookie: 'sb=website' } },
        )

        expect(res.status).toBe(302)
        expect(res.headers.get('location')).toBe('screenpeak://steamlink?ok=1')
        expect(getOptionalUser).not.toHaveBeenCalled()
        expect(upsertSteamAccount).not.toHaveBeenCalled()
        expect(verifySteamCallback).toHaveBeenCalledWith(
            'http://localhost',
            expect.stringContaining('state=live'),
            'live',
        )
        expect(consumeSteamLinkIntent).toHaveBeenCalledWith('live', '76561198000000000')
    })

    it('drops a forged or replayed state before Steam verification and before the cookie user', async () => {
        readSteamLinkIntent.mockReturnValue(null)
        const res = await call(steamCallback.GET, 'http://localhost/api/steam/callback?state=forged', {
            headers: { cookie: 'sb=website' },
        })
        expect(res.headers.get('location')).toBe('screenpeak://steamlink?ok=0')
        expect(verifySteamCallback).not.toHaveBeenCalled()
        expect(consumeSteamLinkIntent).not.toHaveBeenCalled()
        expect(getOptionalUser).not.toHaveBeenCalled()
        expect(upsertSteamAccount).not.toHaveBeenCalled()
    })

    it('still links the cookie session when the website callback has no state', async () => {
        verifySteamCallback.mockResolvedValue('76561198000000000')
        upsertSteamAccount.mockResolvedValue({ data: { steam_id: '76561198000000000' }, error: null })
        const res = await call(steamCallback.GET, 'http://localhost/api/steam/callback?openid.mode=id_res')
        expect(res.headers.get('location')).toBe('http://localhost/steamlink')
        expect(getOptionalUser).toHaveBeenCalledOnce()
        expect(upsertSteamAccount).toHaveBeenCalledWith(OTHER.id, '76561198000000000')
        expect(readSteamLinkIntent).not.toHaveBeenCalled()
    })
})

describe('POST /api/v1/me/steam/import', () => {
    it('uses the bearer user and the existing batch function', async () => {
        runSteamImportBatch.mockResolvedValue({ ...BATCH, nextCursor: { phase: 'pending', afterAppId: 40 }, remaining: 12 })
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

    it('returns the lease notice and turns a Steam outage into 503 without leaking internals', async () => {
        runSteamImportBatch.mockResolvedValueOnce({
            ...BATCH,
            remaining: 1,
            retryableAppCount: 1,
            nextCursor: { phase: 'pending', afterAppId: 3 },
            notice: 'Matching is already running for your library.',
            retryAfterMs: 5000,
        })
        const busy = await call(steamImport.POST, 'http://localhost/api/v1/me/steam/import', {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
        })
        expect(busy.status).toBe(200)
        expect(await busy.json()).toMatchObject({ notice: 'Matching is already running for your library.', retryAfterMs: 5000 })

        runSteamImportBatch.mockResolvedValueOnce({ error: 'Steam is unavailable. Your matched games are still listed.' })
        const down = await call(steamImport.POST, 'http://localhost/api/v1/me/steam/import', {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
        })
        expect(down.status).toBe(503)
        expect(down.headers.get('retry-after')).toBe('5')
        expect(await down.json()).toMatchObject({
            error: { code: 'unavailable', message: 'Steam is unavailable. Your matched games are still listed.', retry_after: 5 },
        })

        runSteamImportBatch.mockResolvedValueOnce({ error: 'Steam import lease is not installed. Apply 0008_steam_import_lease, then try the remaining matches again.' })
        const leaked = await call(steamImport.POST, 'http://localhost/api/v1/me/steam/import', {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
        })
        expect(leaked.status).toBe(500)
        expect(await leaked.text()).not.toMatch(/0008_steam_import_lease/)
    })

    it('does not spend the write budget when the budget is already spent', async () => {
        consumeWriteRateLimit.mockRejectedValueOnce(new ApiError(429, 'rate_limited', 'Too many requests. Try again soon.', { 'Retry-After': '3' }))
        const res = await call(steamImport.POST, 'http://localhost/api/v1/me/steam/import', {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
        })
        expect(res.status).toBe(429)
        expect(runSteamImportBatch).not.toHaveBeenCalled()
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
