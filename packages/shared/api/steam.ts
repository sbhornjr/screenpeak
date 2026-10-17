import type { SteamImportBatch, SteamImportCursor } from '../types/steam'

/** Custom scheme registered in apps/mobile/app.json. The callback never takes this from the query string. */
export const MOBILE_STEAM_RETURN_URL = 'screenpeak://steamlink'

export function mobileSteamResultUrl(ok: boolean): string {
    return `${MOBILE_STEAM_RETURN_URL}?ok=${ok ? '1' : '0'}`
}

/** POST /api/v1/me/steam/link-intent. `path` is relative to the API origin. */
export type SteamLinkIntent = {
    state: string
    expiresAt: string
    path: string
}

/** POST /api/v1/me/steam/import. The server loads owned apps; the body is only the resume cursor. */
export type SteamImportBatchRequest = {
    retry?: boolean
    cursor?: SteamImportCursor | null
}

export type { SteamImportBatch }
