// What a player's Ratings & Reviews page says when a Show choice matches
// nothing. The website and the phone both use it.
import type { UserReviewsQuery } from './api/user-reviews'

export function ratingsEmpty(filter: UserReviewsQuery['filter'], username: string): { title: string, description: string } {
    if (filter === 'reviews') return { title: 'No written reviews yet.', description: 'Ratings with a note show up here.' }
    if (filter === 'ratings') return { title: 'No score-only ratings.', description: 'Ratings without a note show up here.' }
    return { title: 'No ratings yet.', description: `Games ${username} rates show up here.` }
}
