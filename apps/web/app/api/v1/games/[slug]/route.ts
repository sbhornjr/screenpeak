import type { NextRequest } from 'next/server'
import type { GamePageData } from '@screenpeak/shared/api/games'
import { ApiError, withAuth } from '@/lib/api'
import { getOptionalUser } from '@/lib/auth'
import { loadGamePage } from '@/lib/loaders/game-page'

// The game page for the phone app: the same loader app/games/[slug]/page.tsx
// renders from, as JSON. Works signed out (viewer: null). Image fields are
// display-ready. Reviews are paged separately (GET /api/v1/games/[slug]/reviews).
export const GET = withAuth(async (_req: NextRequest, ctx: RouteContext<'/api/v1/games/[slug]'>) => {
    const { slug } = await ctx.params
    const user = await getOptionalUser()

    const data = await loadGamePage(slug, user?.id ?? null)
    if (!data) throw new ApiError(404, 'not_found', 'No game with that slug.')

    // Includes the viewer's own lists / library entry: never let a shared cache
    // (CDN, proxy) store it and serve it to someone else.
    return Response.json(data satisfies GamePageData, { headers: { 'Cache-Control': 'private, no-store' } })
})
