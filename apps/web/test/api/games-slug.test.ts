import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// GET /api/v1/games/[slug] is the thin HTTP adapter over loadGamePage: auth →
// loader → JSON. Its collaborators (auth, the loader) are mocked here; both are
// tested on their own in test/lib/.
const getOptionalUser = vi.fn()
const loadGamePage = vi.fn()
vi.mock('@/lib/auth', () => ({ getOptionalUser }))
vi.mock('@/lib/loaders/game-page', () => ({ loadGamePage }))

const { GET } = await import('@/app/api/v1/games/[slug]/route')
const { UnauthenticatedError } = await import('@/lib/api')

const DATA = { game: { id: 'game-1', slug: 'baldurs-gate-3' }, taxonomy: {}, stats: {}, viewer: null }
const call = (slug: string) =>
    GET(new NextRequest(`http://localhost/api/v1/games/${slug}`), { params: Promise.resolve({ slug }) })

beforeEach(() => {
    getOptionalUser.mockReset().mockResolvedValue(null)
    loadGamePage.mockReset().mockResolvedValue(DATA)
})

describe('GET /api/v1/games/[slug]', () => {
    it('returns the loader data as JSON for a signed-out caller', async () => {
        const res = await call('baldurs-gate-3')

        expect(res.status).toBe(200)
        expect(await res.json()).toEqual(DATA)
        expect(loadGamePage).toHaveBeenCalledWith('baldurs-gate-3', null)
    })

    it("passes the signed-in viewer's id to the loader", async () => {
        getOptionalUser.mockResolvedValue({ id: 'viewer-1', email: 'me@x.test' })

        await call('baldurs-gate-3')

        expect(loadGamePage).toHaveBeenCalledWith('baldurs-gate-3', 'viewer-1')
    })

    it('is never cached by a shared cache — it carries the viewer’s own lists and library', async () => {
        const res = await call('baldurs-gate-3')

        expect(res.headers.get('cache-control')).toBe('private, no-store')
    })

    it('answers an unknown slug with 404 not_found in the standard error shape', async () => {
        loadGamePage.mockResolvedValue(null)

        const res = await call('nope')

        expect(res.status).toBe(404)
        expect(await res.json()).toEqual({ error: { code: 'not_found', message: 'No game with that slug.' } })
    })

    it('answers a database outage with 500, not a missing game', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        loadGamePage.mockRejectedValue(new Error('database unavailable'))

        const res = await call('baldurs-gate-3')

        expect(res.status).toBe(500)
        const body = await res.json()
        expect(body.error.code).toBe('internal')
        expect(JSON.stringify(body)).not.toContain('database unavailable')
    })

    it('rejects a bad bearer token with 401 before loading anything', async () => {
        getOptionalUser.mockRejectedValue(new UnauthenticatedError('invalid_token'))

        const res = await call('baldurs-gate-3')

        expect(res.status).toBe(401)
        expect((await res.json()).error.code).toBe('invalid_token')
        expect(loadGamePage).not.toHaveBeenCalled()
    })
})
