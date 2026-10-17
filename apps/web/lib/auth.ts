import { isAuthApiError, isAuthRetryableFetchError, type AuthError, type User } from '@supabase/supabase-js'
import { headers } from 'next/headers'
import { AuthUnavailableError, UnauthenticatedError } from '@/lib/api'
import { consumeWriteRateLimit } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase-server'
import { createStatelessClient } from '@/lib/supabase-stateless'

// Who is calling? Two functions, usable anywhere on the server — Server
// Components, Server Actions and Route Handlers — because they read the
// credentials from the current request via `headers()` / `cookies()`:
//
//   getOptionalUser()  → the caller, or null when signed out
//   requireUser()      → the caller, or throws UnauthenticatedError (401)
//
// The credential is `Authorization: Bearer <access_token>` when present (the
// phone app sends it), otherwise the Supabase session cookie (the browser sends
// it automatically). Either way the Auth server verifies it (`getUser`) — the
// token's claims are never trusted locally — so sign-out and account deletion
// take effect immediately rather than when the JWT expires.
//
// Failures throw ApiErrors (lib/api.ts): wrap /api/v1 handlers in withAuth(); a
// Server Component's throw renders app/error.tsx.

export type AuthedUser = {
    id: string
    /** The account's email (for re-authentication / display to its owner). Null for phone-only accounts. */
    email: string | null
}

type GetUserResult = { data: { user: User | null }; error: AuthError | null }

const toAuthedUser = (user: User): AuthedUser => ({ id: user.id, email: user.email ?? null })

// Supabase Auth unreachable (network error / 5xx) — as opposed to it rejecting
// the credentials (4xx, e.g. 403 bad_jwt), which is the caller's problem.
function isOutage(error: AuthError) {
    return isAuthRetryableFetchError(error) || (isAuthApiError(error) && error.status >= 500)
}

/** `undefined`: no Bearer header. `''`: "Bearer" with no token. Otherwise the token. */
async function bearerToken(): Promise<string | undefined> {
    const match = (await headers()).get('authorization')?.match(/^Bearer(?:\s+(.*))?$/i)
    return match ? (match[1] ?? '').trim() : undefined
}

async function userFromBearer(token: string): Promise<AuthedUser> {
    // A presented credential must be valid: a bad token is an error, never
    // "signed out", and never falls back to a cookie (fail closed).
    if (!token) throw new UnauthenticatedError('invalid_token')
    const { data, error }: GetUserResult = await createStatelessClient().auth.getUser(token)
    if (error && isOutage(error)) throw new AuthUnavailableError()
    if (error || !data.user) throw new UnauthenticatedError('invalid_token')
    return toAuthedUser(data.user)
}

async function userFromCookies(): Promise<AuthedUser | null> {
    const supabase = await createClient()
    const { data, error }: GetUserResult = await supabase.auth.getUser()
    if (error && isOutage(error)) throw new AuthUnavailableError()
    return data.user ? toAuthedUser(data.user) : null   // no/expired cookie → signed out
}

/** The caller, or `null` when signed out. A *bad* bearer token still throws 401
 *  (so the app refreshes instead of silently seeing the signed-out view); an Auth
 *  outage throws 503. The website uses this: a missing Bearer header falls
 *  through to the session cookie. */
export async function getOptionalUser(): Promise<AuthedUser | null> {
    const token = await bearerToken()
    return token === undefined ? userFromCookies() : userFromBearer(token)
}

/** `/api/v1` only. Null when the request has no Bearer token. Never reads the
 *  session cookie, so a cross-origin call cannot pick up the website session.
 *  A bad bearer token still throws 401; an Auth outage still throws 503. */
export async function getBearerUser(): Promise<AuthedUser | null> {
    const token = await bearerToken()
    if (token === undefined) return null
    return userFromBearer(token)
}

/** `/api/v1` writes. 401 `unauthenticated` when no Bearer token was sent.
 *  Never reads the session cookie. A bad token is 401 `invalid_token`.
 *  A valid user then spends one write-budget token (lib/rate-limit.ts),
 *  including GET /api/v1/me/library/[gameId], which uses this helper. */
export async function requireBearerUser(): Promise<AuthedUser> {
    const user = await getBearerUser()
    if (!user) throw new UnauthenticatedError()
    await consumeWriteRateLimit(user.id)
    return user
}

/** The caller, or throws UnauthenticatedError (401) / AuthUnavailableError (503). */
export async function requireUser(): Promise<AuthedUser> {
    const user = await getOptionalUser()
    if (!user) throw new UnauthenticatedError()
    return user
}
