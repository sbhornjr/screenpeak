import type { NextRequest } from 'next/server'
import type { LibraryPageData } from '@screenpeak/shared/api/library'
import { ApiError, withAuth } from '@/lib/api'
import { getBearerUser } from '@/lib/auth'
import { loadUserLibrary } from '@/lib/loaders/library-page'
import { parseLibraryQuery } from '@/lib/screen-query'

const PRIVATE = { headers: { 'Cache-Control': 'private, no-store' } }

// A library. Missing player and a private library are the same 404.
export const GET = withAuth(async (req: NextRequest, ctx: RouteContext<'/api/v1/user/[username]/library'>) => {
    const { username } = await ctx.params
    const user = await getBearerUser()
    const parsed = parseLibraryQuery(req.nextUrl.searchParams)
    if (!parsed.ok) throw new ApiError(400, 'invalid_request', parsed.message)

    const data = await loadUserLibrary(username, user?.id ?? null, parsed.query)
    if (!data) throw new ApiError(404, 'not_found', 'Not found.')
    return Response.json(data satisfies LibraryPageData, PRIVATE)
})
