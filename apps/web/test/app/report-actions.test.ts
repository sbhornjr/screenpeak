import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireUser = vi.fn()
const consumeReportRateLimit = vi.fn()
const createReport = vi.fn()

vi.mock('@/lib/auth', () => ({ requireUser }))
vi.mock('@/lib/rate-limit', () => ({ consumeReportRateLimit }))
vi.mock('@/lib/queries/report', () => ({
    createReport,
    ReportTargetNotFoundError: class ReportTargetNotFoundError extends Error {},
}))

const { submitReport } = await import('@/app/report-actions')

const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const TARGET = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

function validInput(overrides: Partial<Record<string, unknown>> = {}) {
    return {
        targetType: 'profile' as const,
        targetId: TARGET,
        reason: 'Harassment',
        ...overrides,
    }
}

beforeEach(() => {
    requireUser.mockReset().mockResolvedValue({ id: USER, email: 'a@x.test' })
    consumeReportRateLimit.mockReset().mockResolvedValue(undefined)
    createReport.mockReset().mockResolvedValue(undefined)
})

describe('submitReport', () => {
    it('calls requireUser, then consumeReportRateLimit, then createReport, in order', async () => {
        const order: string[] = []
        requireUser.mockImplementation(async () => {
            order.push('requireUser')
            return { id: USER, email: 'a@x.test' }
        })
        consumeReportRateLimit.mockImplementation(async () => {
            order.push('consumeReportRateLimit')
        })
        createReport.mockImplementation(async () => {
            order.push('createReport')
        })

        const result = await submitReport(validInput())

        expect(order).toEqual(['requireUser', 'consumeReportRateLimit', 'createReport'])
        expect(consumeReportRateLimit).toHaveBeenCalledWith(USER)
        expect(createReport).toHaveBeenCalledWith({
            reporterId: USER,
            targetType: 'profile',
            targetId: TARGET,
            reason: 'Harassment',
        })
        expect(result).toEqual({ error: null })
    })

    it('does not call createReport when the rate limit rejects', async () => {
        consumeReportRateLimit.mockRejectedValueOnce(new Error('rate limited'))

        await expect(submitReport(validInput())).rejects.toThrow('rate limited')

        expect(createReport).not.toHaveBeenCalled()
    })

    it('does not call the rate limiter or createReport when requireUser rejects', async () => {
        requireUser.mockRejectedValueOnce(new Error('unauthenticated'))

        await expect(submitReport(validInput())).rejects.toThrow('unauthenticated')

        expect(consumeReportRateLimit).not.toHaveBeenCalled()
        expect(createReport).not.toHaveBeenCalled()
    })

    it('returns an error for schema-invalid input without calling requireUser or the rate limiter', async () => {
        const result = await submitReport(validInput({ targetType: 'not-a-type' }))

        expect(result.error).toBeTruthy()
        expect(requireUser).not.toHaveBeenCalled()
        expect(consumeReportRateLimit).not.toHaveBeenCalled()
        expect(createReport).not.toHaveBeenCalled()
    })

    it('returns an error for a missing reason without touching auth', async () => {
        const result = await submitReport(validInput({ reason: '' }))

        expect(result.error).toBeTruthy()
        expect(requireUser).not.toHaveBeenCalled()
        expect(consumeReportRateLimit).not.toHaveBeenCalled()
        expect(createReport).not.toHaveBeenCalled()
    })
})
