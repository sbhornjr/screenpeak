'use server'

import { requireUser } from '@/lib/auth'
import { saveRatingReview } from '@/lib/queries/review'

export async function submitRatingReview(gameId: string, rating: number | string, review: string, isUpdate: boolean) {
    const user = await requireUser()
    return saveRatingReview(user.id, gameId, rating, review, isUpdate)
}
