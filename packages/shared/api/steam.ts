import type { SteamImportBatch, SteamImportCursor } from '../types/steam'

/** Custom scheme registered in apps/mobile/app.json. The callback never takes this from the query string. */
export const MOBILE_STEAM_RETURN_URL = 'screenpeak://steamlink'

export function mobileSteamResultUrl(ok: boolean): string {
    return `${MOBILE_STEAM_RETURN_URL}?ok=${ok ? '1' : '0'}`
}

/** One-time code the phone exchanges. The callback does not attach the Steam account. */
export function mobileSteamCodeUrl(code: string): string {
    return `${MOBILE_STEAM_RETURN_URL}?${new URLSearchParams({ code }).toString()}`
}

/**
 * The 400 message for a Steam profile whose game details are private. The phone
 * matches on it to show where Steam keeps that setting.
 */
export const STEAM_NOT_PUBLIC_MESSAGE = 'Steam library details are not public.'

/** POST /api/v1/me/steam/link-intent. `path` is relative to the API origin. */
export type SteamLinkIntent = {
    state: string
    expiresAt: string
    path: string
}

/** S256 PKCE challenge, sent when the intent is issued. The verifier stays on the phone. */
export type SteamLinkIntentRequest = {
    codeChallenge: string
}

/** POST /api/v1/me/steam/link-complete. Bearer user, code, and verifier must all match the intent. */
export type SteamLinkCompleteRequest = {
    code: string
    verifier: string
}

/** POST /api/v1/me/steam/import. The server loads owned apps; the body is only the resume cursor. */
export type SteamImportBatchRequest = {
    retry?: boolean
    cursor?: SteamImportCursor | null
}

export type { SteamImportBatch }
