import { describe, it, expect } from 'vitest'
import { HERO_MIN_RATINGS, screenshotUrls, selectHeroGame, type HeroCandidate } from '@/lib/hero-game'

const game = (patch: Partial<HeroCandidate> & Pick<HeroCandidate, 'id' | 'rating_count'>): HeroCandidate => ({
    name: patch.id,
    slug: patch.id,
    cover_image_url: null,
    released: null,
    avg_ngplus_rating: 8,
    ...patch,
})

describe('selectHeroGame', () => {
    it('returns null when nobody has rated anything', () => {
        expect(selectHeroGame([])).toBeNull()
    })

    it(`ignores games below ${HERO_MIN_RATINGS} ratings`, () => {
        expect(selectHeroGame([
            game({ id: 'low', rating_count: 2, avg_ngplus_rating: 10 }),
            game({ id: 'none', rating_count: 0, avg_ngplus_rating: null }),
        ])).toBeNull()
    })

    it('picks the most ratings, then the higher average, then the smaller id', () => {
        const hero = selectHeroGame([
            game({ id: '00000000-0000-0000-0000-000000000002', rating_count: 5, avg_ngplus_rating: 9 }),
            game({ id: '00000000-0000-0000-0000-000000000001', rating_count: 5, avg_ngplus_rating: 9 }),
            game({ id: 'popular', rating_count: 5, avg_ngplus_rating: 7 }),
            game({ id: 'crowd', rating_count: 9, avg_ngplus_rating: 6 }),
            game({ id: 'thin', rating_count: 3, avg_ngplus_rating: 10 }),
        ])

        expect(hero?.id).toBe('crowd')
    })

    it('breaks a rating-count tie with the community average, then the id', () => {
        const tied = selectHeroGame([
            game({ id: '00000000-0000-0000-0000-00000000000b', rating_count: 4, avg_ngplus_rating: '8.00' }),
            game({ id: '00000000-0000-0000-0000-00000000000a', rating_count: 4, avg_ngplus_rating: 8 }),
            game({ id: 'higher', rating_count: 4, avg_ngplus_rating: 8.5 }),
        ])
        expect(tied?.id).toBe('higher')

        const ids = selectHeroGame([
            game({ id: '00000000-0000-0000-0000-00000000000b', rating_count: 4, avg_ngplus_rating: 8 }),
            game({ id: '00000000-0000-0000-0000-00000000000a', rating_count: 4, avg_ngplus_rating: 8 }),
        ])
        expect(ids?.id).toBe('00000000-0000-0000-0000-00000000000a')
    })

    it('keeps screenshot urls from an array or a postgres array literal', () => {
        const shot = 'https://images.igdb.com/igdb/image/upload/t_screenshot_huge/sc.jpg'
        expect(screenshotUrls([shot, null, ''])).toEqual([shot])
        expect(screenshotUrls(`{${shot}}`)).toEqual([shot])
        expect(screenshotUrls(`{"${shot}","https://images.igdb.com/igdb/image/upload/t_1080p/art.jpg"}`)).toEqual([
            shot,
            'https://images.igdb.com/igdb/image/upload/t_1080p/art.jpg',
        ])
        expect(screenshotUrls({ not: 'an array' })).toBeNull()
        const hero = selectHeroGame([game({ id: 'shot', rating_count: 3, screenshots: `{${shot}}` })])
        expect(hero?.screenshots).toEqual([shot])
        expect(selectHeroGame([game({ id: 'odd', rating_count: 3, screenshots: { bad: true } })])?.screenshots).toBeNull()
    })

    it('does not treat a missing average as zero', () => {
        expect(selectHeroGame([
            game({ id: 'blank', rating_count: 4, avg_ngplus_rating: null }),
            game({ id: 'zero', rating_count: 4, avg_ngplus_rating: 0 }),
        ])).toBeNull()
    })
})
