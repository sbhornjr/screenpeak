// @vitest-environment jsdom
import type { ExplorePageData } from '@screenpeak/shared/api/explore'
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ExploreScreen, ExploreSkeleton, type ExploreScreenProps } from './explore-screen'

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
    accessibilityElementsHidden,
  }: {
    onPress?: () => void
    children?: React.ReactNode | ((state: { pressed: boolean }) => React.ReactNode)
    accessibilityLabel?: string
    accessibilityRole?: string
    accessibilityState?: { selected?: boolean }
    accessibilityElementsHidden?: boolean
  }) => React.createElement(
    'button',
    {
      type: 'button',
      onClick: onPress,
      'aria-label': accessibilityLabel,
      'aria-hidden': accessibilityElementsHidden ? 'true' : undefined,
      role: accessibilityRole ?? 'button',
      'aria-selected': accessibilityState?.selected ? 'true' : undefined,
    },
    typeof children === 'function' ? children({ pressed: false }) : children,
  ),
  View: ({ children, accessibilityLabel, accessible, role }: {
    children?: React.ReactNode
    accessibilityLabel?: string
    accessible?: boolean
    role?: string
  }) => React.createElement('div', { 'aria-label': accessibilityLabel, role: role ?? (accessible && accessibilityLabel ? 'group' : undefined) }, children),
  Text: ({ children, accessibilityRole }: { children?: React.ReactNode, accessibilityRole?: string }) =>
    React.createElement('span', { role: accessibilityRole === 'header' ? 'heading' : undefined }, children),
  ActivityIndicator: ({ accessibilityLabel }: { accessibilityLabel?: string }) =>
    React.createElement('div', { role: 'progressbar', 'aria-label': accessibilityLabel }),
  ScrollView: ({ children, horizontal, accessibilityLabel }: { children?: React.ReactNode, horizontal?: boolean, accessibilityLabel?: string }) =>
    React.createElement('div', { 'data-horizontal': horizontal ? 'true' : undefined, 'aria-label': accessibilityLabel }, children),
  RefreshControl: () => null,
  Modal: ({ visible, children }: { visible?: boolean, children?: React.ReactNode }) => (
    visible ? React.createElement('div', null, children) : null
  ),
  TextInput: ({
    accessibilityLabel,
    value,
    onChangeText,
    placeholder,
  }: {
    accessibilityLabel?: string
    value?: string
    onChangeText?: (value: string) => void
    placeholder?: string
  }) => React.createElement('input', {
    'aria-label': accessibilityLabel,
    placeholder,
    value: value ?? '',
    onChange: (event: { target: { value: string } }) => onChangeText?.(event.target.value),
  }),
  Keyboard: { addListener: () => ({ remove() {} }) },
  useWindowDimensions: () => ({ width: 375, height: 667, scale: 1, fontScale: 1 }),
  StyleSheet: { create: (styles: unknown) => styles, absoluteFill: {} },
}))

afterEach(() => {
  cleanup()
})

const EXPLORE: ExplorePageData = {
  range: 'week',
  trending_games: [{
    id: 'g-celeste',
    name: 'Celeste',
    slug: 'celeste',
    cover_image_url: null,
    released: '2018-01-25',
    developer: 'Extremely OK',
    avg_rating: 9,
    user_rating: null,
  }],
  trending_lists: [{
    id: 'list-trend',
    name: 'Peak climbs',
    description: 'Mountains, mostly.',
    owner_username: 'mina',
    last_activity: '2026-10-01 00:00:00+00',
    game_count: 3,
    like_count: 2,
    viewer_has_liked: false,
    covers: [],
  }, {
    id: 'list-mine',
    name: 'My shelf',
    description: '',
    owner_username: 'peek',
    last_activity: '2026-10-01 00:00:00+00',
    game_count: 1,
    like_count: 4,
    viewer_has_liked: false,
    covers: [],
  }],
  recommendations: {
    games: [{
      id: 'g-hades',
      name: 'Hades',
      slug: 'hades',
      cover_image_url: null,
      released: '2020-09-17',
      developer: 'Supergiant Games',
      avg_rating: 9,
      user_rating: null,
      avg_follower_rating: 8.5,
      follower_count: 2,
      library_status: 'backlog',
    }],
    lists: [{
      id: 'list-rec',
      name: 'Underworld',
      description: '',
      owner_username: 'ada',
      last_activity: '2026-10-01 00:00:00+00',
      game_count: 4,
      like_count: 1,
      viewer_has_liked: false,
      covers: [],
      follower_like_count: 1,
    }],
    users: [{
      id: 'user-ada',
      username: 'ada',
      avatar_url: null,
      selected_title: 'Ranger',
      created_at: '2026-01-05 00:00:00+00',
      mutual_follower_count: 3,
      follower_count: 4,
      following_count: 2,
      game_count: 10,
      avg_rating: 8,
    }],
  },
  viewer: { id: 'viewer' },
}

const SIGNED_OUT: ExplorePageData = { ...EXPLORE, recommendations: null, viewer: null }

function renderScreen(props: Partial<ExploreScreenProps> = {}) {
  const onOpen = vi.fn()
  const onSearch = vi.fn()
  const onRange = vi.fn()
  const onLike = vi.fn(async () => null as string | null)
  render(
    <ExploreScreen
      data={EXPLORE}
      range="week"
      genres={[{ id: 'genre-1', name: 'Roguelike', slug: 'roguelike' }]}
      platforms={[{ id: 'platform-1', name: 'PC (Windows)', slug: 'win' }]}
      results={null}
      searchedFor={null}
      searching={false}
      searchError={null}
      onSearch={onSearch}
      onOpen={onOpen}
      onRange={onRange}
      viewerUsername="peek"
      onLike={onLike}
      {...props}
    />,
  )
  return { onOpen, onSearch, onRange, onLike }
}

describe('explore', () => {
  it('searches by name and opens a hit or every match in the catalogue', () => {
    const { onSearch, onOpen } = renderScreen({
      results: [{ id: 'g-hades', name: 'Hades', slug: 'hades', cover_image_url: null, released: '2020-09-17', avg_rating: 9 }],
      searchedFor: 'hades',
    })
    fireEvent.change(screen.getByLabelText('Search games'), { target: { value: ' Hades ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect(onSearch).toHaveBeenCalledWith('Hades')
    expect(screen.getByRole('link', { name: 'Hades, 2020' }).textContent).toContain('2020')
    fireEvent.click(screen.getByRole('link', { name: 'Hades, 2020' }))
    expect(onOpen).toHaveBeenLastCalledWith('/games/hades')
    fireEvent.click(screen.getByRole('button', { name: 'Browse all games matching "hades"' }))
    expect(onOpen).toHaveBeenLastCalledWith('/games?q=hades')
  })

  it('opens the whole catalogue from under the search bar before any search', () => {
    const { onOpen } = renderScreen()
    const [top, bottom] = screen.getAllByRole('button', { name: 'Browse all' })
    fireEvent.click(top)
    expect(onOpen).toHaveBeenLastCalledWith('/games')
    fireEvent.click(bottom)
    expect(onOpen).toHaveBeenLastCalledWith('/games')
  })

  it('asks for a name instead of searching nothing, and says when nothing matches', () => {
    const { onSearch } = renderScreen({ results: [], searchedFor: 'zzz' })
    expect(screen.getByText('No games match "zzz".').textContent).toBe('No games match "zzz".')
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect(onSearch).not.toHaveBeenCalled()
    expect(screen.getByText('Type a game name.').textContent).toBe('Type a game name.')
  })

  it('shows the chosen range and switches it', () => {
    const { onRange } = renderScreen({ range: 'month' })
    expect(screen.getByRole('button', { name: 'This month' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('button', { name: 'This week' }).getAttribute('aria-selected')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'All time' }))
    expect(onRange).toHaveBeenCalledWith('alltime')
  })

  it('shows what is peaking as game cards and trending lists as list cards', () => {
    const { onOpen } = renderScreen()
    expect(screen.getByRole('heading', { name: 'Peak right now' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Celeste' }).textContent).toContain('Extremely OK')
    fireEvent.click(screen.getByRole('link', { name: 'Celeste' }))
    expect(onOpen).toHaveBeenLastCalledWith('/games/celeste')
    expect(screen.getByRole('heading', { name: 'Lists peaking now' })).toBeTruthy()
    expect(screen.getByText('Mountains, mostly.').textContent).toBe('Mountains, mostly.')
    fireEvent.click(screen.getByRole('link', { name: 'Peak climbs' }))
    expect(onOpen).toHaveBeenLastCalledWith('/user/mina/lists/list-trend')
    fireEvent.click(screen.getByRole('link', { name: 'mina' }))
    expect(onOpen).toHaveBeenLastCalledWith('/user/mina')
  })

  it('likes someone else’s list but only counts the likes on your own', async () => {
    const { onLike } = renderScreen()
    fireEvent.click(screen.getByRole('button', { name: 'Like list, 2 likes' }))
    await waitFor(() => expect(onLike).toHaveBeenCalledWith('list-trend', true))
    expect(screen.queryByRole('button', { name: /Like list, 4 likes/ })).toBeNull()
    expect(screen.getByLabelText('4 likes')).toBeTruthy()
  })

  it('says why a like failed', async () => {
    renderScreen({ onLike: async () => 'Too many requests. Try again in 30 seconds.' })
    fireEvent.click(screen.getByRole('button', { name: 'Like list, 2 likes' }))
    expect((await screen.findByText('Too many requests. Try again in 30 seconds.')).textContent)
      .toBe('Too many requests. Try again in 30 seconds.')
  })

  it('recommends games, lists, and players from the people you follow', () => {
    const { onOpen } = renderScreen()
    expect(screen.getByText('Follow more users to get more recommendations.')).toBeTruthy()
    expect(screen.getByText('2 followers completed · 8.5/10 avg').textContent).toBe('2 followers completed · 8.5/10 avg')
    expect(screen.getByText('In your backlog').textContent).toBe('In your backlog')
    fireEvent.click(screen.getByRole('link', { name: 'Hades' }))
    expect(onOpen).toHaveBeenLastCalledWith('/games/hades')
    expect(screen.getByText('1 user you follow liked this').textContent).toBe('1 user you follow liked this')
    fireEvent.click(screen.getByRole('link', { name: 'Underworld' }))
    expect(onOpen).toHaveBeenLastCalledWith('/user/ada/lists/list-rec')
    expect(screen.getByText('Followed by 3 users you follow').textContent).toBe('Followed by 3 users you follow')
    const player = screen.getByRole('link', { name: 'ada, Ranger' })
    expect(player.textContent).toContain('4 followers · 2 following')
    expect(player.textContent).toContain('10')
    fireEvent.click(player)
    expect(onOpen).toHaveBeenLastCalledWith('/user/ada')
  })

  it('says when there is nothing to recommend yet', () => {
    renderScreen({ data: { ...EXPLORE, recommendations: { games: [], lists: [], users: [] } } })
    expect(screen.getByText('No recommendations yet.').textContent).toBe('No recommendations yet.')
  })

  it('asks a signed-out player to sign up instead of recommending', () => {
    const { onOpen } = renderScreen({ data: SIGNED_OUT, viewerUsername: null })
    expect(screen.getByText('Sign up to see what people you follow are playing.')).toBeTruthy()
    expect(screen.queryByText('Follow more users to get more recommendations.')).toBeNull()
    expect(screen.getByLabelText('2 likes')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }))
    expect(onOpen).toHaveBeenLastCalledWith('/sign-up')
  })

  it('says when nothing is trending in the range', () => {
    renderScreen({ data: { ...SIGNED_OUT, trending_games: [], trending_lists: [] } })
    expect(screen.getByText('Nothing peaking this week.').textContent).toBe('Nothing peaking this week.')
    expect(screen.getByText('No lists peaking this week.').textContent).toBe('No lists peaking this week.')
  })

  it('browses the catalogue by genre or platform from a dropdown', () => {
    const { onOpen } = renderScreen({
      genres: [{ id: 'genre-1', name: 'Roguelike', slug: 'roguelike' }, { id: 'genre-2', name: 'Shooter', slug: 'shooter' }],
    })
    expect(screen.queryByRole('button', { name: 'Browse Roguelike' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Browse by genre' }))
    fireEvent.change(screen.getByLabelText('Search genres'), { target: { value: 'shoot' } })
    expect(screen.queryByRole('button', { name: 'Browse Roguelike' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Browse Shooter' }))
    expect(onOpen).toHaveBeenLastCalledWith('/games?genre=shooter')
    expect(screen.queryByRole('button', { name: 'Browse Shooter' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Browse by platform' }))
    fireEvent.click(screen.getByRole('button', { name: 'Browse PC (Windows)' }))
    expect(onOpen).toHaveBeenLastCalledWith('/games?platform=win')
  })

  it('says the range is updating while it loads over the old one', () => {
    renderScreen({ updating: true })
    expect(screen.getByRole('progressbar', { name: 'Updating Explore' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Celeste' })).toBeTruthy()
  })

  it('keeps the page when a refresh fails and offers Retry', () => {
    const onRetry = vi.fn()
    renderScreen({ refreshError: "Couldn't refresh.", onRetry })
    expect(screen.getByText("Couldn't refresh.").textContent).toBe("Couldn't refresh.")
    expect(screen.getByRole('link', { name: 'Celeste' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('has a loading skeleton', () => {
    render(<ExploreSkeleton />)
    expect(screen.getByLabelText('Loading Explore')).toBeTruthy()
  })
})
