// @vitest-environment jsdom
import type { GamePageData, GameReviewsPage } from '@screenpeak/shared/api/games'
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { GameDetail } from './game-detail'

vi.mock('react-native', () => ({
  Linking: { openURL: vi.fn(() => Promise.resolve()) },
  Pressable: ({
    onPress,
    children,
    accessibilityLabel,
    accessibilityRole,
  }: {
    onPress?: () => void
    children: React.ReactNode | ((state: { pressed: boolean }) => React.ReactNode)
    accessibilityLabel?: string
    accessibilityRole?: string
  }) => React.createElement(
    'button',
    { type: 'button', onClick: onPress, 'aria-label': accessibilityLabel, role: accessibilityRole },
    typeof children === 'function' ? children({ pressed: false }) : children,
  ),
  View: ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children),
  Text: ({ children }: { children?: React.ReactNode }) => React.createElement('span', null, children),
  ScrollView: ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children),
  StyleSheet: { create: (styles: unknown) => styles, absoluteFill: {} },
}))

vi.mock('expo-image', () => ({
  Image: () => null,
}))

const DATA: GamePageData = {
  game: {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Hades',
    slug: 'hades',
    igdb_id: 113112,
    cover_image_url: 'https://images.igdb.com/igdb/image/upload/t_cover_big_2x/co123.jpg',
    artwork_image_url: null,
    released: '2020-09-17',
    description: 'Escape the underworld.',
    esrb_rating: 'Teen',
    reddit_url: null,
    screenshots: ['https://images.igdb.com/igdb/image/upload/t_screenshot_huge/sc123.jpg'],
    created_at: '2026-01-01 00:00:00+00',
  },
  taxonomy: {
    genres: [{ id: 'g1', name: 'Roguelike', slug: 'roguelike' }],
    platforms: [{ id: 'p1', name: 'PC', slug: 'pc' }],
    developers: [{ id: 'd1', name: 'Supergiant Games', slug: 'supergiant' }],
    publishers: [],
  },
  stats: {
    total_ratings: 4,
    total_reviews: 1,
    rating_1: 0, rating_2: 0, rating_3: 0, rating_4: 0, rating_5: 0,
    rating_6: 0, rating_7: 1, rating_8: 0, rating_9: 2, rating_10: 1,
    avg_rating: 9.2,
  },
  viewer: null,
}

const REVIEWS: GameReviewsPage = {
  reviews: [{
    user_id: 'user-1',
    rating: 10,
    review: 'One more run.',
    created_at: '2026-02-01 00:00:00+00',
    updated_at: '2026-02-01 00:00:00+00',
    users: { username: 'zagreus', display_name: 'Zagreus', avatar_url: '' },
  }],
  total: 1,
  totalPages: 1,
}

afterEach(cleanup)

describe('GameDetail', () => {
  it('shows the game, the community score, and a review while signed out', () => {
    render(
      <GameDetail
        data={DATA}
        reviews={REVIEWS}
        reviewsNote={null}
        signedIn={false}
        onBack={() => undefined}
        onSignIn={() => undefined}
        onSignUp={() => undefined}
        onRetryReviews={() => undefined}
      />,
    )

    expect(screen.getAllByText('Hades').length).toBeGreaterThan(0)
    expect(screen.getAllByText('9.2').some(node => node.textContent === '9.2')).toBe(true)
    expect(screen.getByText('Community').textContent).toBe('Community')
    expect(screen.getByText('“One more run.”').textContent).toBe('“One more run.”')
    expect(screen.getAllByText('Supergiant Games').map(node => node.textContent)).toEqual(['Supergiant Games', 'Supergiant Games'])
    expect(screen.getByRole('link', { name: 'Game data and images from IGDB' }).textContent).toBe('Game data and images from IGDB')
  })

  it('ignores a viewer payload when the player is signed out', () => {
    render(
      <GameDetail
        data={{
          ...DATA,
          viewer: {
            review: {
              user_id: 'viewer',
              rating: 8,
              review: 'Sharp.',
              created_at: '2026-03-01 00:00:00+00',
              updated_at: '2026-03-01 00:00:00+00',
              users: { username: 'peek', display_name: 'peek', avatar_url: '' },
            },
            libraryEntry: { id: 'le', status: 'playing', completed_all_achievements: false, hours_played: 12, play_count: 1 },
            lists: [],
            listIdsGameIsIn: [],
            defaultListPrivacy: true,
          },
        }}
        reviews={REVIEWS}
        reviewsNote={null}
        signedIn={false}
        onBack={() => undefined}
        onSignIn={() => undefined}
        onSignUp={() => undefined}
        onRetryReviews={() => undefined}
      />,
    )

    expect(screen.queryByText('You · 8 / 10')).toBeNull()
    expect(screen.getByRole('button', { name: 'Save game' }).textContent).toBe('Save game')
  })

  it('asks for an account when a signed-out player tries to save the game', () => {
    const onSignUp = vi.fn()
    render(
      <GameDetail
        data={DATA}
        reviews={REVIEWS}
        reviewsNote={null}
        signedIn={false}
        onBack={() => undefined}
        onSignIn={() => undefined}
        onSignUp={onSignUp}
        onRetryReviews={() => undefined}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Save game' }))
    expect(screen.getByText('Sign up to rate, log, or list this game.').textContent).toBe('Sign up to rate, log, or list this game.')
    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }))
    expect(onSignUp).toHaveBeenCalledTimes(1)
  })

  it('shows your score instead of the signup prompt when you are signed in', () => {
    render(
      <GameDetail
        data={{
          ...DATA,
          viewer: {
            review: {
              user_id: 'viewer',
              rating: 8,
              review: 'Sharp.',
              created_at: '2026-03-01 00:00:00+00',
              updated_at: '2026-03-01 00:00:00+00',
              users: { username: 'peek', display_name: 'peek', avatar_url: '' },
            },
            libraryEntry: { id: 'le', status: 'playing', completed_all_achievements: false, hours_played: 12, play_count: 1 },
            lists: [],
            listIdsGameIsIn: [],
            defaultListPrivacy: true,
          },
        }}
        reviews={REVIEWS}
        reviewsNote={null}
        signedIn
        onBack={() => undefined}
        onSignIn={() => undefined}
        onSignUp={() => undefined}
        onRetryReviews={() => undefined}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Save game' }))
    expect(screen.queryByText('Sign up to rate, log, or list this game.')).toBeNull()
    expect(screen.getByText('You · 8 / 10').textContent).toBe('You · 8 / 10')
    expect(screen.getByRole('button', { name: 'Save game' }).textContent).toBe('Playing')
  })
})
