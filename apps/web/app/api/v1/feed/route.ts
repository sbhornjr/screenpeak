import type { NextRequest } from 'next/server'
import type { FeedPageData } from '@screenpeak/shared/api/feed'
import { ApiError, withAuth } from '@/lib/api'
import { getBearerUser } from '@/lib/auth'
import { loadFeed } from '@/lib/loaders/feed'
import { parseFeedQuery } from '@/lib/screen-query'

const PRIVATE = { headers: { 'Cache-Control': 'private, no-store' } }

// The signed-in activity feed. Signed out, items is empty and viewer is null.
export const GET = withAuth(async (req: NextRequest) => {
    const user = await getBearerUser()
    const parsed = parseFeedQuery(req.nextUrl.searchParams)
    if (!parsed.ok) throw new ApiError(400, 'invalid_request', parsed.message)

    const data = await loadFeed(user?.id ?? null, parsed.query.offset)
    return Response.json(data satisfies FeedPageData, PRIVATE)
})
