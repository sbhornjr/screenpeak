import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError } from '@supabase/supabase-js'

// The system boundaries are mocked: the incoming request's headers (Next's
// `headers()`, which works in Server Components, Server Actions and Route
// Handlers alike), the stateless client that verifies a bearer token, and the
// cookie client. The error classes are the real ones, with the shapes Supabase
// Auth actually returns (403 bad_jwt for any bad token; AuthRetryableFetchError
// status 0 when Auth is unreachable).
let requestHeaders = new Headers()
const bearerGetUser = vi.fn()
const cookieGetUser = vi.fn()
vi.mock('next/headers', () => ({ headers: async () => requestHeaders }))
vi.mock('@/lib/supabase-stateless', () => ({
    createStatelessClient: () => ({ auth: { getUser: bearerGetUser } }),
}))
vi.mock('@/lib/supabase-server', () => ({
    createClient: async () => ({ auth: { getUser: cookieGetUser } }),
}))

const { requireUser, getOptionalUser, getBearerUser, requireBearerUser } = await import('@/lib/auth')
const { ApiError, UnauthenticatedError, AuthUnavailableError } = await import('@/lib/api')

const USER = { id: 'user-123', email: 'player@screenpeak.test' }
const ok = (user: object | null) => ({ data: { user }, error: null })
const fail = (error: Error) => ({ data: { user: null }, error })
const expired = () => new AuthApiError('invalid JWT: unable to parse or verify signature, token has invalid claims: token is expired', 403, 'bad_jwt')
const noSession = () => new AuthSessionMissingError()
const outage = () => new AuthRetryableFetchError('fetch failed', 0)

/** Simulates the incoming request carrying these headers. */
const withHeaders = (h: Record<string, string>) => { requestHeaders = new Headers(h) }

beforeEach(() => {
    requestHeaders = new Headers()      // default: a browser request, no Authorization header
    bearerGetUser.mockReset()
    cookieGetUser.mockReset()
    cookieGetUser.mockResolvedValue(fail(noSession()))   // default: no cookie session
})

// Asserts `promise` rejects with an ApiError carrying this status + code.
async function rejectsWith(promise: Promise<unknown>, status: number, code: string) {
    const err = await promise.then(() => null, e => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({ status, code })
}

describe('bearer token (the phone app)', () => {
    it('returns the user for a valid token, verified by the Auth server', async () => {
        withHeaders({ authorization: 'Bearer good.jwt.token' })
        bearerGetUser.mockResolvedValue(ok(USER))

        await expect(requireUser()).resolves.toEqual({ id: 'user-123', email: 'player@screenpeak.test' })
        expect(bearerGetUser).toHaveBeenCalledWith('good.jwt.token')
        expect(cookieGetUser).not.toHaveBeenCalled()
    })

    it('accepts the scheme case-insensitively and trims the token', async () => {
        withHeaders({ authorization: 'bearer   good.jwt.token ' })
        bearerGetUser.mockResolvedValue(ok(USER))

        await requireUser()
        expect(bearerGetUser).toHaveBeenCalledWith('good.jwt.token')
    })

    it('rejects an expired token with 401 invalid_token', async () => {
        withHeaders({ authorization: 'Bearer expired.jwt' })
        bearerGetUser.mockResolvedValue(fail(expired()))

        await rejectsWith(requireUser(), 401, 'invalid_token')
    })

    it('fails closed: an invalid token does NOT fall back to a valid cookie session', async () => {
        withHeaders({ authorization: 'Bearer expired.jwt' })
        bearerGetUser.mockResolvedValue(fail(expired()))
        cookieGetUser.mockResolvedValue(ok(USER))

        await rejectsWith(requireUser(), 401, 'invalid_token')
        expect(cookieGetUser).not.toHaveBeenCalled()
    })

    it('rejects "Bearer" with no token as invalid_token without calling Auth', async () => {
        withHeaders({ authorization: 'Bearer ' })

        await rejectsWith(requireUser(), 401, 'invalid_token')
        expect(bearerGetUser).not.toHaveBeenCalled()
    })

    it('treats a token for a deleted/unknown user (no error, no user) as invalid_token', async () => {
        withHeaders({ authorization: 'Bearer orphan.jwt' })
        bearerGetUser.mockResolvedValue(ok(null))

        await rejectsWith(requireUser(), 401, 'invalid_token')
    })

    it('answers an Auth outage with 503 auth_unavailable, never a 401 that would log the user out', async () => {
        withHeaders({ authorization: 'Bearer good.jwt.token' })
        bearerGetUser.mockResolvedValue(fail(outage()))

        await rejectsWith(requireUser(), 503, 'auth_unavailable')
    })
})

describe('no bearer token (the website: session cookie)', () => {
    it('uses the cookie session when there is no Authorization header', async () => {
        cookieGetUser.mockResolvedValue(ok(USER))

        await expect(requireUser()).resolves.toEqual({ id: 'user-123', email: 'player@screenpeak.test' })
        expect(bearerGetUser).not.toHaveBeenCalled()
    })

    it('uses cookies for a non-Bearer Authorization scheme', async () => {
        withHeaders({ authorization: 'Basic dXNlcjpwYXNz' })
        cookieGetUser.mockResolvedValue(ok(USER))

        await expect(requireUser()).resolves.toMatchObject({ id: 'user-123' })
        expect(bearerGetUser).not.toHaveBeenCalled()
    })

    it('returns email null when the account has none', async () => {
        cookieGetUser.mockResolvedValue(ok({ id: 'user-123' }))

        await expect(getOptionalUser()).resolves.toEqual({ id: 'user-123', email: null })
    })

    it('answers an Auth outage with 503 too', async () => {
        cookieGetUser.mockResolvedValue(fail(outage()))

        await rejectsWith(getOptionalUser(), 503, 'auth_unavailable')
    })
})

describe('getOptionalUser — signed-out callers', () => {
    it('returns null with no token and no cookie session', async () => {
        await expect(getOptionalUser()).resolves.toBeNull()
    })

    it('still rejects a bad token — presenting a bad credential is an error, not "signed out"', async () => {
        withHeaders({ authorization: 'Bearer expired.jwt' })
        bearerGetUser.mockResolvedValue(fail(expired()))

        await rejectsWith(getOptionalUser(), 401, 'invalid_token')
    })
})

describe('getBearerUser — /api/v1 ignores the website cookie', () => {
    it('returns null when there is no Bearer token, even if a cookie session would succeed', async () => {
        cookieGetUser.mockResolvedValue(ok(USER))

        await expect(getBearerUser()).resolves.toBeNull()
        expect(cookieGetUser).not.toHaveBeenCalled()
        expect(bearerGetUser).not.toHaveBeenCalled()
    })

    it('returns the user for a valid bearer token and still does not read cookies', async () => {
        withHeaders({ authorization: 'Bearer good.jwt.token' })
        bearerGetUser.mockResolvedValue(ok(USER))
        cookieGetUser.mockResolvedValue(ok({ id: 'cookie-user', email: 'other@screenpeak.test' }))

        await expect(getBearerUser()).resolves.toEqual({ id: 'user-123', email: 'player@screenpeak.test' })
        expect(bearerGetUser).toHaveBeenCalledWith('good.jwt.token')
        expect(cookieGetUser).not.toHaveBeenCalled()
    })
})

describe('requireBearerUser — /api/v1 writes', () => {
    it('rejects with 401 unauthenticated when no Bearer token is sent, and does not read a cookie', async () => {
        cookieGetUser.mockResolvedValue(ok(USER))

        await rejectsWith(requireBearerUser(), 401, 'unauthenticated')
        expect(cookieGetUser).not.toHaveBeenCalled()
        expect(bearerGetUser).not.toHaveBeenCalled()
    })

    it('returns the bearer user and still does not read cookies', async () => {
        withHeaders({ authorization: 'Bearer good.jwt.token' })
        bearerGetUser.mockResolvedValue(ok(USER))
        cookieGetUser.mockResolvedValue(ok({ id: 'cookie-user', email: 'other@screenpeak.test' }))

        await expect(requireBearerUser()).resolves.toEqual({ id: 'user-123', email: 'player@screenpeak.test' })
        expect(cookieGetUser).not.toHaveBeenCalled()
    })

    it('rejects an empty bearer token with 401 invalid_token', async () => {
        withHeaders({ authorization: 'Bearer' })

        await rejectsWith(requireBearerUser(), 401, 'invalid_token')
        expect(cookieGetUser).not.toHaveBeenCalled()
    })
})

describe('requireUser — signed-out callers', () => {
    it('rejects with 401 unauthenticated with no token and no cookie session', async () => {
        await rejectsWith(requireUser(), 401, 'unauthenticated')
    })

    it('throws an UnauthenticatedError that is still an Error (so `.catch(() => null)` callers work)', async () => {
        const err = await requireUser().then(() => null, e => e)

        expect(err).toBeInstanceOf(UnauthenticatedError)
        expect(err).toBeInstanceOf(Error)
    })

    it('throws AuthUnavailableError on an Auth outage', async () => {
        cookieGetUser.mockResolvedValue(fail(outage()))

        await expect(requireUser()).rejects.toBeInstanceOf(AuthUnavailableError)
    })
})
