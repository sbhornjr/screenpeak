import type { LibraryPageData } from '@screenpeak/shared/api/library'
import { describe, expect, it } from 'vitest'

import { LIBRARY_QUERY, applyLibraryWrite, orderForSort, withoutLibraryGame } from './library-page'

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

describe('library sort direction', () => {
  it('starts a name sort ascending and every other sort descending', () => {
    expect(orderForSort('name')).toBe('asc')
    expect(orderForSort('date_added')).toBe('desc')
    expect(orderForSort('ngplus_rating')).toBe('desc')
    expect(orderForSort('your_rating')).toBe('desc')
  })
})
