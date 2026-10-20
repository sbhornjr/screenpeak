import type { LibraryPageData } from '@screenpeak/shared/api/library'
import type { ProfilePageData } from '@screenpeak/shared/api/profile'
import { describe, expect, it } from 'vitest'

import { LIBRARY_QUERY, applyLibraryWrite, libraryGate, orderForSort, withoutLibraryGame } from './library-page'

const HADES_ID = '11111111-1111-4111-8111-111111111111'

const PAGE: LibraryPageData = {
  username: 'peek',
  facets: { genres: [], platforms: [], developers: [], publishers: [], esrb_ratings: [] },
  games: [{
    id: HADES_ID,
    name: 'Hades',
    slug: 'hades',
    cover_image_url: null,
    released: '2020-09-17',
    developer: 'Supergiant Games',
    avg_rating: 9,
    user_rating: 8,
    library_status: 'playing',
    completed_all_achievements: true,
    hours_played: 12.5,
    play_count: 4,
  }],
}

function profile(input: { owner: boolean, libraryPublic: boolean, viewer: boolean }): ProfilePageData {
  return {
    profile: {
      id: '33333333-3333-4333-8333-333333333333',
      username: 'ada',
      display_name: 'Ada Lovelace',
      avatar_url: null,
      created_at: '2026-01-01 00:00:00+00',
      selected_title: null,
      user_bio: null,
      profile_loadout_bio: null,
      library_public: input.libraryPublic,
      loadout_public: false,
      follower_count: 0,
      following_count: 0,
    },
    library_stats: input.owner || input.libraryPublic ? { total_games: 1, completed: 0 } : null,
    favorites: [],
    recent_reviews: [],
    rating_count: 0,
    avg_rating: null,
    viewer: input.viewer ? { is_owner: input.owner, is_following: false, top_developer_names: [] } : null,
  }
}

describe('library writes on the cached page', () => {
  it('keeps hours, plays, and the 100% flag on a status-only save, and drops a card that leaves the active status', () => {
    const filtered = applyLibraryWrite(PAGE, HADES_ID, { status: 'completed' }, { ...LIBRARY_QUERY, status: 'playing' })
    expect(filtered.games).toEqual([])

    const staying = applyLibraryWrite(PAGE, HADES_ID, { status: 'completed' }, LIBRARY_QUERY)
    expect(staying.games).toEqual([{
      id: HADES_ID,
      name: 'Hades',
      slug: 'hades',
      cover_image_url: null,
      released: '2020-09-17',
      developer: 'Supergiant Games',
      avg_rating: 9,
      user_rating: 8,
      library_status: 'completed',
      completed_all_achievements: true,
      hours_played: 12.5,
      play_count: 4,
    }])
  })

  it('drops a card when the 100% filter is on and the flag is cleared, and removes a deleted game', () => {
    const cleared = applyLibraryWrite(
      PAGE,
      HADES_ID,
      { status: 'playing', completed_all_achievements: false },
      { ...LIBRARY_QUERY, is100: true },
    )
    expect(cleared.games).toEqual([])

    const removed = withoutLibraryGame(PAGE, HADES_ID)
    expect(removed.games).toEqual([])
    expect(withoutLibraryGame(PAGE, '22222222-2222-4222-8222-222222222222').games).toEqual(PAGE.games)
  })
})

describe('who can see a library', () => {
  it('opens a public library and the owner, and keeps a private library closed for everyone else', () => {
    expect(libraryGate(profile({ owner: false, libraryPublic: false, viewer: true }))).toBe('private')
    expect(libraryGate(profile({ owner: false, libraryPublic: false, viewer: false }))).toBe('private')
    expect(libraryGate(profile({ owner: true, libraryPublic: false, viewer: true }))).toBe('open')
    expect(libraryGate(profile({ owner: false, libraryPublic: true, viewer: false }))).toBe('open')
    expect(libraryGate(null)).toBe('missing')
  })
})

describe('library sort direction', () => {
  it('starts a name sort ascending and every other sort descending', () => {
    expect(orderForSort('name')).toBe('asc')
    expect(orderForSort('date_added')).toBe('desc')
    expect(orderForSort('ngplus_rating')).toBe('desc')
    expect(orderForSort('your_rating')).toBe('desc')
  })
})
