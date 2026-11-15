import { afterEach, describe, expect, it, vi } from 'vitest'

// sendReportEmail's whole contract is "never throws" — every path (missing
// API key, a rejected/thrown send, Resend's own {error} response shape, and
// a successful send) must resolve, never reject. The `resend` package is the
// only thing mocked; RESEND_API_KEY is read at call time (lib/r2.ts's
// pattern), so each test stubs/unstubs it itself.

const sendMock = vi.fn()

vi.mock('resend', () => ({
    // A plain arrow function can't back a mock constructor (`new Resend()`
    // throws "is not a constructor") — use a regular function so `new` works.
    Resend: vi.fn().mockImplementation(function MockResend() {
        return { emails: { send: sendMock } }
    }),
}))

const REPORT = {
    reporterUsername: 'peek',
    targetType: 'review' as const,
    reason: 'Spam',
    details: 'This review is just an ad.',
    link: 'https://screenpeak.gg/user/someone/ratings_reviews#review-123',
}

describe('sendReportEmail', () => {
    afterEach(() => {
        vi.unstubAllEnvs()
    })

    it('resolves { ok: false } without throwing when RESEND_API_KEY is missing', async () => {
        vi.stubEnv('RESEND_API_KEY', '')
        const { sendReportEmail } = await import('@/lib/email')

        await expect(sendReportEmail(REPORT)).resolves.toEqual({
            ok: false,
            error: expect.any(String),
        })
        expect(sendMock).not.toHaveBeenCalled()
    })

    it('resolves { ok: false } without throwing when resend.emails.send rejects', async () => {
        vi.stubEnv('RESEND_API_KEY', 'test-key')
        sendMock.mockRejectedValueOnce(new Error('network down'))
        const { sendReportEmail } = await import('@/lib/email')

        await expect(sendReportEmail(REPORT)).resolves.toEqual({
            ok: false,
            error: expect.stringContaining('network down'),
        })
    })

    it('resolves { ok: false } without throwing when resend.emails.send resolves an error response', async () => {
        vi.stubEnv('RESEND_API_KEY', 'test-key')
        sendMock.mockResolvedValueOnce({
            data: null,
            error: { message: 'invalid from address', statusCode: 422, name: 'invalid_from_address' },
        })
        const { sendReportEmail } = await import('@/lib/email')

        await expect(sendReportEmail(REPORT)).resolves.toEqual({
            ok: false,
            error: expect.stringContaining('invalid from address'),
        })
    })

    it('resolves { ok: true } on a successful send, with a plain-text body naming the reporter, reason, details, and link', async () => {
        vi.stubEnv('RESEND_API_KEY', 'test-key')
        sendMock.mockResolvedValueOnce({ data: { id: 'email_123' }, error: null })
        const { sendReportEmail } = await import('@/lib/email')

        await expect(sendReportEmail(REPORT)).resolves.toEqual({ ok: true })

        expect(sendMock).toHaveBeenCalledTimes(1)
        const payload = sendMock.mock.calls[0]?.[0]
        expect(payload.to).toEqual(['support@screenpeak.gg'])
        expect(payload.html).toBeUndefined()
        expect(typeof payload.text).toBe('string')
        expect(payload.text).toContain(REPORT.reporterUsername)
        expect(payload.text).toContain(REPORT.reason)
        expect(payload.text).toContain(REPORT.details)
        expect(payload.text).toContain(REPORT.link)
    })

    it('represents null details plainly rather than crashing on string interpolation', async () => {
        vi.stubEnv('RESEND_API_KEY', 'test-key')
        sendMock.mockResolvedValueOnce({ data: { id: 'email_124' }, error: null })
        const { sendReportEmail } = await import('@/lib/email')

        await expect(sendReportEmail({ ...REPORT, details: null })).resolves.toEqual({ ok: true })

        const payload = sendMock.mock.calls[0]?.[0]
        expect(payload.text).not.toContain('null')
    })
})
