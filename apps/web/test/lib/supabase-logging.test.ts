import { describe, it, expect, vi } from 'vitest'
import { createLoggingFetch } from '@/lib/supabase-logging'

// The module logs via ./logger, which writes JSON lines to console. We observe
// behaviour through the real console (a stdout boundary), never by mocking the
// logger itself. The only mock is the global `fetch` — a true HTTP boundary.

function jsonResponse(body: unknown, init?: ResponseInit) {
    return new Response(JSON.stringify(body), {
        headers: { 'content-type': 'application/json' },
        ...init,
    })
}

describe('createLoggingFetch', () => {
    it('returns the underlying response and leaves its body readable by the caller', async () => {
        const payload = { data: [{ id: 1, name: 'Hades' }] }
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(payload, { status: 200 })))

        const loggingFetch = createLoggingFetch('server')
        const res = await loggingFetch('https://proj.supabase.co/rest/v1/games?select=*')

        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toEqual(payload)
    })

    it('logs an error line, with the resource and status, on a non-ok response', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ message: 'permission denied' }, { status: 403 })))
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

        const loggingFetch = createLoggingFetch('server')
        await loggingFetch('https://proj.supabase.co/rest/v1/users')

        expect(errSpy).toHaveBeenCalled()
        const line = errSpy.mock.calls[0][0] as string
        expect(line).toContain('rest/users')
        expect(line).toContain('403')
        expect(line).toContain('permission denied')
    })

    it('redacts sensitive fields from the request body it logs', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({}, { status: 200 })))
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        const loggingFetch = createLoggingFetch('browser')
        await loggingFetch('https://proj.supabase.co/auth/v1/token', {
            method: 'POST',
            body: JSON.stringify({ email: 'a@b.c', password: 'hunter2' }),
        })

        const logged = logSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(logged).not.toContain('hunter2')
        expect(logged).toContain('[REDACTED]')
    })

    it('truncates oversized response bodies in the debug log', async () => {
        const huge = 'x'.repeat(5000)
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(huge, { status: 200 })))
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        const loggingFetch = createLoggingFetch('server')
        await loggingFetch('https://proj.supabase.co/rest/v1/games')

        const logged = logSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(logged).toContain('[truncated')
    })

    it('rethrows network errors after logging them', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => {
            throw new Error('ECONNREFUSED boom')
        }))
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

        const loggingFetch = createLoggingFetch('server')
        await expect(loggingFetch('https://proj.supabase.co/rest/v1/users')).rejects.toThrow('ECONNREFUSED boom')

        const logged = errSpy.mock.calls.map((c) => c[0]).join('\n')
        expect(logged).toContain('network error')
    })
})
