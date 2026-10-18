import { describe, expect, it } from 'vitest'

import {
  RESET_CONFIRMATION,
  RESET_LINK_HINT,
  RESET_REPEAT_MS,
  completeAuthCallback,
  confirmDestination,
  createAuthCallbackCompleter,
  newPasswordProblem,
  passwordResetRedirectBase,
  passwordResetRedirectTo,
  parseAuthCallback,
  resetOutcome,
  resetSendDecision,
} from './password-reset'

const WEB = 'http://localhost:8081'
const CODE_URL = `${WEB}/auth/confirm?code=reset-code&next=/auth/update-password`
const NATIVE_URL = 'screenpeak://auth/confirm?code=reset-code&next=/auth/update-password'

describe('password reset redirect', () => {
  it('uses the website confirm path on the Expo web origin', () => {
    const base = passwordResetRedirectBase('web', WEB, 'screenpeak')
    expect(passwordResetRedirectTo(base)).toBe(`${WEB}/auth/confirm?next=/auth/update-password`)
  })

  it('uses the screenpeak scheme for a native build', () => {
    const base = passwordResetRedirectBase('native', WEB, 'screenpeak')
    expect(passwordResetRedirectTo(base)).toBe('screenpeak://auth/confirm?next=/auth/update-password')
  })
})

describe('reset request', () => {
  it('asks for a real email before sending', () => {
    expect(resetSendDecision('not-an-email', null, 1_000)).toEqual({
      send: false,
      message: 'Enter a valid email address',
    })
  })

  it('sends a trimmed address the first time', () => {
    expect(resetSendDecision('  Person@Example.com  ', null, 1_000)).toEqual({
      send: true,
      email: 'Person@Example.com',
    })
  })

  it('shows the same confirmation for a repeat inside the window and does not send', () => {
    const sentAt = 5_000
    expect(resetSendDecision('person@example.com', sentAt, sentAt + RESET_REPEAT_MS - 1)).toEqual({
      send: false,
      confirmation: RESET_CONFIRMATION,
    })
  })

  it('sends again once the window has passed', () => {
    const sentAt = 5_000
    expect(resetSendDecision('person@example.com', sentAt, sentAt + RESET_REPEAT_MS)).toEqual({
      send: true,
      email: 'person@example.com',
    })
  })

  it('reports the same confirmation whether or not the account exists', () => {
    const present = resetOutcome(null)
    const absent = resetOutcome({ code: 'user_not_found', message: 'User with this email not found' })
    expect(present).toEqual({ confirmation: 'If that email has an account, a reset link is on its way.' })
    expect(absent).toEqual(present)
    expect(resetOutcome({ code: 'email_not_found', message: 'Email not found' })).toEqual(present)
  })

  it('shows a rate-limit failure instead of the confirmation', () => {
    expect(resetOutcome({ code: 'over_email_send_rate_limit', message: 'Email rate limit exceeded' })).toEqual({
      error: 'Email rate limit exceeded',
    })
  })
})

describe('recovery link', () => {
  it('reads the code and next path from the Expo web URL and the screenpeak URL', () => {
    const parsed = {
      code: 'reset-code',
      tokenHash: null,
      type: null,
      accessToken: null,
      refreshToken: null,
      next: '/auth/update-password',
      errorDescription: null,
    }
    expect(parseAuthCallback(CODE_URL)).toEqual(parsed)
    expect(parseAuthCallback(NATIVE_URL)).toEqual(parsed)
  })

  it('exchanges a code and opens set-new-password', async () => {
    const seen: string[] = []
    const result = await completeAuthCallback(CODE_URL, {
      verifyOtp: async () => ({ error: { message: 'wrong method' } }),
      exchangeCodeForSession: async (code) => {
        seen.push(code)
        return { error: null }
      },
      setSession: async () => ({ error: { message: 'wrong method' } }),
    }, WEB)
    expect(seen).toEqual(['reset-code'])
    expect(result).toEqual({ destination: '/auth/update-password' })
  })

  it('verifies a recovery token hash and ignores a hostile next path', async () => {
    const seen: { type: string, token_hash: string }[] = []
    const url = 'screenpeak://auth/confirm?token_hash=hash-1&type=recovery&next=https://evil.example/phish'
    const result = await completeAuthCallback(url, {
      verifyOtp: async (args) => {
        seen.push(args)
        return { error: null }
      },
      exchangeCodeForSession: async () => ({ error: { message: 'wrong method' } }),
      setSession: async () => ({ error: { message: 'wrong method' } }),
    }, 'screenpeak://')
    expect(seen).toEqual([{ type: 'recovery', token_hash: 'hash-1' }])
    expect(result).toEqual({ destination: '/auth/update-password' })
  })

  it('stores the implicit recovery session from the URL hash', async () => {
    const seen: { access_token: string, refresh_token: string }[] = []
    const url = `${WEB}/auth/confirm#access_token=access-1&refresh_token=refresh-1&type=recovery`
    const result = await completeAuthCallback(url, {
      verifyOtp: async () => ({ error: { message: 'wrong method' } }),
      exchangeCodeForSession: async () => ({ error: { message: 'wrong method' } }),
      setSession: async (tokens) => {
        seen.push(tokens)
        return { error: null }
      },
    }, WEB)
    expect(seen).toEqual([{ access_token: 'access-1', refresh_token: 'refresh-1' }])
    expect(result).toEqual({ destination: '/auth/update-password' })
  })

  it('refuses a next path that would leave the app', () => {
    expect(confirmDestination({
      code: null,
      tokenHash: null,
      type: null,
      accessToken: null,
      refreshToken: null,
      next: '//evil.example',
      errorDescription: null,
    }, WEB)).toBe('/')
    expect(confirmDestination({
      code: null,
      tokenHash: null,
      type: 'recovery',
      accessToken: null,
      refreshToken: null,
      next: 'https://evil.example/phish',
      errorDescription: null,
    }, WEB)).toBe('/auth/update-password')
  })

  it('tells the user to request a new link when the URL has no token', async () => {
    await expect(completeAuthCallback(`${WEB}/auth/confirm`, {
      verifyOtp: async () => ({ error: null }),
      exchangeCodeForSession: async () => ({ error: null }),
      setSession: async () => ({ error: null }),
    }, WEB)).rejects.toThrow(RESET_LINK_HINT)
  })

  it('exchanges one code once when the screen opens twice', async () => {
    const complete = createAuthCallbackCompleter()
    let calls = 0
    const auth = {
      verifyOtp: async () => ({ error: { message: 'wrong method' } }),
      exchangeCodeForSession: async (code: string) => {
        calls += 1
        expect(code).toBe('once-code')
        return { error: null }
      },
      setSession: async () => ({ error: { message: 'wrong method' } }),
    }
    const url = `${WEB}/auth/confirm?code=once-code&next=/auth/update-password`
    const [first, second] = await Promise.all([complete(url, auth, WEB), complete(url, auth, WEB)])
    expect(calls).toBe(1)
    expect(first).toEqual({ destination: '/auth/update-password' })
    expect(second).toEqual(first)
  })
})

describe('new password', () => {
  it('rejects a mismatch before a short password', () => {
    expect(newPasswordProblem('short', 'other')).toBe("Passwords don't match")
  })

  it('rejects a password under 8 characters', () => {
    expect(newPasswordProblem('shortpw', 'shortpw')).toBe('Password must be at least 8 characters')
  })

  it('accepts a matching password of 8 characters', () => {
    expect(newPasswordProblem('longpass', 'longpass')).toBeNull()
  })
})
