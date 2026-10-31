// @vitest-environment jsdom
import type { FeedItem } from '@screenpeak/shared/types'
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { FeedScreen, FeedSkeleton } from './feed-screen'

type A11y = {
  children?: React.ReactNode
  accessible?: boolean
  accessibilityLabel?: string
  accessibilityRole?: string
  accessibilityElementsHidden?: boolean
  role?: string
  onPress?: () => void
}

// Header and heading map to the DOM's heading role; a label shows only where the platform exposes it.
function a11y({ accessible, accessibilityLabel, accessibilityRole, accessibilityElementsHidden, role }: A11y) {
  const mapped = role ?? accessibilityRole
  return {
    role: mapped === 'header' ? 'heading' : mapped,
    'aria-label': accessible || mapped ? accessibilityLabel : undefined,
    'aria-hidden': accessibilityElementsHidden ? true : undefined,
  }
}

vi.mock('react-native', () => ({
  Platform: { OS: 'web' },
  View: (props: A11y) => React.createElement('div', a11y(props), props.children),
  Text: (props: A11y) => React.createElement('span', { ...a11y(props), onClick: props.onPress }, props.children),
  Pressable: (props: A11y) => React.createElement('button', { type: 'button', ...a11y(props), onClick: props.onPress }, props.children),
  ScrollView: (props: A11y) => React.createElement('div', null, props.children),
  ActivityIndicator: ({ accessibilityLabel }: A11y) => React.createElement('div', { role: 'progressbar', 'aria-label': accessibilityLabel }),
  FlatList: <T,>({ data, keyExtractor, renderItem, ListHeaderComponent, ListEmptyComponent, ListFooterComponent }: {
    data: T[]
    keyExtractor: (item: T) => string
    renderItem: (info: { item: T }) => React.ReactNode
    ListHeaderComponent?: React.ReactNode
    ListEmptyComponent?: React.ReactNode
    ListFooterComponent?: React.ReactNode
  }) => React.createElement(
    'div',
    null,
    ListHeaderComponent,
    data.length > 0
      ? data.map(item => React.createElement(React.Fragment, { key: keyExtractor(item) }, renderItem({ item })))
      : ListEmptyComponent,
    ListFooterComponent,
  ),
  useWindowDimensions: () => ({ width: 390, height: 844, scale: 1, fontScale: 1 }),
  StyleSheet: { create: (styles: unknown) => styles, absoluteFill: {} },
}))

vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: (props: A11y) => React.createElement('div', { 'aria-label': props.accessibilityLabel }, props.children),
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}))

vi.mock('expo-image', () => ({
  Image: () => null,
}))

afterEach(() => {
  cleanup()
})

const OPEN = vi.fn()
// Three hours after every fixture row.
const NOW = Date.parse('2026-10-01T03:00:00Z')

function feedItem(overrides: Partial<FeedItem>): FeedItem {
  return {
    activity_type: 'rating',
    created_at: '2026-10-01 00:00:00+00',
    actor_id: '22222222-2222-2222-2222-222222222222',
    actor_username: 'ada',
    actor_avatar_url: null,
    game_id: '11111111-1111-1111-1111-111111111111',
    game_name: 'Hades',
    game_slug: 'hades',
    game_cover_image_url: null,
    game_released: '2020-09-17',
    game_developer: 'Supergiant Games',
    game_avg_rating: 9,
    viewer_game_rating: null,
    list_cover_urls: null,
    list_id: null,
    list_name: null,
    list_description: null,
    list_owner_username: null,
    list_game_count: null,
    list_last_activity: null,
    list_like_count: null,
    viewer_liked_list: null,
    rating: 9,
    review: null,
    review_created_at: null,
    review_updated_at: null,
    library_status: null,
    library_game_count: null,
    library_cover_urls: null,
    library_game_names: null,
    ...overrides,
  }
}

const LIST_LIKED = feedItem({
  activity_type: 'list_liked',
  game_id: null,
  game_slug: null,
  game_name: null,
  game_released: null,
  game_developer: null,
  game_avg_rating: null,
  rating: null,
  list_id: 'list-1',
  list_name: 'Underworld',
  list_description: 'Games about getting out.',
  list_owner_username: 'bobby',
  list_game_count: 4,
  list_like_count: 3,
})

describe('feed', () => {
  it('shows the welcome screen when signed out, even if items were passed', () => {
    render(<FeedScreen signedIn={false} items={[feedItem({})]} onOpen={OPEN} />)
    expect(screen.getByRole('button', { name: 'Browse' }).textContent).toBe('Browse')
    expect(screen.queryByText('rated Hades a 9/10', { exact: false })).toBeNull()
  })

  it('says who did what and when, and opens the player and the game', () => {
    const onOpen = vi.fn()
    render(<FeedScreen signedIn items={[feedItem({})]} onOpen={onOpen} now={NOW} />)
    expect(screen.getByText('rated Hades a 9/10', { exact: false })).toBeTruthy()
    expect(screen.getByLabelText('3h ago')).toBeTruthy()
    expect(screen.getByText('2020 · Supergiant Games')).toBeTruthy()
    fireEvent.click(screen.getByRole('link', { name: 'ada' }))
    expect(onOpen).toHaveBeenLastCalledWith('/user/ada')
    fireEvent.click(screen.getByRole('link', { name: 'Hades' }))
    expect(onOpen).toHaveBeenLastCalledWith('/games/hades')
    expect(screen.queryByRole('button', { name: 'Browse' })).toBeNull()
  })

  it('opens a liked list on its owner and shows its likes and games', () => {
    const onOpen = vi.fn()
    render(<FeedScreen signedIn items={[LIST_LIKED]} onOpen={onOpen} now={NOW} />)
    expect(screen.getByText('liked "Underworld" by bobby', { exact: false })).toBeTruthy()
    expect(screen.getByText('Games about getting out.')).toBeTruthy()
    expect(screen.getByText('4 games')).toBeTruthy()
    expect(screen.getByLabelText('3 likes')).toBeTruthy()
    fireEvent.click(screen.getByRole('link', { name: 'Underworld' }))
    expect(onOpen).toHaveBeenCalledWith('/user/bobby/lists/list-1')
  })

  it('opens a batch of library adds on that player\'s library', () => {
    const onOpen = vi.fn()
    render(<FeedScreen signedIn items={[feedItem({
      activity_type: 'library_add_batch',
      game_id: null,
      game_slug: null,
      game_name: null,
      rating: null,
      library_game_count: 14,
      library_cover_urls: ['https://images.igdb.com/igdb/image/upload/t_cover_small/a.jpg'],
    })]} onOpen={onOpen} now={NOW} />)
    expect(screen.getByText('added 14 games to their library', { exact: false })).toBeTruthy()
    fireEvent.click(screen.getByRole('link', { name: "ada's library" }))
    expect(onOpen).toHaveBeenCalledWith('/user/ada/library')
  })

  it('clamps a long review until the player asks for the rest', () => {
    const review = 'A run-based descent that keeps finding new things to say. '.repeat(5).trim()
    render(<FeedScreen signedIn items={[feedItem({ activity_type: 'review', review })]} onOpen={OPEN} now={NOW} />)
    expect(screen.getByText(review)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Read more' }))
    expect(screen.getByRole('button', { name: 'Show less' })).toBeTruthy()
  })

  it('shows a short review without a toggle', () => {
    render(<FeedScreen signedIn items={[feedItem({ activity_type: 'review', review: 'Loved it.' })]} onOpen={OPEN} now={NOW} />)
    expect(screen.getByText('Loved it.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Read more' })).toBeNull()
  })

  it('invites the player to follow people when there is no activity', () => {
    const onOpen = vi.fn()
    render(<FeedScreen signedIn items={[]} onOpen={onOpen} />)
    expect(screen.getByRole('heading', { name: 'Your feed is quiet' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Find people to follow' }))
    expect(onOpen).toHaveBeenCalledWith('/explore')
  })

  it('shows the next page loading, and a failed page with Retry', () => {
    const onLoadMore = vi.fn()
    const { rerender } = render(
      <FeedScreen signedIn items={[feedItem({})]} onOpen={OPEN} hasMore loadingMore onLoadMore={onLoadMore} />,
    )
    expect(screen.getByLabelText('Loading more activity')).toBeTruthy()
    rerender(
      <FeedScreen signedIn items={[feedItem({})]} onOpen={OPEN} hasMore loadMoreError="Too many requests. Try again in 5 seconds." onLoadMore={onLoadMore} />,
    )
    expect(screen.queryByLabelText('Loading more activity')).toBeNull()
    expect(screen.getByText('Too many requests. Try again in 5 seconds.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onLoadMore).toHaveBeenCalledOnce()
  })

  it('keeps the loaded activity when a refresh fails', () => {
    const onRetry = vi.fn()
    render(<FeedScreen signedIn items={[feedItem({})]} onOpen={OPEN} refreshError="Network request failed" onRetry={onRetry} />)
    expect(screen.getByText('Network request failed')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Hades' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('has a loading skeleton', () => {
    render(<FeedSkeleton />)
    expect(screen.getByLabelText('Loading feed')).toBeTruthy()
  })
})
