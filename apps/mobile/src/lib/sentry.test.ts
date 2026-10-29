import { describe, expect, it, vi } from 'vitest'
import { sentryScrubCases } from '@screenpeak/shared/sentry-cases'

const init = vi.hoisted(() => vi.fn())
const captureException = vi.hoisted(() => vi.fn())

vi.mock('@sentry/react-native', () => ({
  init,
  captureException,
  wrap: (component: unknown) => component,
}))

vi.mock('react-native', () => ({
  StyleSheet: { create: (styles: unknown) => styles },
  Text: () => null,
  View: () => null,
}))

vi.mock('@/theme', () => ({
  colors: {},
  face: { display: {}, body: {} },
  space: {},
  typeScale: { '3xl': {}, base: {} },
  text: {},
}))

vi.mock('../components/button', () => ({
  Button: () => null,
}))

const DSN = 'https://key@o4512142406057984.ingest.us.sentry.io/1'

describe('mobile Sentry', () => {
  it('treats an explicit undefined DSN as unset, then scrubs the shared fixture and the component stack', async () => {
    vi.resetModules()
    init.mockClear()
    captureException.mockClear()
    const previous = process.env.EXPO_PUBLIC_SENTRY_DSN
    try {
      const { reportAppError, startMobileSentry } = await import('./sentry')
      const { AppErrorBoundary } = await import('../components/app-error-boundary')
      const error = new Error('render blew up')

      reportAppError(error)
      process.env.EXPO_PUBLIC_SENTRY_DSN = DSN
      expect(startMobileSentry(undefined)).toBe(false)
      expect(startMobileSentry('   ')).toBe(false)
      delete process.env.EXPO_PUBLIC_SENTRY_DSN
      expect(startMobileSentry()).toBe(false)
      expect(init).not.toHaveBeenCalled()
      expect(captureException).not.toHaveBeenCalled()

      process.env.EXPO_PUBLIC_SENTRY_DSN = DSN
      expect(startMobileSentry()).toBe(true)
      expect(init).toHaveBeenCalledTimes(1)
      const options = init.mock.calls[0][0] as {
        dsn: string
        sendDefaultPii: boolean
        beforeSend: (event: unknown) => unknown
        beforeBreadcrumb: (breadcrumb: unknown) => unknown
      }
      expect(options.dsn).toBe(DSN)
      expect(options.sendDefaultPii).toBe(false)

      for (const row of sentryScrubCases) {
        const hook = row.hook === 'beforeSend' ? options.beforeSend : options.beforeBreadcrumb
        const input = structuredClone(row.input)
        expect(hook(input), row.name).toEqual(row.output)
        expect(input, `${row.name} input`).toEqual(row.input)
      }

      reportAppError(error)
      expect(captureException).toHaveBeenCalledTimes(1)
      expect(captureException).toHaveBeenCalledWith(error)

      const boundary = new AppErrorBoundary({ children: null })
      boundary.componentDidCatch(error, { componentStack: 'at FeedScreen' })
      expect(captureException).toHaveBeenCalledTimes(2)
      expect(captureException).toHaveBeenLastCalledWith(error, {
        contexts: { react: { componentStack: 'at FeedScreen' } },
      })
    } finally {
      if (previous === undefined) delete process.env.EXPO_PUBLIC_SENTRY_DSN
      else process.env.EXPO_PUBLIC_SENTRY_DSN = previous
    }
  })
})
