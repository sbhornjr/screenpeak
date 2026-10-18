import { describe, expect, it } from 'vitest'

import {
  RESET_CONFIRMATION,
  RESET_LINK_HINT,
  RESET_REPEAT_MS,
  claimResetSend,
  completeAuthCallback,
  confirmDestination,
  createAuthCallbackCompleter,
  leavePasswordScreen,
  newPasswordProblem,
  passwordResetRedirectBase,
  passwordResetRedirectTo,
  parseAuthCallback,
  recoveryScreenExit,
  releaseResetSend,
  resetCooldownRemaining,
  resetOutcome,
  resetSendDecision,
  updatePasswordView,
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

  it('records the send before the request returns so a second call does not send', () => {
    const first = claimResetSend('person@example.com', null, 1_000)
    const second = claimResetSend('person@example.com', first.lastSentAt, 1_000)
    expect(first.decision).toEqual({ send: true, email: 'person@example.com' })
    expect(second.decision).toEqual({
      send: false,
      confirmation: 'If that email has an account, a reset link is on its way.',
    })
    expect(resetCooldownRemaining(first.lastSentAt, 1_000)).toBe(RESET_REPEAT_MS)
    expect(resetCooldownRemaining(first.lastSentAt, 1_000 + RESET_REPEAT_MS)).toBe(0)
  })

  it('clears the send time when the request fails so another send can start', () => {
    const claimed = claimResetSend('person@example.com', null, 1_000)
    const released = releaseResetSend(claimed.lastSentAt, { error: 'Email rate limit exceeded' })
    expect(released).toBeNull()
    expect(claimResetSend('person@example.com', released, 1_001).decision).toEqual({
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
        return { error: null, recovery: true }
      },
    }, WEB)
    expect(seen).toEqual(['reset-code'])
    expect(result).toEqual({ destination: '/auth/update-password', recovery: true })
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
    }, 'screenpeak://')
    expect(seen).toEqual([{ type: 'recovery', token_hash: 'hash-1' }])
    expect(result).toEqual({ destination: '/auth/update-password', recovery: true })
  })

  it('rejects a link that carries access and refresh tokens', async () => {
    const url = `${WEB}/auth/confirm#access_token=access-1&refresh_token=refresh-1&type=recovery`
    await expect(completeAuthCallback(url, {
      verifyOtp: async () => { throw new Error('called verify') },
      exchangeCodeForSession: async () => { throw new Error('called exchange') },
    }, WEB)).rejects.toThrow(RESET_LINK_HINT)
  })

  it('shows a fixed sentence instead of the error text in the link', async () => {
    const url = `${WEB}/auth/confirm?error_description=${encodeURIComponent('<script>alert(1)</script>')}`
    await expect(completeAuthCallback(url, {
      verifyOtp: async () => ({ error: null }),
      exchangeCodeForSession: async () => ({ error: null }),
    }, WEB)).rejects.toThrow(RESET_LINK_HINT)
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
        return { error: null, recovery: true }
      },
    }
    const url = `${WEB}/auth/confirm?code=once-code&next=/auth/update-password`
    const [first, second] = await Promise.all([complete(url, auth, WEB), complete(url, auth, WEB)])
    expect(calls).toBe(1)
    expect(first).toEqual({ destination: '/auth/update-password', recovery: true })
    expect(second).toEqual(first)
  })

  it('exchanges again after the first exchange has finished', async () => {
    const complete = createAuthCallbackCompleter()
    const seen: string[] = []
    const auth = {
      verifyOtp: async () => ({ error: { message: 'wrong method' } }),
      exchangeCodeForSession: async (code: string) => {
        seen.push(code)
        return { error: null, recovery: true }
      },
    }
    const url = `${WEB}/auth/confirm?code=later-code&next=/auth/update-password`
    await complete(url, auth, WEB)
    await complete(url, auth, WEB)
    expect(seen).toEqual(['later-code', 'later-code'])
  })
})

describe('set new password screen', () => {
  it('hides the form from a signed-in session that is not a recovery', () => {
    expect(updatePasswordView(false, false)).toEqual({
      form: false,
      message: 'This page only works from the reset link in your email.',
    })
    expect(updatePasswordView(true, false)).toEqual({ form: true })
  })

  it('signs the user out when they leave before the password is saved', async () => {
    const actions: string[] = []
    const left = await leavePasswordScreen({ recovery: true, updated: false }, async () => {
      actions.push('signed-out')
    })
    expect(left).toBe('sign-out')
    expect(actions).toEqual(['signed-out'])
    expect(recoveryScreenExit(true, true)).toBe('keep')
    const stayed: string[] = []
    const kept = await leavePasswordScreen({ recovery: true, updated: true }, async () => {
      stayed.push('signed-out')
    })
    expect(kept).toBe('keep')
    expect(stayed).toEqual([])
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
