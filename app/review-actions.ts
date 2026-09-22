'use server'

import { requireUser } from '@/lib/auth'
import { createRatingReview, updateRatingReview } from '@/lib/queries/review'

export async function submitRatingReview(gameId: string, rating: number | string, review: string, isUpdate: boolean) {
    const user = await requireUser()
    return isUpdate
        ? updateRatingReview({ userId: user.id, gameId, rating, review })
        : createRatingReview({ userId: user.id, gameId, rating, review })
}
