import { describe, expect, it, vi } from 'vitest'
import { sentryReplayCases, sentryScrubCases, type SentryScrubCase } from '@screenpeak/shared/sentry-cases'

const init = vi.hoisted(() => vi.fn())
const replayIntegration = vi.hoisted(() => vi.fn((options?: { beforeAddRecordingEvent?: (event: unknown) => unknown }) => ({
  name: 'Replay',
  options,
})))

vi.mock('@sentry/nextjs', () => ({
  init,
  replayIntegration,
  captureRouterTransitionStart: vi.fn(),
  captureRequestError: vi.fn(),
  captureException: vi.fn(),
}))

function scrubbed(hook: ((value: unknown) => unknown) | undefined, row: { name: string, input: unknown, output: unknown }, where: string) {
  expect(typeof hook, where).toBe('function')
  const input = structuredClone(row.input)
  expect(hook!(input), `${where} ${row.name}`).toEqual(row.output)
  expect(input, `${where} ${row.name} input`).toEqual(row.input)
}

describe('web Sentry init', () => {
  it('scrubs the shared fixture on the client, server, and edge, including transactions and replay urls', async () => {
    vi.resetModules()
    await import('@/instrumentation-client')
    await import('@/sentry.server.config')
    await import('@/sentry.edge.config')

    const options = init.mock.calls.map(call => call[0] as {
      beforeSend?: (event: unknown) => unknown
      beforeBreadcrumb?: (breadcrumb: unknown) => unknown
      beforeSendTransaction?: (event: unknown) => unknown
    })
    expect(options).toHaveLength(3)

    for (const [index, option] of options.entries()) {
      const where = ['client', 'server', 'edge'][index] ?? String(index)
      for (const row of sentryScrubCases) {
        const hook = row.hook === 'beforeSend' ? option.beforeSend : option.beforeBreadcrumb
        scrubbed(hook, row, where)
      }
      for (const row of sentryScrubCases.filter((item): item is SentryScrubCase => item.hook === 'beforeSend')) {
        scrubbed(option.beforeSendTransaction, row, `${where} transaction`)
      }
    }

    expect(replayIntegration.mock.calls.map(call => {
      const hook = call[0]?.beforeAddRecordingEvent
      return sentryReplayCases.map(row => {
        scrubbed(hook, row, 'replay')
        return row.name
      })
    })).toEqual([sentryReplayCases.map(row => row.name)])
  })
})
