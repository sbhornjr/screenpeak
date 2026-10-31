// @vitest-environment jsdom
import type { UserReviewItem } from '@screenpeak/shared/api/user-reviews'
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { RATINGS_QUERY } from '@/lib/ratings-page'

import { RatingsScreen, RatingsSkeleton, type RatingsScreenProps } from './ratings-screen'

vi.mock('expo-image', () => ({
  Image: () => null,
}))

vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children, accessibilityLabel }: { children?: React.ReactNode, accessibilityLabel?: string }) =>
    React.createElement('div', { 'aria-label': accessibilityLabel }, children),
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}))

vi.mock('react-native', () => ({
  Platform: { OS: 'web' },
  Pressable: ({
    onPress,
    children,
    accessibilityLabel,
    accessibilityRole,
    accessibilityState,
  }: {
    onPress?: () => void
    children?: React.ReactNode | ((state: { pressed: boolean }) => React.ReactNode)
    accessibilityLabel?: string
    accessibilityRole?: string
    accessibilityState?: { selected?: boolean }
  }) => React.createElement(
    'button',
    {
      type: 'button',
      onClick: onPress,
      'aria-label': accessibilityLabel,
      role: accessibilityRole ?? 'button',
      'aria-selected': accessibilityState?.selected ? 'true' : undefined,
    },
    typeof children === 'function' ? children({ pressed: false }) : children,
  ),
  View: ({ children, accessibilityLabel, role }: { children?: React.ReactNode, accessibilityLabel?: string, role?: string }) =>
    React.createElement('div', { 'aria-label': accessibilityLabel, role }, children),
  Text: ({ children, accessibilityRole }: { children?: React.ReactNode, accessibilityRole?: string }) =>
    React.createElement('span', { role: accessibilityRole === 'header' ? 'heading' : undefined }, children),
  ActivityIndicator: ({ accessibilityLabel }: { accessibilityLabel?: string }) =>
    React.createElement('div', { role: 'progressbar', 'aria-label': accessibilityLabel }),
  FlatList: ({
    data,
    renderItem,
    keyExtractor,
    ListHeaderComponent,
    ListEmptyComponent,
    ListFooterComponent,
    onEndReached,
  }: {
    data: UserReviewItem[]
    renderItem: (info: { item: UserReviewItem }) => React.ReactNode
    keyExtractor: (item: UserReviewItem) => string
    ListHeaderComponent?: React.ReactNode
    ListEmptyComponent?: React.ReactNode
    ListFooterComponent?: React.ReactNode
    onEndReached?: () => void
  }) => React.createElement(
    'div',
    null,
    ListHeaderComponent,
    data.length === 0 ? ListEmptyComponent : data.map(item => React.createElement(React.Fragment, { key: keyExtractor(item) }, renderItem({ item }))),
    ListFooterComponent,
    React.createElement('button', { type: 'button', onClick: onEndReached }, 'end of list'),
  ),
  Modal: ({ visible, children }: { visible?: boolean, children?: React.ReactNode }) => (
    visible ? React.createElement('div', null, children) : null
  ),
  ScrollView: ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children),
  RefreshControl: () => null,
  Keyboard: { addListener: () => ({ remove() {} }) },
  useWindowDimensions: () => ({ width: 375, height: 667, scale: 1, fontScale: 1 }),
  StyleSheet: { create: (styles: unknown) => styles, absoluteFill: {} },
}))

afterEach(() => {
  cleanup()
})

const HADES: UserReviewItem = {
  game_id: 'g-hades',
  game_name: 'Hades',
  game_slug: 'hades',
  cover_image_url: null,
  released: '2020-09-17',
  developer: 'Supergiant Games',
  rating: 9,
  review: '',
  updated_at: '2026-10-01 12:00:00+00',
}

const LONG = 'A descent that keeps finding new things to say about the same four rooms, and every return trip lands differently '
  + 'because the build in your hands changed. It earns the replay it asks for, over and over, until the credits stop meaning the end.'

const CELESTE: UserReviewItem = { ...HADES, game_id: 'g-celeste', game_name: 'Celeste', game_slug: 'celeste', rating: 6, review: LONG }

function renderScreen(props: Partial<RatingsScreenProps> = {}) {
  const onQuery = vi.fn()
  const onOpen = vi.fn()
  const onBack = vi.fn()
  const onLoadMore = vi.fn()
  const onRetry = vi.fn()
  render(
    <RatingsScreen
      username="ada"
      counts={{ total_count: 2, review_count: 1, rating_count: 1 }}
      items={[HADES, CELESTE]}
      query={RATINGS_QUERY}
      onQuery={onQuery}
      onOpen={onOpen}
      onBack={onBack}
      hasMore={false}
      loadingMore={false}
      loadMoreError={null}
      onLoadMore={onLoadMore}
      refreshing={false}
      onRefresh={() => undefined}
      refreshError={null}
      onRetry={onRetry}
      {...props}
    />,
  )
  return { onQuery, onOpen, onBack, onLoadMore, onRetry }
}

describe('ratings and reviews', () => {
  it('names the player, counts their ratings, and goes back to the profile', () => {
    const { onOpen } = renderScreen()
    expect(screen.getByRole('heading', { name: "ada's Ratings & Reviews" })).toBeTruthy()
    expect(screen.getByText('1 rating / 1 review / 2 total').textContent).toBe('1 rating / 1 review / 2 total')
    fireEvent.click(screen.getByRole('link', { name: "ada's profile" }))
    expect(onOpen).toHaveBeenLastCalledWith('/user/ada')
  })

  it('shows a score-only rating as one line that opens the game', () => {
    const { onOpen } = renderScreen()
    const row = screen.getByRole('link', { name: 'Hades, 9 out of 10' })
    expect(row.textContent).toContain('2020')
    expect(row.textContent).toContain('Supergiant Games')
    expect(row.textContent).toContain('Oct 1, 2026')
    fireEvent.click(row)
    expect(onOpen).toHaveBeenLastCalledWith('/games/hades')
  })

  it('shows a written review with its score and clamps a long one behind Read more', () => {
    const { onOpen } = renderScreen()
    fireEvent.click(screen.getByRole('link', { name: 'Celeste, 6 out of 10' }))
    expect(onOpen).toHaveBeenLastCalledWith('/games/celeste')
    expect(screen.getByText(LONG).textContent).toBe(LONG)
    fireEvent.click(screen.getByRole('button', { name: 'Read more' }))
    expect(screen.getByRole('button', { name: 'Show less' })).toBeTruthy()
  })

  it('shows only reviews or only ratings, and sorts by rating from the top', () => {
    const { onQuery } = renderScreen()
    fireEvent.click(screen.getByRole('button', { name: 'Show: All' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reviews' }))
    expect(onQuery).toHaveBeenLastCalledWith({ ...RATINGS_QUERY, filter: 'reviews' })
    fireEvent.click(screen.getByRole('button', { name: 'Sort: Date' }))
    fireEvent.click(screen.getByRole('button', { name: 'Rating' }))
    expect(onQuery).toHaveBeenLastCalledWith({ ...RATINGS_QUERY, sort: 'rating', order: 'desc' })
    fireEvent.click(screen.getByRole('button', { name: 'Sort descending — tap for ascending' }))
    expect(onQuery).toHaveBeenLastCalledWith({ ...RATINGS_QUERY, order: 'asc' })
  })

  it('keeps Show and Sort when a filter matches nothing, so you can switch back', () => {
    const { onQuery } = renderScreen({ items: [], query: { ...RATINGS_QUERY, filter: 'reviews' } })
    expect(screen.getByText('No written reviews yet.').textContent).toBe('No written reviews yet.')
    fireEvent.click(screen.getByRole('button', { name: 'Show: Reviews' }))
    fireEvent.click(screen.getByRole('button', { name: 'All' }))
    expect(onQuery).toHaveBeenLastCalledWith(RATINGS_QUERY)
  })

  it('says when a player has rated nothing', () => {
    renderScreen({ items: [], counts: { total_count: 0, review_count: 0, rating_count: 0 } })
    expect(screen.getByText('No ratings yet.').textContent).toBe('No ratings yet.')
    expect(screen.getByText('Games ada rates show up here.').textContent).toBe('Games ada rates show up here.')
  })

  it('loads the next page at the end of the list only while there is one', () => {
    const more = renderScreen({ hasMore: true })
    fireEvent.click(screen.getByRole('button', { name: 'end of list' }))
    expect(more.onLoadMore).toHaveBeenCalledTimes(1)
    cleanup()
    const loading = renderScreen({ hasMore: true, loadingMore: true })
    expect(screen.getByRole('progressbar', { name: 'Loading more ratings' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'end of list' }))
    expect(loading.onLoadMore).not.toHaveBeenCalled()
  })

  it('keeps the rows when the next page or a refresh fails', () => {
    const { onLoadMore, onRetry } = renderScreen({
      hasMore: true,
      loadMoreError: "Couldn't load more.",
      refreshError: "Couldn't refresh.",
    })
    expect(screen.getByRole('link', { name: 'Hades, 9 out of 10' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading more' }))
    expect(onLoadMore).toHaveBeenCalledTimes(1)
    expect(screen.getByText("Couldn't refresh.").textContent).toBe("Couldn't refresh.")
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('says the rows are updating while a new choice loads over the old ones', () => {
    renderScreen({ updating: true })
    expect(screen.getByRole('progressbar', { name: 'Updating ratings' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Hades, 9 out of 10' })).toBeTruthy()
  })

  it('has a loading skeleton', () => {
    render(<RatingsSkeleton onBack={() => undefined} />)
    expect(screen.getByLabelText('Loading ratings')).toBeTruthy()
  })
})
