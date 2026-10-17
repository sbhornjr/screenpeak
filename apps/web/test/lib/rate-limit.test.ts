import { describe, expect, it, vi, beforeEach } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'

const execute = vi.fn()
vi.mock('@/lib/db', () => ({ db: { execute } }))

const { clientAddress, searchBucket, consumeApiRateLimit, consumeSearchRateLimit, deleteStaleRateLimits } = await import('@/lib/rate-limit')
const { ApiError } = await import('@/lib/api')

beforeEach(() => { execute.mockReset() })

describe('clientAddress', () => {
    it('prefers x-vercel-forwarded-for, then x-real-ip, then the last forwarded hop', () => {
        const all = new Headers({
            'x-vercel-forwarded-for': '203.0.113.9',
            'x-real-ip': '203.0.113.5',
            'x-forwarded-for': '1.1.1.1, 198.51.100.9',
        })
        expect(clientAddress(all)).toBe('203.0.113.9')
        expect(clientAddress(new Headers({ 'x-real-ip': '203.0.113.5', 'x-forwarded-for': '1.1.1.1, 198.51.100.9' }))).toBe('203.0.113.5')
        expect(clientAddress(new Headers({ 'x-forwarded-for': '1.1.1.1, 198.51.100.9' }))).toBe('198.51.100.9')
        expect(clientAddress(new Headers({ 'x-vercel-forwarded-for': 'not an ip', 'x-real-ip': '203.0.113.5' }))).toBe('203.0.113.5')
        expect(clientAddress(new Headers())).toBe('local')
        expect(clientAddress(new Headers({ 'x-real-ip': '203.0.113.5; DROP' }))).toBe('203.0.113.5')
    })
})

describe('searchBucket', () => {
    it('keys a signed-in caller by user id so a new address does not reset the budget', () => {
        const headers = new Headers({ 'x-real-ip': '203.0.113.5' })
        const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
        expect(searchBucket(id, headers)).toBe(`search:user:${id}`)
        expect(searchBucket(null, headers)).toBe('search:ip:203.0.113.5')
    })
})

describe('consumeApiRateLimit', () => {
    it('allows a hit inside the window and rejects the next one with Retry-After', async () => {
        execute.mockResolvedValueOnce([{ hits: 1, retry_after: 60 }])
        await expect(consumeApiRateLimit('write:user-1', 1, 60)).resolves.toBeUndefined()

        execute.mockResolvedValueOnce([{ hits: 2, retry_after: 12 }])
        const error = await consumeApiRateLimit('write:user-1', 1, 60).then(() => null, (err: unknown) => err)
        expect(error).toBeInstanceOf(ApiError)
        expect(error).toMatchObject({ status: 429, code: 'rate_limited', headers: { 'Retry-After': '12' } })
    })

    it('refuses a bucket that is not a short token, and a database error is not swallowed', async () => {
        await expect(consumeApiRateLimit('write/not safe', 10, 60)).rejects.toThrow(/bucket/i)
        expect(execute).not.toHaveBeenCalled()

        execute.mockRejectedValueOnce(new Error('database unavailable'))
        await expect(consumeApiRateLimit('write:user-1', 10, 60)).rejects.toThrow('database unavailable')
    })
})

describe('deleteStaleRateLimits', () => {
    it('deletes buckets whose window started more than a day ago', async () => {
        execute.mockResolvedValueOnce([{ bucket: 'old' }])
        await expect(deleteStaleRateLimits()).resolves.toBe(1)
        const rendered = new PgDialect().sqlToQuery(execute.mock.calls[0][0] as SQL)
        expect(rendered.sql).toContain('delete from api_rate_limits')
        expect(rendered.sql).toContain("interval '1 day'")
    })
})

describe('consumeSearchRateLimit', () => {
    it('charges the signed-out ip bucket', async () => {
        execute.mockResolvedValueOnce([{ hits: 1, retry_after: 60 }])
        await consumeSearchRateLimit(null, new Headers({ 'x-real-ip': '203.0.113.8' }))
        const rendered = new PgDialect().sqlToQuery(execute.mock.calls[0][0] as SQL)
        expect(rendered.sql).toContain('api_rate_limits')
        expect(rendered.params[0]).toBe('search:ip:203.0.113.8')
    })
})
