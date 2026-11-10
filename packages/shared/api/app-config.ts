/** Lowest phone version that may keep calling /api/v1. Matches apps/mobile/app.json until a break forces a bump. */
export const MIN_SUPPORTED_APP_VERSION = '1.0.0'

export type AppConfig = {
    minSupportedVersion: string
}
