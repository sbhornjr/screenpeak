import { beforeEach, describe, expect, it, vi } from 'vitest'

const deleteStaleRateLimits = vi.fn()
vi.mock('@/lib/rate-limit', () => ({ deleteStaleRateLimits }))

const { GET } = await import('@/app/api/cron/rate-limits/route')

beforeEach(() => {
    deleteStaleRateLimits.mockReset().mockResolvedValue(2)
    delete process.env.CRON_SECRET
})

describe('GET /api/cron/rate-limits', () => {
    it('fails closed when CRON_SECRET is unset or the bearer does not match', async () => {
        const missing = await GET(new Request('http://localhost/api/cron/rate-limits'))
        expect(missing.status).toBe(401)
        expect(deleteStaleRateLimits).not.toHaveBeenCalled()

        process.env.CRON_SECRET = 'cron-secret'
        const wrong = await GET(new Request('http://localhost/api/cron/rate-limits', {
            headers: { authorization: 'Bearer other' },
        }))
        expect(wrong.status).toBe(401)
        expect(deleteStaleRateLimits).not.toHaveBeenCalled()
    })

    it('deletes stale buckets when the cron secret matches', async () => {
        process.env.CRON_SECRET = 'cron-secret'
        const res = await GET(new Request('http://localhost/api/cron/rate-limits', {
            headers: { authorization: 'Bearer cron-secret' },
        }))
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ deleted: 2 })
        expect(deleteStaleRateLimits).toHaveBeenCalledOnce()
    })
})
