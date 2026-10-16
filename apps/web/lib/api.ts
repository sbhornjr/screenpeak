import { NextResponse, type NextRequest } from 'next/server'
import type { ApiErrorBody, ApiErrorCode } from '@screenpeak/shared/api/errors'
import { logger } from '@/lib/logger'

// Shared plumbing for the /api/v1 route handlers: the standard error body
// (`{ error: { code, message } }`, typed in packages/shared/api/errors.ts so the
// phone app shares it) and withAuth(), which renders thrown ApiErrors so each
// route doesn't repeat try/catch.

/** An error that should reach the client as-is: its status, code and message are public. */
export class ApiError extends Error {
    constructor(
        readonly status: number,
        readonly code: ApiErrorCode,
        message: string,
        readonly headers: Record<string, string> = {},
    ) {
        super(message)
        this.name = 'ApiError'
    }
}

/**
 * 401. `unauthenticated`: no credentials at all. `invalid_token`: a bearer token
 * was sent but Supabase rejected it (malformed, expired, revoked, deleted user) —
 * the WWW-Authenticate challenge (RFC 6750) tells clients to refresh and retry.
 */
export class UnauthenticatedError extends ApiError {
    constructor(code: 'unauthenticated' | 'invalid_token' = 'unauthenticated') {
        const invalid = code === 'invalid_token'
        super(
            401,
            code,
            invalid ? 'Your session is invalid or has expired.' : 'Sign in required.',
            { 'WWW-Authenticate': invalid ? 'Bearer error="invalid_token"' : 'Bearer' },
        )
        this.name = 'UnauthenticatedError'
    }
}

/** 503: Supabase Auth was unreachable, so the caller couldn't be verified. Never a 401 —
 *  that would make the app sign the user out over a server-side outage. */
export class AuthUnavailableError extends ApiError {
    constructor() {
        super(503, 'auth_unavailable', 'Could not verify your session right now. Please try again.', { 'Retry-After': '5' })
        this.name = 'AuthUnavailableError'
    }
}

export function apiError(status: number, code: ApiErrorCode, message: string, headers?: Record<string, string>) {
    return NextResponse.json<ApiErrorBody>({ error: { code, message } }, { status, headers })
}

// Expo web is a browser on another origin (Metro, usually :8081) calling this
// API. Native fetch ignores CORS; a browser will not read the body without
// these headers. `*` is safe here because credentialed cookies are not allowed
// — the phone sends a bearer token, and Allow-Credentials stays unset.
const CORS_HEADERS: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
}

export function applyCors(res: Response): Response {
    for (const [key, value] of Object.entries(CORS_HEADERS)) res.headers.set(key, value)
    return res
}

/** Preflight for Expo web. Answered from proxy.ts so each route doesn't export OPTIONS. */
export function corsPreflight(): NextResponse {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

/**
 * Wraps a route handler so a thrown ApiError (e.g. from requireUser)
 * becomes its JSON error response. Anything else is a bug: it's logged with
 * detail and answered with a generic 500, so internals never reach the client.
 *
 *     export const GET = withAuth(async (req, ctx: RouteContext<'/api/v1/games/[slug]'>) => { … })
 */
export function withAuth<Ctx>(handler: (req: NextRequest, ctx: Ctx) => Promise<Response>) {
    return async (req: NextRequest, ctx: Ctx): Promise<Response> => {
        try {
            return applyCors(await handler(req, ctx))
        } catch (err) {
            if (err instanceof ApiError) return applyCors(apiError(err.status, err.code, err.message, err.headers))

            logger.error('api', `Unhandled error in ${req.method} ${req.nextUrl.pathname}`, {
                error: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : String(err),
            })
            return applyCors(apiError(500, 'internal', 'Something went wrong.'))
        }
    }
}
