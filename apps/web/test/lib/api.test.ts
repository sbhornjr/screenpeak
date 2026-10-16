import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { ApiError, UnauthenticatedError, AuthUnavailableError, apiError, withAuth } = await import('@/lib/api')

const req = () => new NextRequest('http://localhost/api/v1/anything')
const ctx = { params: Promise.resolve({ slug: 'baldurs-gate-3' }) }

describe('apiError', () => {
    it('returns the standard { error: { code, message } } body with the given status', async () => {
        const res = apiError(404, 'not_found', 'No such game')

        expect(res.status).toBe(404)
        expect(await res.json()).toEqual({ error: { code: 'not_found', message: 'No such game' } })
    })
})

describe('withAuth', () => {
    it('passes the request and route context through and returns the handler response', async () => {
        const handler = vi.fn(async (_req: NextRequest, c: typeof ctx) => Response.json({ slug: (await c.params).slug }))
        const r = req()

        const res = await withAuth(handler)(r, ctx)

        expect(handler).toHaveBeenCalledWith(r, ctx)
        expect(await res.json()).toEqual({ slug: 'baldurs-gate-3' })
        expect(res.headers.get('access-control-allow-origin')).toBe('*')
        expect(res.headers.get('access-control-allow-credentials')).toBeNull()
    })

    it('turns an unauthenticated error into a 401 with a Bearer challenge', async () => {
        const res = await withAuth(async () => { throw new UnauthenticatedError() })(req(), ctx)

        expect(res.status).toBe(401)
        expect(res.headers.get('www-authenticate')).toBe('Bearer')
        expect(await res.json()).toEqual({ error: { code: 'unauthenticated', message: 'Sign in required.' } })
    })

    it('marks a rejected token with error="invalid_token" (RFC 6750) so clients know to refresh', async () => {
        const res = await withAuth(async () => { throw new UnauthenticatedError('invalid_token') })(req(), ctx)

        expect(res.status).toBe(401)
        expect(res.headers.get('www-authenticate')).toBe('Bearer error="invalid_token"')
        expect((await res.json()).error.code).toBe('invalid_token')
    })

    it('turns an Auth outage into a retryable 503', async () => {
        const res = await withAuth(async () => { throw new AuthUnavailableError() })(req(), ctx)

        expect(res.status).toBe(503)
        expect(res.headers.get('retry-after')).toBe('5')
        expect((await res.json()).error.code).toBe('auth_unavailable')
    })

    it('renders any ApiError a handler throws, e.g. a 404', async () => {
        const res = await withAuth(async () => { throw new ApiError(404, 'not_found', 'No such game') })(req(), ctx)

        expect(res.status).toBe(404)
        expect(await res.json()).toEqual({ error: { code: 'not_found', message: 'No such game' } })
        expect(res.headers.get('access-control-allow-origin')).toBe('*')
        expect(res.headers.get('access-control-allow-headers')).toContain('Authorization')
    })

    it('hides unexpected errors behind a generic 500 and logs the detail server-side', async () => {
        const log = vi.spyOn(console, 'error').mockImplementation(() => {})

        const res = await withAuth(async () => { throw new Error('connect ECONNREFUSED 10.0.0.5:5432') })(req(), ctx)

        expect(res.status).toBe(500)
        const body = await res.json()
        expect(body).toEqual({ error: { code: 'internal', message: 'Something went wrong.' } })
        expect(JSON.stringify(body)).not.toContain('ECONNREFUSED')
        expect(log).toHaveBeenCalled()
        expect(JSON.stringify(log.mock.calls)).toContain('ECONNREFUSED')
    })
})
