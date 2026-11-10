import type { NextRequest } from 'next/server'
import type { LoadoutPageData } from '@screenpeak/shared/api/loadout'
import { ApiError, withAuth } from '@/lib/api'
import { getBearerUser } from '@/lib/auth'
import { loadLoadoutPage } from '@/lib/loaders/loadout-page'

const PRIVATE = { headers: { 'Cache-Control': 'private, no-store' } }

// A loadout. Missing player and a private loadout are the same 404.
export const GET = withAuth(async (_req: NextRequest, ctx: RouteContext<'/api/v1/user/[username]/loadout'>) => {
    const { username } = await ctx.params
    const user = await getBearerUser()
    const data = await loadLoadoutPage(username, user?.id ?? null)
    if (!data) throw new ApiError(404, 'not_found', 'Not found.')
    return Response.json(data satisfies LoadoutPageData, PRIVATE)
})
