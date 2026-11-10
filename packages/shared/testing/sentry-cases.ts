// One table for the website and phone Sentry inits. The values are the shapes
// those SDKs actually send (Steam callback, PKCE bodies, cookies, breadcrumbs).
// Test-only: app code imports `@screenpeak/shared/sentry`. Both apps' lint
// rejects a `@screenpeak/shared/testing/*` import outside a test file.

import { mobileSteamCodeUrl } from '../api/steam'

const PKCE_CODE = 'a'.repeat(43)
const VERIFIER = 'b'.repeat(43)

export const steamCallbackDirty =
  'https://screenpeak.test/api/steam/callback?openid.ns=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0&openid.mode=id_res&openid.return_to=https%3A%2F%2Fscreenpeak.test%2Fapi%2Fsteam%2Fcallback%3Fstate%3Dv1.signed&openid.sig=c2ln&openid.signed=return_to'

export const steamCallbackClean =
  'https://screenpeak.test/api/steam/callback?openid.ns=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0&openid.mode=id_res&openid.return_to=https%3A%2F%2Fscreenpeak.test%2Fapi%2Fsteam%2Fcallback&openid.signed=return_to'

const bareQueryDirty =
  'code=pkce-code&type=recovery&openid.return_to=https%3A%2F%2Fscreenpeak.test%2Fapi%2Fsteam%2Fcallback%3Fstate%3Dv1.signed&openid.sig=c2ln'

const bareQueryClean =
  'type=recovery&openid.return_to=https%3A%2F%2Fscreenpeak.test%2Fapi%2Fsteam%2Fcallback'

const linkCompleteJson = JSON.stringify({ code: PKCE_CODE, verifier: VERIFIER, game: 'hades' })
const linkCompleteJsonClean = JSON.stringify({ code: '[REDACTED]', verifier: '[REDACTED]', game: 'hades' })

export type SentryScrubCase = {
  name: string
  hook: 'beforeSend' | 'beforeBreadcrumb'
  input: unknown
  output: unknown
}

export const sentryScrubCases: SentryScrubCase[] = [
  {
    name: 'steam callback url keeps tags.code and drops nested openid state and sig',
    hook: 'beforeSend',
    input: {
      request: { url: steamCallbackDirty },
      tags: { code: 'not_found' },
    },
    output: {
      request: { url: steamCallbackClean },
      tags: { code: 'not_found' },
    },
  },
  {
    name: 'mobile steam code url',
    hook: 'beforeSend',
    input: {
      request: { url: mobileSteamCodeUrl(PKCE_CODE) },
      tags: { code: 'not_found' },
    },
    output: {
      request: { url: 'screenpeak://steamlink' },
      tags: { code: 'not_found' },
    },
  },
  {
    name: 'link-intent state',
    hook: 'beforeSend',
    input: {
      extra: {
        state: 'v1.signed',
        expiresAt: '2026-10-17T06:05:00.000Z',
        path: '/api/steam/link?state=v1.signed&client=mobile',
      },
    },
    output: {
      extra: {
        state: '[REDACTED]',
        expiresAt: '2026-10-17T06:05:00.000Z',
        path: '/api/steam/link?client=mobile',
      },
    },
  },
  {
    name: 'link-complete code and verifier',
    hook: 'beforeSend',
    input: {
      request: { data: { code: PKCE_CODE, verifier: VERIFIER } },
      tags: { code: 'not_found' },
    },
    output: {
      request: { data: { code: '[REDACTED]', verifier: '[REDACTED]' } },
      tags: { code: 'not_found' },
    },
  },
  {
    name: 'request data code without a verifier, tags.code intact',
    hook: 'beforeSend',
    input: {
      request: { data: { code: 'pkce-code', game: 'hades' } },
      tags: { code: 'not_found' },
    },
    output: {
      request: { data: { code: '[REDACTED]', game: 'hades' } },
      tags: { code: 'not_found' },
    },
  },
  {
    name: 'code beside code_challenge',
    hook: 'beforeSend',
    input: {
      extra: { code: 'pkce-code', code_challenge: 'challenge-1', game: 'hades' },
      tags: { code: 'not_found' },
    },
    output: {
      extra: { code: '[REDACTED]', code_challenge: '[REDACTED]', game: 'hades' },
      tags: { code: 'not_found' },
    },
  },
  {
    name: 'bare query_string',
    hook: 'beforeSend',
    input: {
      request: { query_string: bareQueryDirty },
    },
    output: {
      request: { query_string: bareQueryClean },
    },
  },
  {
    name: 'code-verifier cookie header and request.cookies',
    hook: 'beforeSend',
    input: {
      request: {
        headers: {
          cookie: 'sb-abcdefgh-auth-token-code-verifier=verifier-secret; theme=dark',
        },
        cookies: {
          'sb-abcdefgh-auth-token-code-verifier': 'verifier-secret',
          theme: 'dark',
        },
      },
    },
    output: {
      request: {
        headers: {
          cookie: 'sb-abcdefgh-auth-token-code-verifier=[REDACTED]; theme=dark',
        },
        cookies: {
          'sb-abcdefgh-auth-token-code-verifier': '[REDACTED]',
          theme: 'dark',
        },
      },
    },
  },
  {
    name: 'json body',
    hook: 'beforeSend',
    input: {
      request: { data: linkCompleteJson },
      tags: { code: 'not_found' },
    },
    output: {
      request: { data: linkCompleteJsonClean },
      tags: { code: 'not_found' },
    },
  },
  {
    name: 'json array body',
    hook: 'beforeSend',
    input: {
      request: { data: JSON.stringify([{ password: 'peekpeek', name: 'peek' }]) },
    },
    output: {
      request: { data: JSON.stringify([{ password: '[REDACTED]', name: 'peek' }]) },
    },
  },
  {
    name: 'exception value with a prose question mark and a second url',
    hook: 'beforeSend',
    input: {
      exception: {
        values: [{
          type: 'Error',
          value: `Steam failed? See ${steamCallbackDirty} then screenpeak://auth/confirm?code=pkce-code&type=recovery`,
        }],
      },
      tags: { code: 'not_found' },
    },
    output: {
      exception: {
        values: [{
          type: 'Error',
          value: `Steam failed? See ${steamCallbackClean} then screenpeak://auth/confirm?type=recovery`,
        }],
      },
      tags: { code: 'not_found' },
    },
  },
  {
    name: 'prose question mark before a url',
    hook: 'beforeSend',
    input: {
      message: 'Steam failed? See https://screenpeak.test/api/steam/callback?state=v1.signed&ok=1',
    },
    output: {
      message: 'Steam failed? See https://screenpeak.test/api/steam/callback?ok=1',
    },
  },
  {
    name: 'session, email, bearer, and hash fragment',
    hook: 'beforeSend',
    input: {
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
    },
    output: {
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
    },
  },
  {
    name: 'fetch breadcrumb provider tokens',
    hook: 'beforeBreadcrumb',
    input: {
      category: 'fetch',
      data: {
        method: 'GET',
        url: 'https://screenpeak.test/api/v1/me?provider_token=ptok&provider_refresh_token=prtok&ok=1',
      },
    },
    output: {
      category: 'fetch',
      data: {
        method: 'GET',
        url: 'https://screenpeak.test/api/v1/me?ok=1',
      },
    },
  },
  {
    name: 'xhr breadcrumb pkce code',
    hook: 'beforeBreadcrumb',
    input: {
      category: 'xhr',
      data: { url: 'https://abc.supabase.co/auth/v1/token?grant_type=pkce&code=pkce-code' },
    },
    output: {
      category: 'xhr',
      data: { url: 'https://abc.supabase.co/auth/v1/token?grant_type=pkce' },
    },
  },
  {
    name: 'navigation breadcrumb',
    hook: 'beforeBreadcrumb',
    input: {
      category: 'navigation',
      data: {
        from: '/login',
        to: 'screenpeak://auth/confirm?token_hash=hash-1&type=recovery',
      },
    },
    output: {
      category: 'navigation',
      data: {
        from: '/login',
        to: 'screenpeak://auth/confirm?type=recovery',
      },
    },
  },
  {
    name: 'console breadcrumb password',
    hook: 'beforeBreadcrumb',
    input: {
      category: 'console',
      level: 'error',
      message: 'login failed password=peekpeek',
      data: { arguments: ['login failed password=peekpeek', 'ok'] },
    },
    output: {
      category: 'console',
      level: 'error',
      message: 'login failed password=[REDACTED]',
      data: { arguments: ['login failed password=[REDACTED]', 'ok'] },
    },
  },
  {
    name: 'fetch breadcrumb access token leaves the game url',
    hook: 'beforeBreadcrumb',
    input: {
      category: 'fetch',
      data: { url: 'http://192.168.1.20:3000/api/v1/games/hades?access_token=sekret&state=abc&page=1' },
    },
    output: {
      category: 'fetch',
      data: { url: 'http://192.168.1.20:3000/api/v1/games/hades?page=1' },
    },
  },
]

export type SentryReplayCase = {
  name: string
  input: {
    type: 5
    timestamp: number
    data: {
      tag: 'performanceSpan'
      payload: {
        op: 'resource.fetch' | 'navigation.navigate'
        description: string
        startTimestamp: number
        endTimestamp: number
      }
    }
  }
  output: SentryReplayCase['input']
}

export const sentryReplayCases: SentryReplayCase[] = [
  {
    name: 'resource.fetch span',
    input: {
      type: 5,
      timestamp: 1,
      data: {
        tag: 'performanceSpan',
        payload: {
          op: 'resource.fetch',
          description: steamCallbackDirty,
          startTimestamp: 1,
          endTimestamp: 2,
        },
      },
    },
    output: {
      type: 5,
      timestamp: 1,
      data: {
        tag: 'performanceSpan',
        payload: {
          op: 'resource.fetch',
          description: steamCallbackClean,
          startTimestamp: 1,
          endTimestamp: 2,
        },
      },
    },
  },
  {
    name: 'navigation.navigate span',
    input: {
      type: 5,
      timestamp: 1,
      data: {
        tag: 'performanceSpan',
        payload: {
          op: 'navigation.navigate',
          description: 'screenpeak://auth/confirm?code=pkce-code&type=recovery',
          startTimestamp: 1,
          endTimestamp: 2,
        },
      },
    },
    output: {
      type: 5,
      timestamp: 1,
      data: {
        tag: 'performanceSpan',
        payload: {
          op: 'navigation.navigate',
          description: 'screenpeak://auth/confirm?type=recovery',
          startTimestamp: 1,
          endTimestamp: 2,
        },
      },
    },
  },
]
