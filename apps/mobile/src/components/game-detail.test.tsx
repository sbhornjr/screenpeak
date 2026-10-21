// @vitest-environment jsdom
import type { GamePageData, GameReviewsPage } from '@screenpeak/shared/api/games'
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Linking } from 'react-native'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { colors } from '@/theme'

import { GameDetail } from './game-detail'

function flatStyle(style: unknown): Record<string, string | number> {
  if (typeof style === 'function') return flatStyle((style as (state: { pressed: boolean, focused: boolean }) => unknown)({ pressed: false, focused: false }))
  if (Array.isArray(style)) return Object.assign({}, ...style.filter(Boolean).map(flatStyle))
  if (style && typeof style === 'object') return style as Record<string, string | number>
  return {}
}

vi.mock('react-native', () => ({
  Linking: { openURL: vi.fn(() => Promise.resolve()) },
  Platform: { OS: 'web' },
  findNodeHandle: () => null,
  Pressable: ({
    onPress,
    children,
    accessibilityLabel,
    accessibilityRole,
    accessibilityState,
    style,
  }: {
    onPress?: () => void
    children: React.ReactNode | ((state: { pressed: boolean }) => React.ReactNode)
    accessibilityLabel?: string
    accessibilityRole?: string
    accessibilityState?: { selected?: boolean, checked?: boolean, disabled?: boolean }
    style?: unknown
  }) => React.createElement(
    'button',
    {
      type: 'button',
      onClick: onPress,
      'aria-label': accessibilityLabel,
      role: accessibilityRole === 'switch' ? 'switch' : (accessibilityRole ?? 'button'),
      'aria-selected': accessibilityState?.selected ? 'true' : 'false',
      'aria-checked': accessibilityState && 'checked' in accessibilityState ? String(accessibilityState.checked) : undefined,
      style: flatStyle(style),
    },
    typeof children === 'function' ? children({ pressed: false }) : children,
  ),
  View: ({
    children,
    accessibilityLabel,
  }: {
    children?: React.ReactNode
    accessibilityLabel?: string
  }) => React.createElement('div', { 'aria-label': accessibilityLabel }, children),
  Text: ({
    children,
    accessibilityLabel,
    accessibilityLiveRegion,
    accessibilityRole,
    accessibilityLevel,
  }: {
    children?: React.ReactNode
    accessibilityLabel?: string
    accessibilityLiveRegion?: 'polite' | 'none' | 'assertive'
    accessibilityRole?: string
    accessibilityLevel?: number
  }) => React.createElement('span', {
    'aria-label': accessibilityLabel,
    'aria-live': accessibilityLiveRegion,
    role: accessibilityRole === 'header' ? 'heading' : undefined,
    'aria-level': accessibilityLevel,
  }, children),
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
  ScrollView: ({
    children,
    refreshControl,
  }: {
    children?: React.ReactNode
    refreshControl?: React.ReactNode
  }) => React.createElement('div', null, refreshControl, children),
  RefreshControl: ({
    onRefresh,
  }: {
    onRefresh?: () => void
  }) => React.createElement('button', { type: 'button', 'aria-label': 'Refresh', onClick: onRefresh }),
  Modal: ({
    visible,
    onDismiss,
    children,
  }: {
    visible?: boolean
    onDismiss?: () => void
    children?: React.ReactNode
  }) => {
    const wasVisible = React.useRef(visible)
    React.useEffect(() => {
      if (wasVisible.current && visible === false) onDismiss?.()
      wasVisible.current = visible
    }, [visible, onDismiss])
    return visible ? React.createElement('div', null, children) : null
  },
  StyleSheet: { create: (styles: unknown) => styles, absoluteFill: {} },
}))

vi.mock('lucide-react-native', () => {
  function Icon() {
    return React.createElement('span', { 'aria-hidden': 'true' })
  }
  return { Clock: Icon, Repeat: Icon, Trophy: Icon }
})

vi.mock('expo-image', () => ({
  Image: () => null,
}))

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
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
    expect(screen.getByText('In your library').textContent).toBe('In your library')
    expect(screen.getByText('Sign in to add this game to your library.').textContent)
      .toBe('Sign in to add this game to your library.')
    expect(screen.getByText('Released').textContent).toBe('Released')
    expect(screen.getByText('2020').textContent).toBe('2020')
    expect(screen.getAllByText('PC').map(node => node.textContent)).toEqual(['PC'])
    expect(screen.getAllByText('9.2').some(node => node.textContent === '9.2')).toBe(true)
    expect(screen.getAllByText('Community').length).toBeGreaterThan(0)
    expect(screen.getByText('Sign in to add your rating').textContent).toBe('Sign in to add your rating')
    expect(screen.getByText('“One more run.”').textContent).toBe('“One more run.”')
    expect(screen.getByText('zagreus').textContent).toBe('zagreus')
    expect(screen.getAllByText('Supergiant Games').map(node => node.textContent)).toEqual(['Supergiant Games'])
    expect(screen.getAllByText('1 · 25%').map(node => node.textContent)).toEqual(['1 · 25%', '1 · 25%'])
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
    expect(screen.queryByLabelText('Hours played 12')).toBeNull()
    expect(screen.getByText('Sign in to add this game to your library.').textContent)
      .toBe('Sign in to add this game to your library.')
    expect(screen.getByRole('button', { name: 'Save game' }).textContent).toBe('Save game')
    expect(screen.getByRole('button', { name: 'Write a review' }).textContent).toBe('Write a review')
  })

  it('closes the signup sheet before Sign up or Log in runs', () => {
    const onSignUp = vi.fn(() => {
      expect(screen.queryByText('Sign up to rate, log, or list this game.')).toBeNull()
    })
    const onSignIn = vi.fn(() => {
      expect(screen.queryByText('Sign up to rate, log, or list this game.')).toBeNull()
    })
    render(
      <GameDetail
        data={DATA}
        reviews={REVIEWS}
        reviewsNote={null}
        signedIn={false}
        onBack={() => undefined}
        onSignIn={onSignIn}
        onSignUp={onSignUp}
        onRetryReviews={() => undefined}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Write a review' }))
    expect(screen.getByText('Sign up to rate, log, or list this game.').textContent).toBe('Sign up to rate, log, or list this game.')
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    fireEvent.click(screen.getByRole('button', { name: 'Save game' }))
    expect(screen.getByText('Sign up to rate, log, or list this game.').textContent).toBe('Sign up to rate, log, or list this game.')
    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }))
    expect(onSignUp).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Sign up to rate, log, or list this game.')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Save game' }))
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }))
    expect(onSignIn).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Sign up to rate, log, or list this game.')).toBeNull()
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

    expect(screen.getByLabelText('Hours played 12').textContent).toContain('12')
    expect(screen.getByText('12').textContent).toBe('12')
    expect(screen.getByLabelText('Times played 1').textContent).toContain('1')
    expect(screen.queryByLabelText('100% achievements completed')).toBeNull()
    expect(screen.getByText('8/10').textContent).toBe('8/10')
    expect(screen.getAllByText('Playing').length).toBeGreaterThan(0)
    expect(screen.queryByText('Status Playing')).toBeNull()
    expect(screen.queryByText('Your score 8 / 10')).toBeNull()
    expect(screen.getByText(/^Scored /).textContent).toMatch(/^Scored /)
    fireEvent.click(screen.getByRole('button', { name: 'Edit your review' }))
    expect(screen.getByRole('textbox', { name: 'Review note' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    fireEvent.click(screen.getByRole('button', { name: 'Save game' }))
    expect(screen.queryByText('Sign up to rate, log, or list this game.')).toBeNull()
    expect(screen.getByText('“Sharp.”').textContent).toBe('“Sharp.”')
    expect(screen.getAllByLabelText('Your score 8 out of 10').map(node => node.textContent)).toEqual(expect.arrayContaining(['8', '8/10']))
    expect(screen.getByRole('button', { name: 'Save game' }).textContent).toBe('Playing')
  })

  const SIGNED_IN = {
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
      lists: [{ id: 'list-1', name: 'Backlog', game_count: 2 }],
      listIdsGameIsIn: [],
      defaultListPrivacy: true,
    },
  }

  it('saves a rating, a library status, and a list for a signed-in player', async () => {
    const onRate = vi.fn(async () => null)
    const onSave = vi.fn(async () => null)
    const onAddToList = vi.fn(async () => null)
    const onCreateList = vi.fn(async () => null)
    render(
      <GameDetail
        data={SIGNED_IN}
        reviews={REVIEWS}
        reviewsNote={null}
        signedIn
        onBack={() => undefined}
        onSignIn={() => undefined}
        onSignUp={() => undefined}
        onRetryReviews={() => undefined}
        onRate={onRate}
        onSave={onSave}
        onAddToList={onAddToList}
        onCreateList={onCreateList}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Rate' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Review note' }), { target: { value: 'sharp' } })
    fireEvent.click(screen.getByRole('button', { name: 'Score 9' }))
    fireEvent.click(screen.getByRole('button', { name: 'Submit rating' }))
    await waitFor(() => expect(onRate).toHaveBeenCalledWith(9, 'sharp'))

    fireEvent.click(screen.getByRole('button', { name: 'Save game' }))
    fireEvent.click(screen.getByRole('button', { name: 'Log as completed' }))
    fireEvent.click(screen.getByRole('button', { name: 'Update library entry' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ status: 'completed' }))

    fireEvent.click(screen.getByRole('button', { name: 'Add to list' }))
    expect(screen.queryByRole('textbox', { name: 'New list name' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Add to Backlog' }))
    await waitFor(() => expect(onAddToList).toHaveBeenCalledWith('list-1'))

    fireEvent.click(screen.getByRole('button', { name: 'New list' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'New list name' }), { target: { value: 'Favorites' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'List description' }), { target: { value: 'Best' } })
    fireEvent.click(screen.getByRole('switch', { name: 'Public list' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create list' }))
    await waitFor(() => expect(onCreateList).toHaveBeenCalledWith({
      name: 'Favorites',
      description: 'Best',
      isPublic: false,
      isPinned: false,
    }))
    expect(screen.queryByText('Sign up to rate, log, or list this game.')).toBeNull()
  })

  it('keeps a chosen score until you submit, then edits and deletes the written review', async () => {
    const onRate = vi.fn(async () => null)
    render(
      <GameDetail
        data={SIGNED_IN}
        reviews={REVIEWS}
        reviewsNote={null}
        signedIn
        onBack={() => undefined}
        onSignIn={() => undefined}
        onSignUp={() => undefined}
        onRetryReviews={() => undefined}
        onRate={onRate}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Rate' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Review note' }), { target: { value: 'sharper' } })
    fireEvent.click(screen.getByRole('button', { name: 'Score 9' }))
    expect(onRate).not.toHaveBeenCalled()
    expect(screen.getByText('Incredible game.').textContent).toBe('Incredible game.')
    fireEvent.click(screen.getByRole('button', { name: 'Submit rating' }))
    await waitFor(() => expect(onRate).toHaveBeenCalledWith(9, 'sharper'))

    fireEvent.click(screen.getByRole('button', { name: 'Rate' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete review' }))
    expect(screen.getByText('Delete this review? Your score stays.').textContent).toBe('Delete this review? Your score stays.')
    expect(onRate).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Delete the written review' }))
    await waitFor(() => expect(onRate).toHaveBeenCalledWith(8, ''))
  })

  it('retries a rate-limited save with the same score and review', async () => {
    const onRate = vi.fn()
      .mockResolvedValueOnce('Too many requests. Try again in 8 seconds.')
      .mockResolvedValueOnce(null)
    render(
      <GameDetail
        data={SIGNED_IN}
        reviews={REVIEWS}
        reviewsNote={null}
        signedIn
        onBack={() => undefined}
        onSignIn={() => undefined}
        onSignUp={() => undefined}
        onRetryReviews={() => undefined}
        onRate={onRate}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Rate' }))
    fireEvent.click(screen.getByRole('button', { name: 'Score 9' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Review note' }), { target: { value: 'again' } })
    fireEvent.click(screen.getByRole('button', { name: 'Submit rating' }))
    const message = await screen.findByText('Too many requests. Try again in 8 seconds.')
    expect(message.getAttribute('aria-live')).toBe('polite')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(onRate).toHaveBeenCalledTimes(2))
    expect(onRate).toHaveBeenNthCalledWith(2, 9, 'again')
  })

  it('sends a status change without hours, play count, or the 100% flag', async () => {
    const onSave = vi.fn(async () => null)
    render(
      <GameDetail
        data={SIGNED_IN}
        reviews={REVIEWS}
        reviewsNote={null}
        signedIn
        onBack={() => undefined}
        onSignIn={() => undefined}
        onSignUp={() => undefined}
        onRetryReviews={() => undefined}
        onSave={onSave}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Save game' }))
    fireEvent.click(screen.getByRole('button', { name: 'Log as completed' }))
    fireEvent.click(screen.getByRole('button', { name: 'Update library entry' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ status: 'completed' }))
  })

  it('sends hours only after they change, and rejects two decimal places', async () => {
    const onSave = vi.fn(async () => null)
    render(
      <GameDetail
        data={SIGNED_IN}
        reviews={REVIEWS}
        reviewsNote={null}
        signedIn
        onBack={() => undefined}
        onSignIn={() => undefined}
        onSignUp={() => undefined}
        onRetryReviews={() => undefined}
        onSave={onSave}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Save game' }))
    fireEvent.click(screen.getByRole('button', { name: 'Show library details' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Hours played' }), { target: { value: '12.55' } })
    fireEvent.click(screen.getByRole('button', { name: 'Update library entry' }))
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByText('Hours can have at most one decimal place').textContent)
      .toBe('Hours can have at most one decimal place')

    fireEvent.change(screen.getByRole('textbox', { name: 'Hours played' }), { target: { value: '20' } })
    fireEvent.click(screen.getByRole('button', { name: '100% achievements completed' }))
    fireEvent.click(screen.getByRole('button', { name: 'More times played' }))
    fireEvent.click(screen.getByRole('button', { name: 'Update library entry' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({
      status: 'playing',
      hours_played: 20,
      completed_all_achievements: true,
      play_count: 2,
    }))
  })

  it('pages and re-sorts written reviews', () => {
    const onReviewsQuery = vi.fn()
    render(
      <GameDetail
        data={{ ...DATA, stats: { ...DATA.stats, total_reviews: 12 } }}
        reviews={{ ...REVIEWS, total: 11, totalPages: 2 }}
        reviewsNote={null}
        reviewsQuery={{ page: 1, sort: 'date', order: 'desc' }}
        signedIn={false}
        onBack={() => undefined}
        onSignIn={() => undefined}
        onSignUp={() => undefined}
        onRetryReviews={() => undefined}
        onReviewsQuery={onReviewsQuery}
      />,
    )

    expect(screen.getByRole('button', { name: 'Sort reviews by date' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('button', { name: 'Sort reviews by rating' }).getAttribute('aria-selected')).toBe('false')
    expect(screen.getByRole('button', { name: 'Sort descending' }).textContent).toBe('Sort descending')
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(onReviewsQuery).toHaveBeenCalledWith({ page: 2, sort: 'date', order: 'desc' })
    fireEvent.click(screen.getByRole('button', { name: 'Sort reviews by rating' }))
    expect(onReviewsQuery).toHaveBeenCalledWith({ page: 1, sort: 'rating', order: 'desc' })
  })

  it('opens a screenshot in the app and does not leave for a browser', () => {
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

    expect(screen.queryByRole('link', { name: 'Open screenshot full size' })).toBeNull()
    expect(screen.queryByText('Open full size')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Screenshot 1 of 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close screenshot' }))
    expect(screen.queryByRole('button', { name: 'Close screenshot' })).toBeNull()
    expect(Linking.openURL).not.toHaveBeenCalled()
  })

  it('asks a signed-out player to sign up from Rate and refreshes when pulled', () => {
    const onSignUp = vi.fn()
    const onRefresh = vi.fn()
    render(
      <GameDetail
        data={DATA}
        reviews={REVIEWS}
        reviewsNote={null}
        signedIn={false}
        refreshing={false}
        onRefresh={onRefresh}
        onBack={() => undefined}
        onSignIn={() => undefined}
        onSignUp={onSignUp}
        onRetryReviews={() => undefined}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Rate' }))
    expect(screen.getByText('Sign up to rate, log, or list this game.').textContent)
      .toBe('Sign up to rate, log, or list this game.')
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(onSignUp).not.toHaveBeenCalled()
  })

  it('shows a listed list with a visible label, a selected state, and an accent border', () => {
    render(
      <GameDetail
        data={{ ...SIGNED_IN, viewer: { ...SIGNED_IN.viewer, listIdsGameIsIn: ['list-1'] } }}
        reviews={REVIEWS}
        reviewsNote={null}
        signedIn
        onBack={() => undefined}
        onSignIn={() => undefined}
        onSignUp={() => undefined}
        onRetryReviews={() => undefined}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Add to list' }))
    expect(screen.queryByRole('textbox', { name: 'New list name' })).toBeNull()
    const newer = screen.getByRole('button', { name: 'New list' })
    const accent = document.createElement('span')
    accent.style.backgroundColor = colors.accent
    accent.style.color = colors.accent
    expect(newer.style.backgroundColor).toBe(accent.style.backgroundColor)
    const listed = screen.getByRole('button', { name: 'Remove from Backlog' })
    expect(listed.textContent).toBe('Backlog · On this list')
    expect(listed.getAttribute('aria-selected')).toBe('true')
    expect(listed.style.borderColor).toBe(accent.style.color)
  })

  it('ignores a second press while a rating save is still pending', async () => {
    let release: (value: null) => void = () => undefined
    const onRate = vi.fn(() => new Promise<null>((resolve) => { release = resolve }))
    render(
      <GameDetail
        data={SIGNED_IN}
        reviews={REVIEWS}
        reviewsNote={null}
        signedIn
        onBack={() => undefined}
        onSignIn={() => undefined}
        onSignUp={() => undefined}
        onRetryReviews={() => undefined}
        onRate={onRate}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Rate' }))
    fireEvent.click(screen.getByRole('button', { name: 'Score 9' }))
    const submit = screen.getByRole('button', { name: 'Submit rating' })
    submit.click()
    submit.click()
    expect(onRate).toHaveBeenCalledTimes(1)
    release(null)
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Submit rating' })).toBeNull())
  })
})
