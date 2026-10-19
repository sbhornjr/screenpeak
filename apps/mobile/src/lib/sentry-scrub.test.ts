import { describe, expect, it } from 'vitest'

import { sentryBeforeBreadcrumb, sentryBeforeSend } from '@screenpeak/shared/sentry'

const dirtyEvent = {
  message: 'Sign-in failed for hornflakes+peek@mail.grokbot.com',
  user: {
    id: '11111111-1111-1111-1111-111111111111',
    username: 'peek',
    email: 'hornflakes+peek@mail.grokbot.com',
  },
  request: {
    url: 'https://abc.supabase.co/auth/v1/verify?token_hash=hash-1&type=recovery&code=pkce-code&state=state-1',
    headers: {
      Authorization: 'Bearer supa-access-token',
      cookie: 'sb-abc-auth-token=sessionblob; sb-abc-auth-token.0=chunk; theme=dark',
    },
  },
  extra: {
    session: {
      access_token: 'supa-access-token',
      refresh_token: 'supa-refresh-token',
      token_hash: 'hash-1',
      code_verifier: 'verifier-1',
      password: 'peekpeek',
      user: { email: 'hornflakes+peek@mail.grokbot.com', id: '11111111-1111-1111-1111-111111111111' },
    },
    note: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payloadvalue.signaturevalue',
  },
  breadcrumbs: [
    {
      category: 'navigation',
      message: 'opened screenpeak://auth/confirm?token_hash=hash-1&type=recovery&next=/auth/update-password',
      data: {
        url: 'screenpeak://auth/confirm#access_token=sekret&refresh_token=other&type=recovery',
      },
    },
  ],
  tags: { code: 'not_found', screen: 'confirm' },
}

const cleanEvent = {
  message: 'Sign-in failed for [REDACTED_EMAIL]',
  user: {
    id: '11111111-1111-1111-1111-111111111111',
    username: 'peek',
    email: '[REDACTED]',
  },
  request: {
    url: 'https://abc.supabase.co/auth/v1/verify?type=recovery',
    headers: {
      Authorization: '[REDACTED]',
      cookie: 'sb-abc-auth-token=[REDACTED]; sb-abc-auth-token.0=[REDACTED]; theme=dark',
    },
  },
  extra: {
    session: {
      access_token: '[REDACTED]',
      refresh_token: '[REDACTED]',
      token_hash: '[REDACTED]',
      code_verifier: '[REDACTED]',
      password: '[REDACTED]',
      user: { email: '[REDACTED]', id: '11111111-1111-1111-1111-111111111111' },
    },
    note: 'Bearer [REDACTED]',
  },
  breadcrumbs: [
    {
      category: 'navigation',
      message: 'opened screenpeak://auth/confirm?type=recovery&next=/auth/update-password',
      data: {
        url: 'screenpeak://auth/confirm#type=recovery',
      },
    },
  ],
  tags: { code: 'not_found', screen: 'confirm' },
}

describe('sentry scrubber', () => {
  it('strips emails, bearer tokens, the Supabase session, and reset query keys from an event', () => {
    const snapshot = structuredClone(dirtyEvent)

    expect(sentryBeforeSend(dirtyEvent)).toEqual(cleanEvent)
    expect(dirtyEvent).toEqual(snapshot)
  })

  it('strips access_token and state from a fetch breadcrumb and leaves the game url alone', () => {
    expect(sentryBeforeBreadcrumb({
      category: 'fetch',
      data: { url: 'http://192.168.1.20:3000/api/v1/games/hades?access_token=sekret&state=abc&page=1' },
    })).toEqual({
      category: 'fetch',
      data: { url: 'http://192.168.1.20:3000/api/v1/games/hades?page=1' },
    })

    expect(sentryBeforeSend({
      message: 'loaded Hades',
      request: { url: 'http://192.168.1.20:3000/api/v1/games/hades' },
      tags: { code: 'not_found' },
    })).toEqual({
      message: 'loaded Hades',
      request: { url: 'http://192.168.1.20:3000/api/v1/games/hades' },
      tags: { code: 'not_found' },
    })
  })
})
