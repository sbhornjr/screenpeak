import type { HomeLandingData } from '@screenpeak/shared/api/home'
import { withAuth } from '@/lib/api'
import { loadHomeLanding } from '@/lib/loaders/home'

const PRIVATE = { headers: { 'Cache-Control': 'private, no-store' } }

// The signed-out landing page. No viewer block, no session.
export const GET = withAuth(async () => {
    const data = await loadHomeLanding()
    return Response.json(data satisfies HomeLandingData, PRIVATE)
})
