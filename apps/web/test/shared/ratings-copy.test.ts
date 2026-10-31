import { describe, expect, it } from 'vitest'
import { ratingsEmpty } from '@screenpeak/shared/ratings-copy'

describe('ratingsEmpty', () => {
    it('says what is missing for each Show choice', () => {
        expect(ratingsEmpty('all', 'ada')).toEqual({ title: 'No ratings yet.', description: 'Games ada rates show up here.' })
        expect(ratingsEmpty('reviews', 'ada')).toEqual({ title: 'No written reviews yet.', description: 'Ratings with a note show up here.' })
        expect(ratingsEmpty('ratings', 'ada')).toEqual({ title: 'No score-only ratings.', description: 'Ratings without a note show up here.' })
    })
})
