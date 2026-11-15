import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { ApiError, UnauthenticatedError } from '@/lib/api'

const requireBearerUser = vi.fn()
const blockUser = vi.fn()
const unblockUser = vi.fn()
const userExists = vi.fn()
const getBlockedUsers = vi.fn()
const createReport = vi.fn()

class ReportTargetNotFoundError extends Error {
    constructor(targetType: string, targetId: string) {
        super(`${targetType} target not found: ${targetId}`)
        this.name = 'ReportTargetNotFoundError'
    }
}

vi.mock('@/lib/auth', () => ({ requireBearerUser, getBearerUser: vi.fn() }))
const consumeWriteRateLimit = vi.fn(async () => {})
const consumeReportRateLimit = vi.fn(async () => {})
vi.mock('@/lib/rate-limit', () => ({ consumeWriteRateLimit, consumeReportRateLimit }))
vi.mock('@/lib/queries/user', () => ({ blockUser, unblockUser, userExists, getBlockedUsers }))
vi.mock('@/lib/queries/report', () => ({ createReport, ReportTargetNotFoundError }))

const block = await import('@/app/api/v1/user/[username]/block/route')
const blocked = await import('@/app/api/v1/me/blocked/route')
const reports = await import('@/app/api/v1/reports/route')

const USER = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'a@x.test' }
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

type CallInit = { method?: string, body?: string, headers?: Record<string, string> }

function call(handler: unknown, url: string, params: Record<string, string>, init?: CallInit): Promise<Response> {
    const invoke = handler as (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>
    return invoke(new NextRequest(url, init), { params: Promise.resolve(params) })
}

const jsonInit = (method: string, body: unknown): CallInit => ({
    method,
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
})

beforeEach(() => {
    requireBearerUser.mockReset().mockResolvedValue(USER)
    consumeWriteRateLimit.mockReset().mockResolvedValue(undefined)
    consumeReportRateLimit.mockReset().mockResolvedValue(undefined)
    blockUser.mockReset().mockResolvedValue(undefined)
    unblockUser.mockReset().mockResolvedValue(undefined)
    userExists.mockReset().mockResolvedValue(true)
    getBlockedUsers.mockReset().mockResolvedValue([])
    createReport.mockReset().mockResolvedValue(undefined)
})

describe('block', () => {
    it('blocks another user as the bearer caller', async () => {
        const res = await call(block.POST, `http://localhost/api/v1/user/${OTHER}/block`, { username: OTHER }, { method: 'POST' })

        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ blocked: true })
        expect(consumeWriteRateLimit).toHaveBeenCalledWith(USER.id)
        expect(blockUser).toHaveBeenCalledWith(USER.id, OTHER)
    })

    it('rejects a self-block and a missing user', async () => {
        const self = await call(block.POST, `http://localhost/api/v1/user/${USER.id}/block`, { username: USER.id }, { method: 'POST' })
        userExists.mockResolvedValue(false)
        const missing = await call(block.POST, `http://localhost/api/v1/user/${OTHER}/block`, { username: OTHER }, { method: 'POST' })

        expect(self.status).toBe(400)
        expect(missing.status).toBe(404)
        expect(blockUser).not.toHaveBeenCalled()
    })

    it('unblocks as the bearer caller', async () => {
        const res = await call(block.DELETE, `http://localhost/api/v1/user/${OTHER}/block`, { username: OTHER }, { method: 'DELETE' })

        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ blocked: false })
        expect(consumeWriteRateLimit).toHaveBeenCalledWith(USER.id)
        expect(unblockUser).toHaveBeenCalledWith(USER.id, OTHER)
    })

    it('rejects a missing bearer before any write', async () => {
        requireBearerUser.mockRejectedValue(new UnauthenticatedError())

        const res = await call(block.POST, `http://localhost/api/v1/user/${OTHER}/block`, { username: OTHER }, { method: 'POST' })

        expect(res.status).toBe(401)
        expect(blockUser).not.toHaveBeenCalled()
    })
})

describe('GET /api/v1/me/blocked', () => {
    it('returns the caller\'s blocked users without spending the write budget', async () => {
        const rows = [{ id: OTHER, username: 'grumpy', avatar_url: null }]
        getBlockedUsers.mockResolvedValue(rows)

        const res = await call(blocked.GET, 'http://localhost/api/v1/me/blocked', {})

        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ users: rows })
        expect(getBlockedUsers).toHaveBeenCalledWith(USER.id)
        expect(consumeWriteRateLimit).not.toHaveBeenCalled()
        expect(consumeReportRateLimit).not.toHaveBeenCalled()
    })
})

describe('POST /api/v1/reports', () => {
    const body = { targetType: 'profile', targetId: OTHER, reason: 'Spam' }

    it('creates a report as the bearer caller', async () => {
        const res = await call(reports.POST, 'http://localhost/api/v1/reports', {}, jsonInit('POST', body))

        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ ok: true })
        expect(consumeReportRateLimit).toHaveBeenCalledWith(USER.id)
        expect(createReport).toHaveBeenCalledWith({ reporterId: USER.id, ...body })
        expect(consumeWriteRateLimit).not.toHaveBeenCalled()
    })

    it('rejects an invalid body before touching the rate limit or the query', async () => {
        const res = await call(reports.POST, 'http://localhost/api/v1/reports', {}, jsonInit('POST', { targetType: 'profile' }))

        expect(res.status).toBe(400)
        expect(consumeReportRateLimit).not.toHaveBeenCalled()
        expect(createReport).not.toHaveBeenCalled()
    })

    it('returns 429 when the report budget is spent and never calls createReport', async () => {
        consumeReportRateLimit.mockRejectedValueOnce(
            new ApiError(429, 'rate_limited', 'Too many requests. Try again soon.', { 'Retry-After': '3600' }),
        )

        const res = await call(reports.POST, 'http://localhost/api/v1/reports', {}, jsonInit('POST', body))

        expect(res.status).toBe(429)
        expect((await res.json()).error.code).toBe('rate_limited')
        expect(consumeReportRateLimit).toHaveBeenCalledWith(USER.id)
        expect(createReport).not.toHaveBeenCalled()
    })

    it('maps an unknown target to 404', async () => {
        createReport.mockRejectedValueOnce(new ReportTargetNotFoundError('profile', OTHER))

        const res = await call(reports.POST, 'http://localhost/api/v1/reports', {}, jsonInit('POST', body))

        expect(res.status).toBe(404)
        expect((await res.json()).error.code).toBe('not_found')
    })

    it('rejects a missing bearer before any write', async () => {
        requireBearerUser.mockRejectedValue(new UnauthenticatedError())

        const res = await call(reports.POST, 'http://localhost/api/v1/reports', {}, jsonInit('POST', body))

        expect(res.status).toBe(401)
        expect(createReport).not.toHaveBeenCalled()
    })
})
