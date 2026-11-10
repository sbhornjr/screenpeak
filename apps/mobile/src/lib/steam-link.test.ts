import { ApiClientError } from '@screenpeak/shared/api/client'
import { describe, expect, it, vi } from 'vitest'

import { linkSteam, pkcePair, steamReturn, type SteamLinkSteps } from './steam-link'

// RFC 7636 Appendix B: these 32 octets, their verifier, and its S256 challenge.
const RFC_OCTETS = [116, 24, 223, 180, 151, 153, 224, 37, 79, 250, 96, 125, 216, 173, 187, 186, 22, 212, 37, 77, 105, 214, 191, 240, 91, 88, 5, 88, 83, 132, 141, 121]
const RFC_VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
const RFC_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'

describe('steam link PKCE', () => {
  it('turns 32 random bytes into the RFC verifier and its S256 challenge', async () => {
    const sha256Base64 = vi.fn(async () => 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw+cM=')
    const pair = await pkcePair({ randomBytes: () => Uint8Array.from(RFC_OCTETS), sha256Base64 })
    expect(pair).toEqual({ verifier: RFC_VERIFIER, challenge: RFC_CHALLENGE })
    expect(sha256Base64).toHaveBeenCalledWith(RFC_VERIFIER)
  })
})

describe('steam link return', () => {
  it('reads the one-time code, a failure, and anything else', () => {
    expect(steamReturn('screenpeak://steamlink?code=abc-123_x')).toEqual({ code: 'abc-123_x' })
    expect(steamReturn('screenpeak://steamlink?ok=0')).toEqual({ failed: true })
    expect(steamReturn('screenpeak://steamlink')).toEqual({ failed: true })
    expect(steamReturn('https://evil.example/steamlink?code=abc')).toEqual({ failed: true })
  })
})

function steps(overrides: Partial<SteamLinkSteps> = {}): SteamLinkSteps {
  return {
    pkce: vi.fn(async () => ({ verifier: RFC_VERIFIER, challenge: RFC_CHALLENGE })),
    intent: vi.fn(async () => ({ state: 's', expiresAt: '2026-11-01T00:05:00Z', path: '/api/steam/link?state=s&client=mobile' })),
    open: vi.fn(async () => ({ type: 'success', url: 'screenpeak://steamlink?code=one-time' })),
    complete: vi.fn(async () => undefined),
    ...overrides,
  }
}

describe('linking Steam', () => {
  it('sends the challenge, opens the intent path, and completes with the code and the verifier', async () => {
    const flow = steps()
    expect(await linkSteam(flow)).toEqual({ kind: 'linked' })
    expect(flow.intent).toHaveBeenCalledWith(RFC_CHALLENGE)
    expect(flow.open).toHaveBeenCalledWith('/api/steam/link?state=s&client=mobile')
    expect(flow.complete).toHaveBeenCalledWith({ code: 'one-time', verifier: RFC_VERIFIER })
  })

  it('stops quietly when the sheet is closed', async () => {
    const flow = steps({ open: vi.fn(async () => ({ type: 'cancel' })) })
    expect(await linkSteam(flow)).toEqual({ kind: 'canceled' })
    expect(flow.complete).not.toHaveBeenCalled()
  })

  it('says linking failed when Steam sends the phone back without a code', async () => {
    const flow = steps({ open: vi.fn(async () => ({ type: 'success', url: 'screenpeak://steamlink?ok=0' })) })
    expect(await linkSteam(flow)).toEqual({ kind: 'failed', message: "Couldn't link Steam. Try again." })
    expect(flow.complete).not.toHaveBeenCalled()
  })

  it('shows the server sentence when the intent or the exchange fails', async () => {
    const busy = new ApiClientError(429, 'rate_limited', 'Too many requests. Try again in a minute.', 30)
    expect(await linkSteam(steps({ intent: vi.fn(async () => { throw busy }) })))
      .toEqual({ kind: 'failed', message: 'Too many requests. Try again in 30 seconds.' })
    const expired = new ApiClientError(400, 'invalid_request', 'That Steam sign-in expired. Try again.', null)
    expect(await linkSteam(steps({ complete: vi.fn(async () => { throw expired }) })))
      .toEqual({ kind: 'failed', message: 'That Steam sign-in expired. Try again.' })
  })
})
