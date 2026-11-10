import type { ApiErrorCode } from '@screenpeak/shared/api/errors'
import { STEAM_NOT_PUBLIC_MESSAGE } from '@screenpeak/shared/api/steam'
import { ApiError } from '@/lib/api'

/** Codes at the steam-import boundary. English copy lives only in the table below. */
export const STEAM_IMPORT_ERRORS = [
    'not_linked',
    'not_public',
    'invalid_request',
    'steam_unavailable',
    'matching_unavailable',
    'lease_not_installed',
] as const

export type SteamImportErrorCode = (typeof STEAM_IMPORT_ERRORS)[number]

export class SteamImportFailure extends Error {
    readonly code: SteamImportErrorCode
    constructor(code: SteamImportErrorCode) {
        super(code)
        this.name = 'SteamImportFailure'
        this.code = code
    }
}

type HttpRow = { status: number, apiCode: ApiErrorCode, message: string, retryAfter?: string }

/**
 * Public copy for every code. `lease_not_installed` stays a generic 500.
 * The migration hint is logged in steam-import.ts and must not appear here.
 */
export const STEAM_IMPORT_HTTP: Record<SteamImportErrorCode, HttpRow> = {
    not_linked: { status: 400, apiCode: 'invalid_request', message: 'Link Steam before importing.' },
    not_public: { status: 400, apiCode: 'invalid_request', message: STEAM_NOT_PUBLIC_MESSAGE },
    invalid_request: { status: 400, apiCode: 'invalid_request', message: 'Invalid import request.' },
    steam_unavailable: {
        status: 503,
        apiCode: 'unavailable',
        message: 'Steam is unavailable. Your matched games are still listed.',
        retryAfter: '5',
    },
    matching_unavailable: {
        status: 503,
        apiCode: 'unavailable',
        message: 'Matching is unavailable. Your matched games are still listed.',
        retryAfter: '5',
    },
    lease_not_installed: { status: 500, apiCode: 'internal', message: 'Something went wrong.' },
}

export function steamImportHttpError(code: SteamImportErrorCode): ApiError {
    const row = STEAM_IMPORT_HTTP[code]
    const headers: Record<string, string> = {}
    if (row.retryAfter) headers['Retry-After'] = row.retryAfter
    return new ApiError(row.status, row.apiCode, row.message, headers)
}

/** Website actions speak the same sentences. The lease hint is not one of them. */
export function steamImportClientMessage(code: SteamImportErrorCode): string {
    return STEAM_IMPORT_HTTP[code].message
}
