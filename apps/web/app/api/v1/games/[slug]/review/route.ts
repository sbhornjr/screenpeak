import type { NextRequest } from 'next/server'
import type { RatingWriteResult } from '@screenpeak/shared/api/writes'
import { ratingReviewSchema } from '@screenpeak/shared/schemas'
import { withAuth } from '@/lib/api'
import { requireBearerUser } from '@/lib/auth'
import { consumeWriteRateLimit } from '@/lib/rate-limit'
import { getUserRatingReviewForGame, saveRatingReview } from '@/lib/queries/review'
import { parseDbTimestamp } from '@screenpeak/shared/dates'
import { assertWriteOk, jsonPrivate, parseBody, readJson, uuidParam } from '@/lib/write-http'

function isoTimestamp(value: string | null | undefined): string | null {
    if (!value) return null
    return parseDbTimestamp(value).toISOString()
}

// The path segment is the game uuid. The folder is named [slug] because GET
// /api/v1/games/[slug] already owns that dynamic segment.
export const PUT = withAuth(async (req: NextRequest, ctx: RouteContext<'/api/v1/games/[slug]/review'>) => {
    const user = await requireBearerUser()
    await consumeWriteRateLimit(user.id)
    const { slug } = await ctx.params
    const gameId = uuidParam(slug, 'gameId')
    const body = parseBody(ratingReviewSchema, await readJson(req))

    const existing = await getUserRatingReviewForGame(gameId, user.id)
    const result = await saveRatingReview(user.id, gameId, body.rating, body.review, existing != null)
    assertWriteOk(result.error)
    if (!result.data) throw new Error('rating write returned no row')

    const data: RatingWriteResult = {
        rating: result.data.rating,
        review: result.data.review,
        user_id: result.data.user_id,
        created_at: isoTimestamp(result.data.created_at),
        updated_at: isoTimestamp(result.data.updated_at),
    }
    return jsonPrivate(data, existing ? 200 : 201)
})
