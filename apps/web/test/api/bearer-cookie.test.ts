import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Real getBearerUser, mocked Auth clients. A website cookie must not unlock
// settings or a private loadout.
let requestHeaders = new Headers()
const bearerGetUser = vi.fn()
const cookieGetUser = vi.fn()
const loadSettings = vi.fn()
const loadLoadoutPage = vi.fn()
vi.mock('next/headers', () => ({ headers: async () => requestHeaders }))
vi.mock('@/lib/supabase-stateless', () => ({
    createStatelessClient: () => ({ auth: { getUser: bearerGetUser } }),
}))
vi.mock('@/lib/supabase-server', () => ({
    createClient: async () => ({ auth: { getUser: cookieGetUser } }),
}))
vi.mock('@/lib/loaders/me', () => ({ loadSettings }))
vi.mock('@/lib/loaders/loadout-page', () => ({ loadLoadoutPage }))

const settings = await import('@/app/api/v1/me/settings/route')
const loadout = await import('@/app/api/v1/user/[username]/loadout/route')

const cookieHeaders = { cookie: 'sb-access-token=website-session' }

beforeEach(() => {
    requestHeaders = new Headers()
    bearerGetUser.mockReset()
    cookieGetUser.mockReset().mockResolvedValue({
        data: { user: { id: 'cookie-user', email: 'peek@screenpeak.test' } },
        error: null,
    })
    loadSettings.mockReset().mockResolvedValue({
        username: 'peek',
        email: 'peek@screenpeak.test',
        steam_linked: true,
    })
    loadLoadoutPage.mockReset().mockImplementation(async (_username: string, userId: string | null) => {
        if (!userId) return null
        return { username: 'peek', identity: 'secret readout', viewer: { is_owner: true } }
    })
})

describe('cookie session on bearer-only routes', () => {
    it('answers settings with 401 and does not return the cookie email', async () => {
        const res = await settings.GET(new NextRequest('http://localhost/api/v1/me/settings', {
            headers: cookieHeaders,
        }), { params: Promise.resolve({}) })

        expect(res.status).toBe(401)
        const body = await res.json()
        expect(body.error.code).toBe('unauthenticated')
        expect(JSON.stringify(body)).not.toContain('peek@screenpeak.test')
        expect(loadSettings).not.toHaveBeenCalled()
        expect(cookieGetUser).not.toHaveBeenCalled()
    })

    it('keeps a private loadout hidden from a cookie-only request', async () => {
        const res = await loadout.GET(new NextRequest('http://localhost/api/v1/user/peek/loadout', {
            headers: cookieHeaders,
        }), { params: Promise.resolve({ username: 'peek' }) })

        expect(res.status).toBe(404)
        const body = await res.json()
        expect(body).toEqual({ error: { code: 'not_found', message: 'Not found.' } })
        expect(JSON.stringify(body)).not.toContain('secret readout')
        expect(JSON.stringify(body)).not.toContain('peek@screenpeak.test')
        expect(loadLoadoutPage).toHaveBeenCalledWith('peek', null)
        expect(cookieGetUser).not.toHaveBeenCalled()
    })
})
