import type { ExploreListCard, ExplorePageData } from '@screenpeak/shared/api/explore'
import { describe, expect, it } from 'vitest'

import {
  completedLine,
  followedByLine,
  likedByLine,
  libraryLine,
  withExploreListLike,
} from './explore-page'

function list(id: string, like_count: number, viewer_has_liked = false): ExploreListCard {
  return {
    id,
    name: id,
    description: '',
    owner_username: 'mina',
    last_activity: '2026-10-01 00:00:00+00',
    game_count: 3,
    like_count,
    viewer_has_liked,
    covers: [],
  }
}

const DATA: ExplorePageData = {
  range: 'week',
  trending_games: [],
  trending_lists: [list('shared', 2), list('other', 5)],
  recommendations: { games: [], lists: [{ ...list('shared', 2), follower_like_count: 1 }], users: [] },
  viewer: { id: 'viewer' },
}

describe('explore lines', () => {
  it('counts the people you follow who completed a game, with their average', () => {
    expect(completedLine(1, 9)).toBe('1 follower completed · 9/10 avg')
    expect(completedLine(3, 8.5)).toBe('3 followers completed · 8.5/10 avg')
    expect(completedLine(2, null)).toBe('2 followers completed')
  })

  it('says where a recommended game already is for you', () => {
    expect(libraryLine('backlog')).toBe('In your backlog')
    expect(libraryLine('wishlist')).toBe('On your wishlist')
    expect(libraryLine('none')).toBeNull()
    expect(libraryLine(null)).toBeNull()
  })

  it('counts the people you follow behind a list or a player', () => {
    expect(likedByLine(1)).toBe('1 user you follow liked this')
    expect(likedByLine(4)).toBe('4 users you follow liked this')
    expect(followedByLine(1)).toBe('Followed by 1 user you follow')
    expect(followedByLine(2)).toBe('Followed by 2 users you follow')
  })
})

describe('withExploreListLike', () => {
  it('likes the list wherever it shows and leaves the others', () => {
    const liked = withExploreListLike(DATA, 'shared', true)
    expect(liked.trending_lists.map(item => [item.id, item.like_count, item.viewer_has_liked])).toEqual([
      ['shared', 3, true],
      ['other', 5, false],
    ])
    expect(liked.recommendations?.lists[0]).toMatchObject({ like_count: 3, viewer_has_liked: true, follower_like_count: 1 })
  })

  it('works signed out, with no recommendations', () => {
    const page = { ...DATA, recommendations: null }
    expect(withExploreListLike(page, 'other', true).recommendations).toBeNull()
  })
})
