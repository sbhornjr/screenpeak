// @vitest-environment jsdom
import type { GamePageData, GameReviewsPage } from '@screenpeak/shared/api/games'
import { ApiClientError } from '@screenpeak/shared/api/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import GameScreen from '@/app/games/[slug]'

const { getGame, getReviews, putReview, createList } = vi.hoisted(() => ({
  getGame: vi.fn(),
  getReviews: vi.fn(),
  putReview: vi.fn(),
  createList: vi.fn(),
}))

vi.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: vi.fn() }),
  useLocalSearchParams: () => ({ slug: 'hades' }),
}))

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ ready: true, session: { user: { id: 'viewer' } } }),
}))

vi.mock('@/lib/api', () => ({
  apiConfigured: () => true,
  api: {
    games: { get: getGame, reviews: getReviews, putReview },
    me: { library: { put: vi.fn(), delete: vi.fn() } },
    lists: { addGame: vi.fn(), removeGame: vi.fn(), create: createList },
  },
}))

vi.mock('expo-image', () => ({
  Image: () => null,
}))

vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children),
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}))

vi.mock('react-native', () => ({
  Linking: { openURL: vi.fn(() => Promise.resolve()) },
  Platform: { OS: 'web' },
  findNodeHandle: () => null,
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
    { type: 'button', onClick: onPress, 'aria-label': accessibilityLabel, role: accessibilityRole ?? 'button' },
    typeof children === 'function' ? children({ pressed: false }) : children,
  ),
  View: ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children),
  Text: ({
    children,
    accessibilityLiveRegion,
  }: {
    children?: React.ReactNode
    accessibilityLiveRegion?: string
  }) => React.createElement('span', { 'aria-live': accessibilityLiveRegion }, children),
  TextInput: ({
    accessibilityLabel,
    value,
    onChangeText,
  }: {
    accessibilityLabel?: string
    value?: string
    onChangeText?: (value: string) => void
  }) => React.createElement('input', {
    'aria-label': accessibilityLabel,
    value: value ?? '',
    onChange: (event: { target: { value: string } }) => onChangeText?.(event.target.value),
  }),
  Keyboard: { addListener: () => ({ remove() {} }) },
  useWindowDimensions: () => ({ width: 400, height: 800, scale: 1, fontScale: 1 }),
  ScrollView: ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children),
  RefreshControl: () => null,
  Modal: ({ visible, children }: { visible?: boolean, children?: React.ReactNode }) => (
    visible ? React.createElement('div', null, children) : null
  ),
  StyleSheet: { create: (styles: unknown) => styles, absoluteFill: {} },
}))

const PAGE: GamePageData = {
  game: {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Hades',
    slug: 'hades',
    igdb_id: 113112,
    cover_image_url: null,
    artwork_image_url: null,
    released: '2020-09-17',
    description: 'Escape the underworld.',
    esrb_rating: null,
    reddit_url: null,
    screenshots: [],
    created_at: '2026-01-01 00:00:00+00',
  },
  taxonomy: { genres: [], platforms: [], developers: [], publishers: [] },
  stats: {
    total_ratings: 1,
    total_reviews: 1,
    rating_1: 0, rating_2: 0, rating_3: 0, rating_4: 0, rating_5: 0,
    rating_6: 0, rating_7: 0, rating_8: 1, rating_9: 0, rating_10: 0,
    avg_rating: 8,
  },
  viewer: {
    review: {
      user_id: 'viewer',
      rating: 8,
      review: 'Sharp.',
      created_at: '2026-03-01 00:00:00+00',
      updated_at: '2026-03-01 00:00:00+00',
      users: { username: 'peek', display_name: 'peek', avatar_url: '' },
    },
    libraryEntry: null,
    lists: [],
    listIdsGameIsIn: [],
    defaultListPrivacy: true,
  },
}

const REVIEWS: GameReviewsPage = { reviews: [], total: 0, totalPages: 0 }

function pageWithReview(review: string): GamePageData {
  return {
    ...PAGE,
    viewer: PAGE.viewer ? {
      ...PAGE.viewer,
      review: PAGE.viewer.review ? { ...PAGE.viewer.review, review } : null,
    } : null,
  }
}

afterEach(() => {
  cleanup()
  getGame.mockReset()
  getReviews.mockReset()
  putReview.mockReset()
  createList.mockReset()
})

describe('Game screen writes', () => {
  it('shows the rate-limit message, rolls back the review, and ignores a second press', async () => {
    getGame.mockResolvedValue(PAGE)
    getReviews.mockResolvedValue(REVIEWS)
    let rejectReview: (error: unknown) => void = () => undefined
    putReview.mockImplementation(() => new Promise((_resolve, reject) => { rejectReview = reject }))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <GameScreen />
      </QueryClientProvider>,
    )

    expect(await screen.findByText('“Sharp.”')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Rate' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Review note' }), { target: { value: 'again' } })
    const submit = screen.getByRole('button', { name: 'Submit rating' })
    submit.click()
    submit.click()
    await waitFor(() => expect(putReview).toHaveBeenCalledTimes(1))
    expect(putReview).toHaveBeenCalledWith(PAGE.game.id, { rating: 8, review: 'again' })
    expect(await screen.findByText('“again”')).toBeTruthy()

    getGame.mockResolvedValue(pageWithReview('From the server.'))
    rejectReview(new ApiClientError(429, 'rate_limited', 'Too many requests. Try again soon.', 8))

    const message = await screen.findByText('Too many requests. Try again in 8 seconds.')
    expect(message.getAttribute('aria-live')).toBe('polite')
    expect(screen.getByText('“Sharp.”').textContent).toBe('“Sharp.”')
    expect(screen.queryByText('“again”')).toBeNull()
    expect(screen.queryByText('“From the server.”')).toBeNull()
    expect(putReview).toHaveBeenCalledTimes(1)
  })

  it('does not restore an older snapshot over a newer review', async () => {
    getGame.mockResolvedValue(PAGE)
    getReviews.mockResolvedValue(REVIEWS)
    let rejectReview: (error: unknown) => void = () => undefined
    putReview.mockImplementation(() => new Promise((_resolve, reject) => { rejectReview = reject }))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <GameScreen />
      </QueryClientProvider>,
    )

    expect(await screen.findByText('“Sharp.”')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Rate' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Review note' }), { target: { value: 'again' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit rating' }))
    expect(await screen.findByText('“again”')).toBeTruthy()

    client.setQueryData(['game', 'hades', 'viewer'], pageWithReview('Kept.'))
    rejectReview(new ApiClientError(429, 'rate_limited', 'Too many requests.', 8))

    expect(await screen.findByText('“Kept.”')).toBeTruthy()
    expect(screen.queryByText('“Sharp.”')).toBeNull()
    expect(screen.queryByText('“again”')).toBeNull()
  })

  it('shows a new list on the sheet before the game reloads', async () => {
    getGame.mockResolvedValueOnce(PAGE)
    getGame.mockImplementation(() => new Promise(() => undefined))
    getReviews.mockResolvedValue(REVIEWS)
    createList.mockResolvedValue({ id: 'list-9' })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <GameScreen />
      </QueryClientProvider>,
    )

    expect(await screen.findByRole('button', { name: 'Add to list' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Add to list' }))
    fireEvent.click(screen.getByRole('button', { name: 'New list' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'New list name' }), { target: { value: 'Night runs' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create list' }))

    expect(await screen.findByRole('button', { name: 'Remove from Night runs' })).toBeTruthy()
    expect(createList).toHaveBeenCalledWith({
      name: 'Night runs',
      description: '',
      isPublic: true,
      isPinned: false,
      gameId: PAGE.game.id,
    })
  })
})
