import { describe, expect, it } from 'vitest'
import { toUserSearchHit, toListSearchHit } from '@/lib/search-shape'

const USER = '11111111-1111-4111-8111-111111111111'
const LIST = '22222222-2222-4222-8222-222222222222'

describe('toUserSearchHit', () => {
    it('coerces follower_count and passes avatar_url through unrewritten', () => {
        expect(toUserSearchHit({
            id: USER,
            username: 'peek',
            avatar_url: 'https://example.com/avatar.png',
            follower_count: 3,
        })).toEqual({
            id: USER,
            username: 'peek',
            avatar_url: 'https://example.com/avatar.png',
            follower_count: 3,
        })
    })

    it('defaults a null avatar_url and non-numeric follower_count', () => {
        expect(toUserSearchHit({
            id: USER,
            username: 'peek',
            avatar_url: null,
            follower_count: null as unknown as number,
        })).toEqual({
            id: USER,
            username: 'peek',
            avatar_url: null,
            follower_count: 0,
        })
    })
})

describe('toListSearchHit', () => {
    it('rewrites covers to display-ready small URLs and defaults a null description', () => {
        const hit = toListSearchHit({
            id: LIST,
            name: 'Horror',
            description: null,
            last_activity: '2026-01-01',
            game_count: 2,
            owner_username: 'peek',
            like_count: 1,
            viewer_has_liked: false,
            covers: [{
                cover_image_url: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1w2sa.jpg',
                slug: 'resident-evil',
            }],
        })

        expect(hit).toEqual({
            id: LIST,
            name: 'Horror',
            description: '',
            last_activity: '2026-01-01',
            game_count: 2,
            owner_username: 'peek',
            like_count: 1,
            viewer_has_liked: false,
            covers: [{
                cover_image_url: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1w2sa.jpg',
                slug: 'resident-evil',
            }],
        })
    })

    it('drops a non-IGDB cover URL to null rather than passing it through raw', () => {
        const hit = toListSearchHit({
            id: LIST,
            name: 'Horror',
            description: 'Scary games',
            last_activity: '2026-01-01',
            game_count: 1,
            owner_username: 'peek',
            like_count: 0,
            viewer_has_liked: true,
            covers: [{ cover_image_url: 'co123', slug: null }],
        })

        expect(hit.covers).toEqual([{ cover_image_url: null, slug: null }])
        expect(hit.description).toBe('Scary games')
    })
})
