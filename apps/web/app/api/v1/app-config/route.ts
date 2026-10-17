import { MIN_SUPPORTED_APP_VERSION, type AppConfig } from '@screenpeak/shared/api/app-config'
import { withAuth } from '@/lib/api'

// Read before sign-in, including with a stale bearer. Do not call getBearerUser:
// a bad token must not hide the upgrade response.
export const GET = withAuth(async () => {
    const data = { minSupportedVersion: MIN_SUPPORTED_APP_VERSION } satisfies AppConfig
    return Response.json(data, { headers: { 'Cache-Control': 'no-store' } })
})
