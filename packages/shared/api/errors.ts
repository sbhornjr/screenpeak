// The error half of the /api/v1 contract. Every non-2xx /api/v1 response has
// this body, so the phone app can branch on `code` instead of parsing messages.
// `message` is human-readable and safe to show; it never carries internals.

export type ApiErrorCode =
    /** 401 — no bearer token and no session cookie */
    | 'unauthenticated'
    /** 401 — a bearer token was sent but is malformed, expired, revoked, or for a deleted user.
     *  The client should refresh its session once and retry, then sign out. */
    | 'invalid_token'
    /** 503 — Supabase Auth couldn't be reached to verify the caller. Retry; do NOT sign out. */
    | 'auth_unavailable'
    /** 400 — a query parameter or body field is missing or out of range; `message` says which */
    | 'invalid_request'
    /** 429 — the caller exceeded the write or search budget. Retry-After is seconds. */
    | 'rate_limited'
    /** 404 */
    | 'not_found'
    /** 500 — unexpected server error (details are in the server logs only) */
    | 'internal'

export type ApiErrorBody = {
    error: {
        code: ApiErrorCode
        message: string
    }
}
