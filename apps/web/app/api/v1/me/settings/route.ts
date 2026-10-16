import type { SettingsData } from '@screenpeak/shared/api/me'
import { ApiError, UnauthenticatedError, withAuth } from '@/lib/api'
import { getBearerUser } from '@/lib/auth'
import { loadSettings } from '@/lib/loaders/me'

const PRIVATE = { headers: { 'Cache-Control': 'private, no-store' } }

// Account settings for the bearer caller. Never reads the website cookie.
export const GET = withAuth(async () => {
    const user = await getBearerUser()
    if (!user) throw new UnauthenticatedError()

    const data = await loadSettings(user)
    if (!data) throw new ApiError(404, 'not_found', 'Not found.')
    return Response.json(data satisfies SettingsData, PRIVATE)
})
