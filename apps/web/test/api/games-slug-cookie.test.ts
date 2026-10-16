import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Real getBearerUser, mocked Auth clients. A cookie that would sign the website
// in must not become viewer data on /api/v1.
let requestHeaders = new Headers()
const bearerGetUser = vi.fn()
const cookieGetUser = vi.fn()
const loadGamePage = vi.fn()
vi.mock('next/headers', () => ({ headers: async () => requestHeaders }))
vi.mock('@/lib/supabase-stateless', () => ({
    createStatelessClient: () => ({ auth: { getUser: bearerGetUser } }),
}))
vi.mock('@/lib/supabase-server', () => ({
    createClient: async () => ({ auth: { getUser: cookieGetUser } }),
}))
vi.mock('@/lib/loaders/game-page', () => ({ loadGamePage }))

const { GET } = await import('@/app/api/v1/games/[slug]/route')

const call = () =>
    GET(new NextRequest('http://localhost/api/v1/games/hades', {
        headers: { cookie: 'sb-access-token=website-session' },
    }), { params: Promise.resolve({ slug: 'hades' }) })

beforeEach(() => {
    requestHeaders = new Headers()
    bearerGetUser.mockReset()
    cookieGetUser.mockReset().mockResolvedValue({
        data: { user: { id: 'cookie-user', email: 'peek@screenpeak.test' } },
        error: null,
    })
    loadGamePage.mockReset().mockImplementation(async (_slug: string, userId: string | null) => ({
        game: { name: 'Hades', slug: 'hades' },
        viewer: userId ? { review: { rating: 8 } } : null,
    }))
})

describe('GET /api/v1/games/[slug] cookie session', () => {
    it('returns viewer null for a cookie-only request and does not read the cookie', async () => {
        const res = await call()

        expect(res.status).toBe(200)
        expect((await res.json()).viewer).toBeNull()
        expect(loadGamePage).toHaveBeenCalledWith('hades', null)
        expect(cookieGetUser).not.toHaveBeenCalled()
        expect(res.headers.get('access-control-allow-origin')).toBe('*')
    })
})
