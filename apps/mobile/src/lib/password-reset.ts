import { parseOrError, emailSchema, passwordSchema } from '@screenpeak/shared/schemas'
import { safeNextPath } from '@screenpeak/shared/redirect'

/** Same sentence as the website. It does not say whether the address has an account. */
export const RESET_CONFIRMATION = 'If that email has an account, a reset link is on its way.'

export const RESET_LINK_HINT = 'This page only works from the reset link in your email.'

/** Ignore another send from the same screen session inside this window. */
export const RESET_REPEAT_MS = 30_000

const HIDDEN_ACCOUNT_CODES = new Set(['user_not_found', 'email_not_found'])

export type ResetSendDecision =
  | { send: true, email: string }
  | { send: false, confirmation: string }
  | { send: false, message: string }

export type ResetOutcome = { confirmation: string } | { error: string }

export type AuthCallback = {
  code: string | null
  tokenHash: string | null
  type: string | null
  accessToken: string | null
  refreshToken: string | null
  next: string | null
  errorDescription: string | null
}

export type AuthCallbackClient = {
  verifyOtp: (args: { type: string, token_hash: string }) => Promise<{ error: { message: string } | null }>
  exchangeCodeForSession: (code: string) => Promise<{ error: { message: string } | null }>
  setSession: (args: { access_token: string, refresh_token: string }) => Promise<{ error: { message: string } | null }>
}

/** `web` keeps the page origin. `native` is `scheme://` (Expo's two-slash deep link). */
export function passwordResetRedirectBase(platform: 'web' | 'native', webOrigin: string, scheme: string): string {
  if (platform === 'web') return webOrigin
  return `${scheme}://`
}

/** redirectTo for resetPasswordForEmail. Same path the website sends. */
export function passwordResetRedirectTo(base: string): string {
  const trimmed = base.replace(/\/$/, '')
  if (trimmed.endsWith('://')) return `${trimmed}auth/confirm?next=/auth/update-password`
  return `${trimmed}/auth/confirm?next=/auth/update-password`
}

export function resetSendDecision(email: string, lastSentAt: number | null, now: number): ResetSendDecision {
  const parsed = parseOrError(emailSchema, email)
  if (!parsed.success) return { send: false, message: parsed.error }
  if (lastSentAt != null && now - lastSentAt < RESET_REPEAT_MS) {
    return { send: false, confirmation: RESET_CONFIRMATION }
  }
  return { send: true, email: parsed.data }
}

export function resetOutcome(error: { code?: string | null, message: string } | null): ResetOutcome {
  if (!error || hidesAccount(error)) return { confirmation: RESET_CONFIRMATION }
  return { error: error.message }
}

function hidesAccount(error: { code?: string | null, message: string }): boolean {
  if (error.code && HIDDEN_ACCOUNT_CODES.has(error.code)) return true
  return /user[^\n]{0,40}not found|email[^\n]{0,40}not found|no user found|user does not exist/i.test(error.message)
}

export function parseAuthCallback(raw: string): AuthCallback {
  const url = new URL(raw)
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''))
  const pick = (key: string) => url.searchParams.get(key) || hash.get(key)
  return {
    code: pick('code'),
    tokenHash: pick('token_hash'),
    type: pick('type'),
    accessToken: pick('access_token'),
    refreshToken: pick('refresh_token'),
    next: pick('next'),
    errorDescription: pick('error_description'),
  }
}

export function confirmDestination(callback: AuthCallback, origin: string): string {
  if (callback.type === 'recovery') return '/auth/update-password'
  const base = origin.startsWith('http://') || origin.startsWith('https://') ? origin : 'https://screenpeak.app'
  return safeNextPath(callback.next, base)
}

async function applyAuthCallback(
  callback: AuthCallback,
  auth: AuthCallbackClient,
  origin: string,
): Promise<{ destination: string }> {
  const hasCredential = Boolean(callback.code || callback.tokenHash || callback.accessToken)
  if (callback.errorDescription && !hasCredential) throw new Error(callback.errorDescription)
  if (callback.tokenHash && callback.type) {
    const { error } = await auth.verifyOtp({ type: callback.type, token_hash: callback.tokenHash })
    if (error) throw new Error(error.message)
  } else if (callback.code) {
    const { error } = await auth.exchangeCodeForSession(callback.code)
    if (error) throw new Error(error.message)
  } else if (callback.accessToken && callback.refreshToken) {
    const { error } = await auth.setSession({
      access_token: callback.accessToken,
      refresh_token: callback.refreshToken,
    })
    if (error) throw new Error(error.message)
  } else {
    throw new Error(RESET_LINK_HINT)
  }
  return { destination: confirmDestination(callback, origin) }
}

/** One in-flight exchange per code. A second open (Strict Mode remount) reuses it
 *  instead of burning the single-use recovery code. */
export function createAuthCallbackCompleter() {
  const locks = new Map<string, Promise<{ destination: string }>>()
  return function completeAuthCallback(
    rawUrl: string,
    auth: AuthCallbackClient,
    origin: string,
  ): Promise<{ destination: string }> {
    const callback = parseAuthCallback(rawUrl)
    const key = callback.code || callback.tokenHash || callback.accessToken || ''
    if (!key) return applyAuthCallback(callback, auth, origin)
    const existing = locks.get(key)
    if (existing) return existing
    const run = applyAuthCallback(callback, auth, origin)
    locks.set(key, run)
    run.catch(() => { locks.delete(key) })
    return run
  }
}

export const completeAuthCallback = createAuthCallbackCompleter()

/** Null when the password can be saved. Otherwise the sentence to show. */
export function newPasswordProblem(password: string, again: string): string | null {
  if (password !== again) return "Passwords don't match"
  const parsed = parseOrError(passwordSchema, password)
  if (!parsed.success) return parsed.error
  return null
}
