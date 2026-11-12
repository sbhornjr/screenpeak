// @vitest-environment jsdom
import type { GamePageData, GameReviewsPage } from '@screenpeak/shared/api/games'
import { ApiClientError } from '@screenpeak/shared/api/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import GameScreen from '@/app/games/[slug]'

const { getGame, getReviews, putReview, createList, libraryPut, addGame, plus1, tapHaptic } = vi.hoisted(() => ({
  getGame: vi.fn(),
  getReviews: vi.fn(),
  putReview: vi.fn(),
  createList: vi.fn(),
  libraryPut: vi.fn(),
  addGame: vi.fn(),
  plus1: vi.fn(),
  tapHaptic: vi.fn(),
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
    me: { library: { put: libraryPut, delete: vi.fn() } },
    lists: { addGame, removeGame: vi.fn(), create: createList },
  },
}))

vi.mock('@/lib/plus1', () => ({ plus1 }))
vi.mock('@/lib/haptics', () => ({ tapHaptic }))

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

function pageWithViewer(viewer: Partial<NonNullable<GamePageData['viewer']>>): GamePageData {
  return { ...PAGE, viewer: PAGE.viewer ? { ...PAGE.viewer, ...viewer } : null }
}

afterEach(() => {
  cleanup()
  getGame.mockReset()
  getReviews.mockReset()
  putReview.mockReset()
  createList.mockReset()
  libraryPut.mockReset()
  addGame.mockReset()
  plus1.mockReset()
  tapHaptic.mockReset()
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

  it('keeps a new list when an older refetch resolves after create', async () => {
    let releaseOld: ((page: GamePageData) => void) | undefined
    let fetches = 0
    getGame.mockImplementation(() => {
      fetches += 1
      if (fetches === 1) return Promise.resolve(PAGE)
      if (fetches === 2) return new Promise<GamePageData>((resolve) => { releaseOld = resolve })
      return new Promise(() => undefined)
    })
    getReviews.mockResolvedValue(REVIEWS)
    createList.mockResolvedValue({ id: 'list-9' })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <GameScreen />
      </QueryClientProvider>,
    )

    expect(await screen.findByRole('button', { name: 'Add to list' })).toBeTruthy()
    const pending = client.refetchQueries({ queryKey: ['game', 'hades', 'viewer'], exact: true })
    pending.catch(() => undefined)
    await waitFor(() => expect(fetches).toBe(2))
    fireEvent.click(screen.getByRole('button', { name: 'Add to list' }))
    fireEvent.click(screen.getByRole('button', { name: 'New list' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'New list name' }), { target: { value: 'Night runs' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create list' }))
    expect(await screen.findByRole('button', { name: 'Remove from Night runs' })).toBeTruthy()
    releaseOld?.(PAGE)
    await pending.catch(() => undefined)
    expect(screen.getByRole('button', { name: 'Remove from Night runs' })).toBeTruthy()
  })
})

describe('Game screen +1 tic and haptics', () => {
  it('fires the RATED tic and a haptic only the first time you score a game', async () => {
    getGame.mockResolvedValue(pageWithViewer({ review: null }))
    getReviews.mockResolvedValue(REVIEWS)
    putReview.mockResolvedValue({})
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <GameScreen />
      </QueryClientProvider>,
    )

    expect(await screen.findByRole('button', { name: 'Rate' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Rate' }))
    fireEvent.click(screen.getByRole('button', { name: 'Score 9' }))
    fireEvent.click(screen.getByRole('button', { name: 'Submit rating' }))

    await waitFor(() => expect(putReview).toHaveBeenCalledTimes(1))
    expect(tapHaptic).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(plus1).toHaveBeenCalledWith('RATED'))
  })

  it('fires a haptic but stays silent on an amended review', async () => {
    getGame.mockResolvedValue(PAGE)
    getReviews.mockResolvedValue(REVIEWS)
    putReview.mockResolvedValue({})
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

    await waitFor(() => expect(putReview).toHaveBeenCalledTimes(1))
    expect(tapHaptic).toHaveBeenCalledTimes(1)
    expect(plus1).not.toHaveBeenCalled()
  })

  it('fires SAVED the first time you add the game to your library', async () => {
    getGame.mockResolvedValue(pageWithViewer({ libraryEntry: null }))
    getReviews.mockResolvedValue(REVIEWS)
    libraryPut.mockResolvedValue({})
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <GameScreen />
      </QueryClientProvider>,
    )

    expect(await screen.findByRole('button', { name: 'Save game' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Save game' }))
    fireEvent.click(screen.getByRole('button', { name: 'Log as backlog' }))
    // The trigger and the sheet's own submit button are both named "Save
    // game" while entry is null; the submit button is the one the sheet adds.
    fireEvent.click(screen.getAllByRole('button', { name: 'Save game' }).at(-1)!)

    await waitFor(() => expect(libraryPut).toHaveBeenCalledTimes(1))
    expect(plus1).toHaveBeenCalledWith('SAVED')
  })

  it('fires COMPLETED, not SAVED, the first time you log a game as already completed', async () => {
    getGame.mockResolvedValue(pageWithViewer({ libraryEntry: null }))
    getReviews.mockResolvedValue(REVIEWS)
    libraryPut.mockResolvedValue({})
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <GameScreen />
      </QueryClientProvider>,
    )

    expect(await screen.findByRole('button', { name: 'Save game' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Save game' }))
    fireEvent.click(screen.getByRole('button', { name: 'Log as completed' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Save game' }).at(-1)!)

    await waitFor(() => expect(libraryPut).toHaveBeenCalledTimes(1))
    expect(plus1).toHaveBeenCalledWith('COMPLETED')
    expect(plus1).not.toHaveBeenCalledWith('SAVED')
  })

  it('fires COMPLETED when an existing entry first reaches completed, and not on other status changes', async () => {
    const entry = { id: 'lib-1', status: 'playing', completed_all_achievements: false, hours_played: null, play_count: 1 }
    getGame.mockResolvedValue(pageWithViewer({ libraryEntry: entry }))
    getReviews.mockResolvedValue(REVIEWS)
    libraryPut.mockResolvedValue({})
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <GameScreen />
      </QueryClientProvider>,
    )

    expect(await screen.findByRole('button', { name: 'Save game' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Save game' }))
    fireEvent.click(screen.getByRole('button', { name: 'Log as completed' }))
    fireEvent.click(screen.getByRole('button', { name: 'Update library entry' }))

    await waitFor(() => expect(libraryPut).toHaveBeenCalledTimes(1))
    expect(plus1).toHaveBeenCalledWith('COMPLETED')
  })

  it('fires LISTED after adding the game to an existing list', async () => {
    getGame.mockResolvedValue(pageWithViewer({
      lists: [{ id: 'list-1', name: 'Wishlist', game_count: 0 }],
      listIdsGameIsIn: [],
    }))
    getReviews.mockResolvedValue(REVIEWS)
    addGame.mockResolvedValue({})
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <GameScreen />
      </QueryClientProvider>,
    )

    expect(await screen.findByRole('button', { name: 'Add to list' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Add to list' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add to Wishlist' }))

    await waitFor(() => expect(addGame).toHaveBeenCalledTimes(1))
    expect(plus1).toHaveBeenCalledWith('LISTED')
  })

  it('fires NEW LIST once for creating a list from the game page, not also LISTED', async () => {
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
    expect(plus1).toHaveBeenCalledWith('NEW LIST')
    expect(plus1).not.toHaveBeenCalledWith('LISTED')
  })
})
