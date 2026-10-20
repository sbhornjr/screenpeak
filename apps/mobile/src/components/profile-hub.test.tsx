// @vitest-environment jsdom
import type { ProfilePageData } from '@screenpeak/shared/api/profile'
import { hitTarget } from '@screenpeak/shared/tokens'
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { averageText, calendarLabel, profileHubModel, reviewDateLabel, withFollowing } from '@/lib/profile-hub'

import { ProfileHub } from './profile-hub'

process.env.TZ = 'America/Los_Angeles'

vi.mock('react-native', () => {
  function flatStyle(style: unknown): Record<string, unknown> {
    if (!style) return {}
    if (Array.isArray(style)) return Object.assign({}, ...style.map(flatStyle))
    if (typeof style === 'function') return {}
    return style as Record<string, unknown>
  }
  return ({
  Platform: { OS: 'web' },
  Pressable: ({
    onPress,
    children,
    accessibilityLabel,
    accessibilityRole,
    disabled,
    style,
  }: {
    onPress?: () => void
    children?: React.ReactNode
    accessibilityLabel?: string
    accessibilityRole?: string
    disabled?: boolean
    style?: unknown
  }) => React.createElement(
    'button',
    {
      type: 'button',
      onClick: onPress,
      'aria-label': accessibilityLabel,
      role: accessibilityRole,
      disabled,
      'data-style': JSON.stringify(flatStyle(style)),
    },
    children,
  ),
  View: ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children),
  Text: ({
    children,
    accessibilityLiveRegion,
    accessibilityRole,
    accessibilityLevel,
    style,
  }: {
    children?: React.ReactNode
    accessibilityLiveRegion?: string
    accessibilityRole?: string
    accessibilityLevel?: number
    style?: unknown
  }) => React.createElement('span', {
    'aria-live': accessibilityLiveRegion,
    role: accessibilityRole === 'header' ? 'heading' : undefined,
    'aria-level': accessibilityLevel,
    'data-style': JSON.stringify(flatStyle(style)),
  }, children),
  ScrollView: ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children),
  RefreshControl: () => null,
  useWindowDimensions: () => ({ width: 320, height: 568, scale: 1, fontScale: 1 }),
  StyleSheet: { create: (styles: unknown) => styles, absoluteFill: {} },
}) })

vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children),
}))

vi.mock('expo-image', () => ({
  Image: () => null,
}))

afterEach(() => {
  cleanup()
})

const ADA = '33333333-3333-3333-3333-333333333333'

function page(input: {
  username?: string
  displayName?: string | null
  title?: string | null
  bio?: string | null
  quote?: string | null
  libraryPublic?: boolean
  loadoutPublic?: boolean
  stats?: { total_games: number, completed: number } | null
  viewer?: 'owner' | 'other' | null
  following?: boolean
  followers?: number
}): ProfilePageData {
  const username = input.username ?? 'ada'
  const owner = input.viewer === 'owner'
  const libraryPublic = input.libraryPublic ?? false
  const loadoutPublic = input.loadoutPublic ?? false
  return {
    profile: {
      id: ADA,
      username,
      display_name: input.displayName === undefined ? 'Ada Lovelace' : input.displayName,
      avatar_url: null,
      created_at: '2026-01-15 00:00:00+00',
      selected_title: input.title === undefined ? 'Ranger' : input.title,
      user_bio: input.bio === undefined ? 'Writes proofs.' : input.bio,
      profile_loadout_bio: input.quote === undefined ? 'A patient roguelike reader.' : input.quote,
      library_public: libraryPublic,
      loadout_public: loadoutPublic,
      follower_count: input.followers ?? 4,
      following_count: 2,
    },
    library_stats: input.stats === undefined ? { total_games: 10, completed: 3 } : input.stats,
    favorites: [{
      id: '44444444-4444-4444-8444-444444444444',
      name: 'Celeste',
      slug: 'celeste',
      cover_image_url: null,
      released: '2018-01-25',
      developer: 'Extremely OK',
      avg_rating: 9,
      user_rating: 8,
    }],
    recent_reviews: [{
      user_id: ADA,
      rating: 9,
      review: 'Sharp climb.',
      created_at: '2026-02-01 00:00:00+00',
      updated_at: '2026-02-01 00:00:00+00',
      users: { username, display_name: 'Ada Lovelace', avatar_url: '' },
      games: { name: 'Celeste', slug: 'celeste' },
    }],
    rating_count: 5,
    avg_rating: 7.666,
    viewer: input.viewer == null ? null : {
      is_owner: owner,
      is_following: input.following ?? false,
      top_developer_names: [],
    },
  }
}

describe('profile dates and averages', () => {
  it('formats member since on the local calendar and a review as a short local date', () => {
    expect(calendarLabel('2026-01-15 00:00:00+00')).toBe('1/14/2026')
    expect(calendarLabel('not a date')).toBeNull()
    expect(reviewDateLabel('2026-02-01 00:00:00+00')).toBe('Jan 31, 2026')
    expect(reviewDateLabel('not a date')).toBeNull()
    expect(averageText(5, 7.666)).toBe('7.66 / 10')
    expect(averageText(1, 8)).toBe('8 / 10')
    expect(averageText(0, 8)).toBe('—')
    expect(averageText(3, null)).toBe('—')
  })
})

describe('profile follow cache', () => {
  it('raises the follower count when a follow starts and will not drop it below zero', () => {
    const start = profileHubModel(page({ viewer: 'other', following: false, followers: 4 }))
    const followed = withFollowing(start, true)
    expect(followed.following).toBe(true)
    expect(followed.followerCount).toBe(5)
    const cleared = withFollowing(followed, false)
    expect(cleared.following).toBe(false)
    expect(cleared.followerCount).toBe(4)
    const empty = withFollowing({ ...cleared, followerCount: 0 }, false)
    expect(empty.followerCount).toBe(0)
    expect(empty.following).toBe(false)
  })

  it('leaves an owner profile unchanged', () => {
    const owner = profileHubModel(page({ username: 'peek', viewer: 'owner', followers: 3 }))
    expect(withFollowing(owner, true)).toEqual(owner)
  })
})

describe('profile page', () => {
  it('shows your name, bio, pinned hub, favorites, and review, and edits from your own profile', () => {
    const onOpen = vi.fn()
    render(<ProfileHub model={profileHubModel(page({
      username: 'peek',
      displayName: 'Peek',
      viewer: 'owner',
      libraryPublic: false,
      loadoutPublic: false,
      stats: { total_games: 5, completed: 2 },
      followers: 3,
    }))} onOpen={onOpen} />)

    expect(screen.getByRole('heading', { level: 1, name: 'Peek' }).textContent).toBe('Peek')
    expect(screen.getByText('@peek').textContent).toBe('@peek')
    expect(screen.getByText('Ranger').textContent).toBe('Ranger')
    expect(screen.getByText('Member since 1/14/2026').textContent).toBe('Member since 1/14/2026')
    expect(screen.getByText('3 followers · 2 following').textContent).toBe('3 followers · 2 following')
    expect(screen.getByText('Writes proofs.').textContent).toBe('Writes proofs.')
    expect(screen.getByText('“A patient roguelike reader.”').textContent).toBe('“A patient roguelike reader.”')
    expect(screen.queryByRole('button', { name: 'Follow peek' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Edit profile' }))
    fireEvent.click(screen.getByRole('button', { name: 'Loadout' }))
    fireEvent.click(screen.getByRole('button', { name: 'Lists' }))
    fireEvent.click(screen.getByRole('button', { name: 'Library, 5 games, 2 completed' }))
    const celeste = screen.getAllByRole('link', { name: 'Celeste' })
    expect(celeste).toHaveLength(2)
    fireEvent.click(celeste[0])
    fireEvent.click(screen.getByRole('button', { name: 'View all reviews' }))
    expect(onOpen.mock.calls).toEqual([
      ['/settings'],
      ['/user/peek/loadout'],
      ['/user/peek/lists'],
      ['/library'],
      ['/games/celeste'],
      ['/user/peek/ratings_reviews'],
    ])
    expect(screen.getByText('5 games · 2 completed').textContent).toBe('5 games · 2 completed')
    expect(screen.getByText('Sharp climb.').textContent).toBe('Sharp climb.')
    expect(screen.getByText('7.66 / 10').textContent).toBe('7.66 / 10')
    expect(screen.getByText('Jan 31, 2026').textContent).toBe('Jan 31, 2026')
  })

  it('keeps a long review title beside its score', () => {
    const data = page({ username: 'peek', viewer: 'owner' })
    const title = 'The Extremely Long Chronicle of the Northern Reach'
    data.recent_reviews = [{
      ...data.recent_reviews[0],
      review: '',
      games: { name: title, slug: 'northern-reach' },
    }]
    render(<ProfileHub model={profileHubModel(data)} onOpen={vi.fn()} />)
    const link = screen.getByRole('link', { name: title })
    const linkStyle = JSON.parse(link.getAttribute('data-style') || '{}') as Record<string, unknown>
    expect(linkStyle.flex).toBe(1)
    expect(linkStyle.flexShrink).toBe(1)
    expect(linkStyle.minHeight).toBe(hitTarget)
    const score = screen.getByText('9 / 10')
    const scoreStyle = JSON.parse(score.getAttribute('data-style') || '{}') as Record<string, unknown>
    expect(scoreStyle.flexShrink).toBe(0)
    expect(screen.queryByText('Scored it, no note.')).toBeNull()
  })

  it('follows another public player and opens their library, not yours', () => {
    const onOpen = vi.fn()
    const onFollow = vi.fn()
    render(<ProfileHub model={profileHubModel(page({
      viewer: 'other',
      libraryPublic: true,
      loadoutPublic: true,
      stats: { total_games: 10, completed: 3 },
    }))} onOpen={onOpen} onFollow={onFollow} />)

    expect(screen.getByRole('heading', { level: 1, name: 'Ada Lovelace' }).textContent).toBe('Ada Lovelace')
    expect(screen.getByText('@ada').textContent).toBe('@ada')
    expect(screen.queryByRole('button', { name: 'Edit profile' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Follow ada' }))
    expect(onFollow).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Library, 10 games, 3 completed' }))
    expect(onOpen).toHaveBeenCalledWith('/user/ada/library')
    expect(screen.getByText('Games').textContent).toBe('Games')
    expect(screen.getByText('Completed').textContent).toBe('Completed')
  })

  it('unfollows from the Following button', () => {
    const onUnfollow = vi.fn()
    render(<ProfileHub model={profileHubModel(page({
      viewer: 'other',
      following: true,
      libraryPublic: true,
      loadoutPublic: true,
    }))} onOpen={vi.fn()} onUnfollow={onUnfollow} />)
    fireEvent.click(screen.getByRole('button', { name: 'Unfollow ada' }))
    expect(onUnfollow).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Unfollow ada' }).textContent).toBe('Following')
  })

  it('hides the follow button, the library, and the read-out for a signed-out private profile, and still shows the review', () => {
    render(<ProfileHub model={profileHubModel(page({
      viewer: null,
      libraryPublic: false,
      loadoutPublic: false,
      stats: { total_games: 10, completed: 3 },
      quote: 'A patient roguelike reader.',
    }))} onOpen={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Follow ada' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Loadout' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Library/ })).toBeNull()
    expect(screen.queryByText(/patient roguelike reader/)).toBeNull()
    expect(screen.queryByText('Games')).toBeNull()
    expect(screen.getByRole('button', { name: 'Lists' })).toBeTruthy()
    expect(screen.getByText('Sharp climb.').textContent).toBe('Sharp climb.')
    expect(screen.getByText('Rated').textContent).toBe('Rated')
  })

  it('says when a bio, favorites, and reviews are missing', () => {
    const data = page({ username: 'peek', viewer: 'owner', bio: null })
    data.favorites = []
    data.recent_reviews = []
    render(<ProfileHub model={profileHubModel(data)} onOpen={vi.fn()} />)
    expect(screen.getByText("You haven't written a bio yet.").textContent).toBe("You haven't written a bio yet.")
    expect(screen.getByText('No favorite games yet').textContent).toBe('No favorite games yet')
    expect(screen.getByText("Pin a few games you love and they'll show up here.").textContent)
      .toBe("Pin a few games you love and they'll show up here.")
    expect(screen.getByText('No reviews yet').textContent).toBe('No reviews yet')
    expect(screen.getByText('Rate and review a game to start building your record.').textContent)
      .toBe('Rate and review a game to start building your record.')
  })

  it('uses the other player empty copy and Title-less Noob when they have no title', () => {
    const data = page({ viewer: null, title: null, bio: '', quote: null, stats: null, libraryPublic: false, loadoutPublic: false })
    data.favorites = []
    data.recent_reviews = []
    data.profile.user_bio = null
    render(<ProfileHub model={profileHubModel(data)} onOpen={vi.fn()} />)
    expect(screen.getByText('Title-less Noob').textContent).toBe('Title-less Noob')
    expect(screen.getByText('No bio yet.').textContent).toBe('No bio yet.')
    expect(screen.getByText("This player hasn't picked any favorites yet.").textContent)
      .toBe("This player hasn't picked any favorites yet.")
    expect(screen.getByText("This player hasn't reviewed anything yet.").textContent)
      .toBe("This player hasn't reviewed anything yet.")
  })

  it('shows a follow failure without leaving the profile', () => {
    render(<ProfileHub
      model={profileHubModel(page({ viewer: 'other' }))}
      onOpen={vi.fn()}
      onFollow={vi.fn()}
      followNote="Too many requests. Try again in 8 seconds."
    />)
    const note = screen.getByText('Too many requests. Try again in 8 seconds.')
    expect(note.getAttribute('aria-live')).toBe('polite')
  })
})
