import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTokenManager } from '@/lib/igdb/auth'

const credentials = { clientId: 'client', clientSecret: 'secret' }
const token = (value = 'one', expires = 3600) => Response.json({ access_token: value, expires_in: expires, token_type: 'bearer' })
afterEach(() => vi.useRealTimers())

describe('Twitch app tokens', () => {
    it('shares concurrent authentication and caches until the expiry margin', async () => {
        vi.useFakeTimers(); vi.setSystemTime(0)
        const fetcher = vi.fn().mockResolvedValueOnce(token()).mockResolvedValueOnce(token('two'))
        const auth = createTokenManager({ ...credentials, fetcher })
        expect(await Promise.all([auth.getToken(), auth.getToken()])).toEqual(['one', 'one'])
        expect(fetcher).toHaveBeenCalledTimes(1)
        vi.setSystemTime(3_539_000); expect(await auth.getToken()).toBe('one')
        vi.setSystemTime(3_540_000); expect(await auth.getToken()).toBe('two')
        const [url, init] = fetcher.mock.calls[0]
        expect(new URL(url).searchParams.get('grant_type')).toBe('client_credentials')
        expect(init.method).toBe('POST'); expect(init.redirect).toBe('error')
    })
    it('refreshes a rejected token once and does not discard a newer token', async () => {
        const fetcher = vi.fn().mockResolvedValueOnce(token()).mockResolvedValueOnce(token('two'))
        const auth = createTokenManager({ ...credentials, fetcher })
        await auth.getToken()
        expect(await Promise.all([auth.getToken('one'), auth.getToken('one')])).toEqual(['two','two'])
        expect(await auth.getToken('one')).toBe('two')
        expect(fetcher).toHaveBeenCalledTimes(2)
    })
    it.each([Response.json({ access_token: 'leak' }), new Response('secret', { status: 400 }), new Response('not-json')])('rejects invalid auth without exposing the payload', async response => {
        const fetcher = vi.fn().mockResolvedValue(response)
        await expect(createTokenManager({ ...credentials, fetcher }).getToken()).rejects.toThrow(/IGDB/)
        expect(fetcher).toHaveBeenCalledTimes(1)
    })
    it('requires credentials only when a token is requested', async () => {
        const auth = createTokenManager({ clientId: '', clientSecret: '' })
        await expect(auth.getToken()).rejects.toThrow('TWITCH_CLIENT_ID')
    })
    it('sanitizes network errors and bounds retries', async () => {
        vi.useFakeTimers()
        const fetcher = vi.fn().mockRejectedValue(new Error('https://secret-token-url'))
        const result = createTokenManager({ ...credentials, fetcher }).getToken().catch(e => e)
        await vi.runAllTimersAsync()
        expect((await result).message).not.toContain('secret-token-url')
        expect(fetcher).toHaveBeenCalledTimes(3)
    })
})
