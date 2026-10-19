import { describe, expect, it, vi } from 'vitest'

const init = vi.hoisted(() => vi.fn())

vi.mock('@sentry/nextjs', () => ({
  init,
  replayIntegration: () => ({ name: 'Replay' }),
  captureRouterTransitionStart: vi.fn(),
  captureRequestError: vi.fn(),
  captureException: vi.fn(),
}))

const dirtyEvent = {
  message: 'Sign-in failed for hornflakes+peek@mail.grokbot.com',
  request: {
    url: 'https://abc.supabase.co/auth/v1/verify?token_hash=hash-1&type=recovery&code=pkce-code&state=state-1&access_token=sekret',
    headers: { Authorization: 'Bearer supa-access-token' },
  },
  breadcrumbs: [
    {
      category: 'navigation',
      data: { url: 'screenpeak://auth/confirm?code=pkce-code&next=/auth/update-password' },
    },
  ],
}

const cleanEvent = {
  message: 'Sign-in failed for [REDACTED_EMAIL]',
  request: {
    url: 'https://abc.supabase.co/auth/v1/verify?type=recovery',
    headers: { Authorization: '[REDACTED]' },
  },
  breadcrumbs: [
    {
      category: 'navigation',
      data: { url: 'screenpeak://auth/confirm?next=/auth/update-password' },
    },
  ],
}

const dirtyBreadcrumb = {
  category: 'fetch',
  data: { url: 'http://192.168.1.20:3000/api/v1/games/hades?access_token=sekret&state=abc&page=1' },
}

const cleanBreadcrumb = {
  category: 'fetch',
  data: { url: 'http://192.168.1.20:3000/api/v1/games/hades?page=1' },
}

describe('web Sentry init', () => {
  it('scrubs the same secrets on the client, server, and edge', async () => {
    vi.resetModules()
    await import('@/instrumentation-client')
    await import('@/sentry.server.config')
    await import('@/sentry.edge.config')

    expect(init.mock.calls.map(call => call[0]?.beforeSend?.(dirtyEvent))).toEqual([
      cleanEvent,
      cleanEvent,
      cleanEvent,
    ])
    expect(init.mock.calls.map(call => call[0]?.beforeBreadcrumb?.(dirtyBreadcrumb))).toEqual([
      cleanBreadcrumb,
      cleanBreadcrumb,
      cleanBreadcrumb,
    ])
  })
})
