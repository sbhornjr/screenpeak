import type { GamePageData } from '@screenpeak/shared/api/games'
import { ratingLabel } from '@screenpeak/shared/rating-copy'
import { describe, expect, it } from 'vitest'

import {
  libraryWrite,
  relTime,
  scoreGap,
  withLibraryWrite,
  withViewerReview,
} from './game-page'

const ENTRY = {
  id: 'le',
  status: 'playing',
  completed_all_achievements: true,
  hours_played: 12.5,
  play_count: 4,
}

const PAGE: GamePageData = {
  game: {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Hades',
    slug: 'hades',
    igdb_id: 1,
    cover_image_url: null,
    artwork_image_url: null,
    released: null,
    description: null,
    esrb_rating: null,
    reddit_url: null,
    screenshots: [],
    created_at: null,
  },
  taxonomy: { genres: [], platforms: [], developers: [], publishers: [] },
  stats: {
    total_ratings: 4,
    total_reviews: 1,
    rating_1: 0, rating_2: 0, rating_3: 0, rating_4: 0, rating_5: 0,
    rating_6: 0, rating_7: 0, rating_8: 1, rating_9: 2, rating_10: 1,
    avg_rating: 9.2,
  },
  viewer: {
    review: {
      user_id: 'viewer',
      rating: 8,
      review: 'Sharp.',
      created_at: '2026-03-01T00:00:00.000Z',
      updated_at: '2026-03-01T00:00:00.000Z',
      users: { username: 'peek', display_name: 'peek', avatar_url: '' },
    },
    libraryEntry: ENTRY,
    lists: [],
    listIdsGameIsIn: [],
    defaultListPrivacy: true,
  },
}

describe('libraryWrite', () => {
  it('sends only a new status when hours, plays, and the 100% flag stay put', () => {
    expect(libraryWrite(ENTRY, {
      status: 'completed',
      completed: true,
      hours: '12.5',
      playCount: 4,
    })).toEqual({ ok: true, write: { status: 'completed' } })
  })

  it('sends hours when they change and leaves the other columns out', () => {
    expect(libraryWrite(ENTRY, {
      status: 'playing',
      completed: true,
      hours: '20',
      playCount: 4,
    })).toEqual({ ok: true, write: { status: 'playing', hours_played: 20 } })
  })

  it('can clear stored hours without touching play count', () => {
    expect(libraryWrite(ENTRY, {
      status: 'playing',
      completed: true,
      hours: '',
      playCount: 4,
    })).toEqual({ ok: true, write: { status: 'playing', hours_played: null } })
  })

  it('sends the 100% flag and play count only when those change', () => {
    expect(libraryWrite(ENTRY, {
      status: 'playing',
      completed: false,
      hours: '12.5',
      playCount: 5,
    })).toEqual({
      ok: true,
      write: { status: 'playing', completed_all_achievements: false, play_count: 5 },
    })
  })

  it('sends a new save as status alone when the extra fields are still blank', () => {
    expect(libraryWrite(null, {
      status: 'backlog',
      completed: false,
      hours: '',
      playCount: 1,
    })).toEqual({ ok: true, write: { status: 'backlog' } })
  })

  it('refuses a save with no status and a hours value with two decimals', () => {
    expect(libraryWrite(null, { status: null, completed: false, hours: '', playCount: 1 })).toEqual({
      ok: false,
      message: 'Pick a status.',
    })
    expect(libraryWrite(ENTRY, {
      status: 'playing',
      completed: true,
      hours: '12.55',
      playCount: 4,
    })).toEqual({ ok: false, message: 'Hours can have at most one decimal place' })
  })

  it('reports nothing to send when the form matches the saved row', () => {
    expect(libraryWrite(ENTRY, {
      status: 'playing',
      completed: true,
      hours: '12.5',
      playCount: 4,
    })).toEqual({ ok: true, write: null })
  })
})

describe('scoreGap', () => {
  it('compares your score with the community once more than one person has scored', () => {
    expect(scoreGap({ you: 9, community: 7.8, communityCount: 4, signedIn: true }))
      .toBe("You're 1.2 above the community")
    expect(scoreGap({ you: 8, community: 9.2, communityCount: 4, signedIn: true }))
      .toBe("You're 1.2 below the community")
    expect(scoreGap({ you: 8, community: 8.1, communityCount: 4, signedIn: true }))
      .toBe("You're level with the community")
  })

  it('tells a signed-out player to sign in, and the first scorer that the board is theirs', () => {
    expect(scoreGap({ you: null, community: 9.2, communityCount: 4, signedIn: false }))
      .toBe('Sign in to add your rating')
    expect(scoreGap({ you: null, community: 9.2, communityCount: 4, signedIn: true }))
      .toBe('Add your rating')
    expect(scoreGap({ you: 8, community: 8, communityCount: 1, signedIn: true }))
      .toBe("You've scored it — first on the board")
    expect(scoreGap({ you: null, community: null, communityCount: 0, signedIn: false }))
      .toBe('Be the first to rate it')
  })
})

describe('ratingLabel', () => {
  it('uses the website line for a 9 and a 10', () => {
    expect(ratingLabel(9)).toBe('Incredible game.')
    expect(ratingLabel(10)).toBe("Might be the best game I've ever played.")
  })
})

describe('relTime', () => {
  it('reads a database timestamp as days ago', () => {
    const now = Date.parse('2026-02-04T00:00:00.000Z')
    expect(relTime('2026-02-01 00:00:00+00', now)).toBe('3d ago')
  })
})

describe('withLibraryWrite', () => {
  it('changes status and keeps hours, play count, and the 100% flag', () => {
    const next = withLibraryWrite(PAGE, { status: 'completed' })
    expect(next.viewer?.libraryEntry).toEqual({ ...ENTRY, status: 'completed' })
    expect(next.stats).toEqual(PAGE.stats)
  })
})

describe('withViewerReview', () => {
  it('replaces your score and review text and leaves the community numbers alone', () => {
    const next = withViewerReview(PAGE, 9, 'sharp', 'viewer')
    expect(next.viewer?.review?.rating).toBe(9)
    expect(next.viewer?.review?.review).toBe('sharp')
    expect(next.stats.avg_rating).toBe(9.2)
    expect(next.viewer?.libraryEntry).toEqual(ENTRY)
  })
})
