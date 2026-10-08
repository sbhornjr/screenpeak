import { describe, it, expect, vi, afterEach } from 'vitest'
import { redact, logger } from '@/lib/logger'

describe('redact', () => {
    it('replaces the value of a sensitive key with [REDACTED]', () => {
        expect(redact({ password: 'hunter2', name: 'alice' })).toEqual({
            password: '[REDACTED]',
            name: 'alice',
        })
    })

    it('matches sensitive keys case-insensitively and as substrings', () => {
        expect(
            redact({
                Authorization: 'Bearer abc',
                API_KEY: 'k',
                mySecretValue: 's',
                userToken: 't',
            }),
        ).toEqual({
            Authorization: '[REDACTED]',
            API_KEY: '[REDACTED]',
            mySecretValue: '[REDACTED]',
            userToken: '[REDACTED]',
        })
    })

    it('recurses into nested objects', () => {
        expect(redact({ outer: { inner: { apikey: 'k', keep: 1 } } })).toEqual({
            outer: { inner: { apikey: '[REDACTED]', keep: 1 } },
        })
    })

    it('recurses into arrays of objects', () => {
        expect(redact([{ token: 'a' }, { token: 'b', id: 2 }])).toEqual([
            { token: '[REDACTED]' },
            { token: '[REDACTED]', id: 2 },
        ])
    })

    it('leaves non-sensitive structures untouched', () => {
        const input = { a: 1, b: [1, 2, 3], c: { d: 'ok' } }
        expect(redact(input)).toEqual(input)
    })

    it('returns primitives and null unchanged', () => {
        expect(redact('plain')).toBe('plain')
        expect(redact(42)).toBe(42)
        expect(redact(null)).toBe(null)
        expect(redact(undefined)).toBe(undefined)
    })
})

describe('logger', () => {
    afterEach(() => vi.restoreAllMocks())

    it('routes error to console.error as a JSON line with level/scope/message', () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
        logger.error('lib:test', 'something broke')

        expect(spy).toHaveBeenCalledTimes(1)
        const entry = JSON.parse(spy.mock.calls[0][0] as string)
        expect(entry).toMatchObject({ level: 'error', scope: 'lib:test', message: 'something broke' })
        expect(typeof entry.time).toBe('string')
    })

    it('routes warn to console.warn and info to console.log', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        logger.warn('s', 'w')
        logger.info('s', 'i')

        expect(warnSpy).toHaveBeenCalledTimes(1)
        expect(logSpy).toHaveBeenCalledTimes(1)
    })

    it('redacts sensitive fields in the meta object before writing', () => {
        const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
        logger.info('s', 'login attempt', { email: 'a@b.c', password: 'hunter2' })

        const line = spy.mock.calls[0][0] as string
        expect(line).not.toContain('hunter2')
        expect(line).toContain('[REDACTED]')
        expect(line).toContain('a@b.c')
    })

    it('emits debug when not in production', () => {
        const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
        logger.debug('s', 'verbose detail')
        expect(spy).toHaveBeenCalledTimes(1)
    })

    it('silences debug when NODE_ENV is production', async () => {
        vi.stubEnv('NODE_ENV', 'production')
        vi.resetModules()
        const { logger: prodLogger } = await import('@/lib/logger')
        const spy = vi.spyOn(console, 'log').mockImplementation(() => {})

        prodLogger.debug('s', 'verbose detail')

        expect(spy).not.toHaveBeenCalled()
        vi.unstubAllEnvs()
        vi.resetModules()
    })
})
