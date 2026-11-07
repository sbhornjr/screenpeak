import { describe, expect, it } from 'vitest'

import { FEED_EMPTY, feedActivityPhrase, timeAgo } from '@screenpeak/shared/feed-copy'
import type { FeedItem } from '@screenpeak/shared/types'

function item(overrides: Partial<FeedItem>): FeedItem {
    return {
        activity_type: 'rating',
        created_at: '2026-10-01 12:00:00+00',
        actor_id: 'actor-1',
        actor_username: 'ada',
        actor_avatar_url: null,
        game_id: 'game-1',
        game_name: 'Hades',
        game_slug: 'hades',
        game_cover_image_url: null,
        game_released: null,
        game_developer: null,
        game_avg_rating: null,
        viewer_game_rating: null,
        list_cover_urls: null,
        list_id: null,
        list_name: null,
        list_description: null,
        list_owner_username: null,
        list_game_count: null,
        list_last_activity: null,
        list_like_count: null,
        viewer_liked_list: null,
        rating: 9,
        review: null,
        review_created_at: null,
        review_updated_at: null,
        library_status: null,
        library_game_count: null,
        library_cover_urls: null,
        library_game_names: null,
        ...overrides,
    }
}

describe('feed copy', () => {
    it('says what the player did, without their name', () => {
        expect(feedActivityPhrase(item({}))).toBe('rated Hades a 9/10')
        expect(feedActivityPhrase(item({ activity_type: 'review' }))).toBe('reviewed Hades')
        expect(feedActivityPhrase(item({ activity_type: 'library_add', library_status: 'playing' }))).toBe('added Hades to their currently playing list')
        expect(feedActivityPhrase(item({ activity_type: 'library_add', library_status: 'completed' }))).toBe('added Hades to their completed list')
        expect(feedActivityPhrase(item({ activity_type: 'library_add', library_status: 'abandoned' }))).toBe('added Hades to their abandoned list')
        expect(feedActivityPhrase(item({ activity_type: 'library_add', library_status: 'backlog' }))).toBe('added Hades to their backlog')
        expect(feedActivityPhrase(item({ activity_type: 'library_add_batch', library_game_count: 14 }))).toBe('added 14 games to their library')
        expect(feedActivityPhrase(item({ activity_type: 'list_created', list_name: 'Underworld' }))).toBe('created the list "Underworld"')
        expect(feedActivityPhrase(item({ activity_type: 'list_liked', list_name: 'Underworld', list_owner_username: 'bobby' }))).toBe('liked "Underworld" by bobby')
    })

    it('says nothing for an activity type it does not know', () => {
        expect(feedActivityPhrase(item({ activity_type: 'something_new' }))).toBe('')
    })

    it('counts up from seconds to days, then shows the date', () => {
        const now = Date.parse('2026-10-08T12:00:00Z')
        expect(timeAgo('2026-10-08 11:59:30+00', now)).toBe('just now')
        expect(timeAgo('2026-10-08 11:55:00+00', now)).toBe('5m ago')
        expect(timeAgo('2026-10-08 09:00:00+00', now)).toBe('3h ago')
        expect(timeAgo('2026-10-06 12:00:00+00', now)).toBe('2d ago')
        expect(timeAgo('2026-10-01 12:00:00+00', now)).toBe('Oct 1')
    })

    it('reads ISO timestamps as well as Postgres ones', () => {
        expect(timeAgo('2026-10-08T09:00:00.000Z', Date.parse('2026-10-08T12:00:00Z'))).toBe('3h ago')
    })

    it('invites the player to follow people when the feed is empty', () => {
        expect(FEED_EMPTY).toEqual({
            title: 'Your feed is quiet',
            description: 'Follow other players and their ratings, reviews, and lists will show up here.',
            actionLabel: 'Find people to follow',
        })
    })
})
