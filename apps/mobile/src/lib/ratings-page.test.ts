import type { UserReviewItem, UserReviewsPage } from '@screenpeak/shared/api/user-reviews'
import { describe, expect, it } from 'vitest'

import { nextNumberedPage } from './paging'
import { ratingsCountLine, ratingsItems } from './ratings-page'

function item(game_id: string, review = ''): UserReviewItem {
  return {
    game_id,
    game_name: game_id,
    game_slug: game_id,
    cover_image_url: null,
    released: null,
    developer: null,
    rating: 8,
    review,
    updated_at: '2026-10-01 12:00:00+00',
  }
}

function page(ids: string[], totalPages: number): UserReviewsPage {
  return {
    username: 'ada',
    counts: { total_count: 3, review_count: 1, rating_count: 2 },
    total: ids.length,
    total_pages: totalPages,
    items: ids.map(id => item(id)),
  }
}

describe('nextNumberedPage', () => {
  it('asks for the page after the ones loaded until the last page', () => {
    const first = page(['a'], 2)
    expect(nextNumberedPage(first, [first])).toBe(2)
    expect(nextNumberedPage(first, [first, page(['b'], 2)])).toBeUndefined()
    const empty = page([], 0)
    expect(nextNumberedPage(empty, [empty])).toBeUndefined()
  })
})

describe('ratingsItems', () => {
  it('joins pages and shows a game that moved to the next page once', () => {
    expect(ratingsItems([page(['a', 'b'], 2), page(['b', 'c'], 2)]).map(row => row.game_id)).toEqual(['a', 'b', 'c'])
  })
})

describe('ratingsCountLine', () => {
  it('counts ratings, written reviews, and the total the way the website does', () => {
    expect(ratingsCountLine({ total_count: 11, review_count: 3, rating_count: 8 })).toBe('8 ratings / 3 reviews / 11 total')
    expect(ratingsCountLine({ total_count: 1, review_count: 1, rating_count: 0 })).toBe('0 ratings / 1 review / 1 total')
  })
})
