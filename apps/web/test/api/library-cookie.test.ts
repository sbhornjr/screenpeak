import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Real getBearerUser, mocked Auth clients. A cookie that would sign the website
// in must not become viewer data on /api/v1/user/[username]/library.
let requestHeaders = new Headers()
const bearerGetUser = vi.fn()
const cookieGetUser = vi.fn()
const loadUserLibrary = vi.fn()
vi.mock('next/headers', () => ({ headers: async () => requestHeaders }))
vi.mock('@/lib/supabase-stateless', () => ({
    createStatelessClient: () => ({ auth: { getUser: bearerGetUser } }),
}))
vi.mock('@/lib/supabase-server', () => ({
    createClient: async () => ({ auth: { getUser: cookieGetUser } }),
}))
vi.mock('@/lib/loaders/library-page', () => ({ loadUserLibrary }))

const { GET } = await import('@/app/api/v1/user/[username]/library/route')

const call = () =>
    GET(new NextRequest('http://localhost/api/v1/user/peek/library', {
        headers: { cookie: 'sb-access-token=website-session' },
    }), { params: Promise.resolve({ username: 'peek' }) })

beforeEach(() => {
    requestHeaders = new Headers()
    bearerGetUser.mockReset()
    cookieGetUser.mockReset().mockResolvedValue({
        data: { user: { id: 'cookie-user', email: 'peek@screenpeak.test' } },
        error: null,
    })
    loadUserLibrary.mockReset().mockImplementation(async (_username: string, userId: string | null) => ({
        username: 'peek',
        games: [{ name: 'Hades' }],
        viewer: userId ? { id: userId } : null,
    }))
})

describe('GET /api/v1/user/[username]/library cookie session', () => {
    it('returns viewer null for a cookie-only request and does not read the cookie', async () => {
        const res = await call()

        expect(res.status).toBe(200)
        expect((await res.json()).viewer).toBeNull()
        expect(loadUserLibrary).toHaveBeenCalledWith('peek', null, expect.objectContaining({ status: '' }))
        expect(cookieGetUser).not.toHaveBeenCalled()
        expect(res.headers.get('access-control-allow-origin')).toBe('*')
    })
})
