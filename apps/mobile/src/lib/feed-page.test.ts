import type { FeedPageData } from '@screenpeak/shared/api/feed'
import type { FeedItem } from '@screenpeak/shared/types'
import { describe, expect, it } from 'vitest'

import { feedItems, nextFeedOffset } from './feed-page'

function rating(game: string, actor = 'ada'): FeedItem {
  return {
    activity_type: 'rating',
    created_at: '2026-10-01 12:00:00+00',
    actor_id: `${actor}-id`,
    actor_username: actor,
    actor_avatar_url: null,
    game_id: `${game}-id`,
    game_name: game,
    game_slug: game,
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
    rating: 8,
    review: null,
    review_created_at: null,
    review_updated_at: null,
    library_status: null,
    library_game_count: null,
    library_cover_urls: null,
    library_game_names: null,
  }
}

function page(...games: string[]): FeedPageData {
  return { items: games.map(game => rating(game)), viewer: { id: 'viewer' } }
}

const FULL = Array.from({ length: 12 }, (_, i) => `game-${i}`)

describe('nextFeedOffset', () => {
  it('asks for the next page after every row loaded so far', () => {
    const first = page(...FULL)
    expect(nextFeedOffset(first, [first])).toBe(12)
    const second = page(...FULL.map(game => `${game}-b`))
    expect(nextFeedOffset(second, [first, second])).toBe(24)
  })

  it('stops after a short page', () => {
    const first = page(...FULL)
    const last = page('one', 'two')
    expect(nextFeedOffset(last, [first, last])).toBeUndefined()
    expect(nextFeedOffset(page(), [page()])).toBeUndefined()
  })
})

describe('feedItems', () => {
  it('joins the pages in order', () => {
    expect(feedItems([page('a', 'b'), page('c')]).map(item => item.game_name)).toEqual(['a', 'b', 'c'])
  })

  it('shows a row once when new activity pushed it onto the next page too', () => {
    const items = feedItems([page('new', 'a'), page('a', 'b')])
    expect(items.map(item => item.game_name)).toEqual(['new', 'a', 'b'])
  })

  it('keeps the same game rated by two players', () => {
    const both = { items: [rating('hades', 'ada'), rating('hades', 'bobby')], viewer: { id: 'viewer' } }
    expect(feedItems([both])).toHaveLength(2)
  })
})
