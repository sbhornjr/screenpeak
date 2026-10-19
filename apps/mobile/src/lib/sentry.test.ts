import { describe, expect, it, vi } from 'vitest'

const init = vi.hoisted(() => vi.fn())
const captureException = vi.hoisted(() => vi.fn())

vi.mock('@sentry/react-native', () => ({
  init,
  captureException,
  wrap: (component: unknown) => component,
}))

describe('mobile Sentry', () => {
  it('stays off without a DSN, and scrubs events once one is set', async () => {
    vi.resetModules()
    init.mockClear()
    captureException.mockClear()
    const { reportAppError, startMobileSentry } = await import('./sentry')
    const error = new Error('render blew up')

    reportAppError(error)
    expect(startMobileSentry(undefined)).toBe(false)
    expect(startMobileSentry('   ')).toBe(false)
    expect(init).not.toHaveBeenCalled()
    expect(captureException).not.toHaveBeenCalled()

    expect(startMobileSentry('https://key@o4512142406057984.ingest.us.sentry.io/1')).toBe(true)
    expect(init).toHaveBeenCalledTimes(1)
    const options = init.mock.calls[0][0] as {
      dsn: string
      sendDefaultPii: boolean
      beforeSend: (event: unknown) => unknown
      beforeBreadcrumb: (breadcrumb: unknown) => unknown
    }
    expect(options.dsn).toBe('https://key@o4512142406057984.ingest.us.sentry.io/1')
    expect(options.sendDefaultPii).toBe(false)
    expect(options.beforeSend({
      message: 'failed for peek@example.com',
      request: { headers: { Authorization: 'Bearer supa-access-token' } },
    })).toEqual({
      message: 'failed for [REDACTED_EMAIL]',
      request: { headers: { Authorization: '[REDACTED]' } },
    })
    expect(options.beforeBreadcrumb({
      category: 'navigation',
      data: { url: 'screenpeak://auth/confirm?token_hash=hash-1&type=recovery' },
    })).toEqual({
      category: 'navigation',
      data: { url: 'screenpeak://auth/confirm?type=recovery' },
    })

    reportAppError(error)
    expect(captureException).toHaveBeenCalledTimes(1)
    expect(captureException).toHaveBeenCalledWith(error)
  })
})
