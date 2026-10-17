import type { MeData } from '@screenpeak/shared/api/me'
import { withAuth } from '@/lib/api'
import { getBearerUser } from '@/lib/auth'
import { loadMe } from '@/lib/loaders/me'

const PRIVATE = { headers: { 'Cache-Control': 'private, no-store' } }

// The caller's profile card. Signed out (no bearer token) returns user: null.
export const GET = withAuth(async () => {
    const user = await getBearerUser()
    const data = await loadMe(user?.id ?? null)
    return Response.json(data satisfies MeData, PRIVATE)
})
