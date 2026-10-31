// @vitest-environment jsdom
import type { GameCardData, GamesListPage } from '@screenpeak/shared/api/games'
import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CATALOGUE_QUERY } from '@/lib/catalogue-page'

import { CatalogueScreen, CatalogueSkeleton, type CatalogueScreenProps } from './catalogue-screen'
import { TAXONOMY_SEARCH_DELAY_MS } from './filter-controls'

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
  View: ({ children, accessibilityLabel }: { children?: React.ReactNode, accessibilityLabel?: string }) =>
    React.createElement('div', { 'aria-label': accessibilityLabel }, children),
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
    data: GameCardData[]
    renderItem: (info: { item: GameCardData }) => React.ReactNode
    keyExtractor: (item: GameCardData) => string
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
  vi.useRealTimers()
})

const HADES: GameCardData = {
  id: 'g-hades',
  name: 'Hades',
  slug: 'hades',
  cover_image_url: null,
  released: '2020-09-17',
  developer: 'Supergiant Games',
  avg_rating: 9,
  user_rating: 8,
}

const CELESTE: GameCardData = { ...HADES, id: 'g-celeste', name: 'Celeste', slug: 'celeste', developer: 'Extremely OK', released: '2018-01-25' }

const FACETS: CatalogueScreenProps['facets'] = {
  genres: [{ id: 'genre-1', name: 'Roguelike', slug: 'roguelike' }, { id: 'genre-2', name: 'Platform', slug: 'platform' }],
  platforms: [{ id: 'platform-1', name: 'PC (Windows)', slug: 'win' }],
  esrb_ratings: ['Teen', 'Mature'],
  filter_names: { developer: null, publisher: null } satisfies GamesListPage['filter_names'],
}

function renderScreen(props: Partial<CatalogueScreenProps> = {}) {
  const onQuery = vi.fn()
  const onOpen = vi.fn()
  const onLoadMore = vi.fn()
  const onRetry = vi.fn()
  const searchTaxonomy = vi.fn(async () => ({ hits: [] }))
  render(
    <CatalogueScreen
      games={[HADES, CELESTE]}
      total={2}
      query={CATALOGUE_QUERY}
      facets={FACETS}
      onQuery={onQuery}
      onOpen={onOpen}
      onBack={() => undefined}
      searchTaxonomy={searchTaxonomy}
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
  return { onQuery, onOpen, onLoadMore, onRetry, searchTaxonomy }
}

describe('catalogue', () => {
  it('shows the count and each game as a link to its page', () => {
    const { onOpen } = renderScreen({ total: 812 })
    expect(screen.getByRole('heading', { name: 'Games' }).textContent).toBe('Games')
    expect(screen.getByText('812 games').textContent).toBe('812 games')
    expect(screen.getByRole('link', { name: 'Hades' }).textContent).toContain('Supergiant Games')
    fireEvent.click(screen.getByRole('link', { name: 'Celeste' }))
    expect(onOpen).toHaveBeenCalledWith('/games/celeste')
  })

  it('sorts by score from the high end, then flips the direction', () => {
    const { onQuery } = renderScreen()
    fireEvent.click(screen.getByRole('button', { name: 'Sort: Name' }))
    fireEvent.click(screen.getByRole('button', { name: 'ScreenPeak rating' }))
    expect(onQuery).toHaveBeenLastCalledWith({ ...CATALOGUE_QUERY, sort: 'ngplus_rating', order: 'desc' })
    fireEvent.click(screen.getByRole('button', { name: 'Sort ascending — tap for descending' }))
    expect(onQuery).toHaveBeenLastCalledWith({ ...CATALOGUE_QUERY, order: 'desc' })
  })

  it('searches by name and clears the search when the field is empty', () => {
    const { onQuery } = renderScreen()
    fireEvent.change(screen.getByLabelText('Search games'), { target: { value: '  hades ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect(onQuery).toHaveBeenLastCalledWith({ ...CATALOGUE_QUERY, q: 'hades' })
    fireEvent.change(screen.getByLabelText('Search games'), { target: { value: ' ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect(onQuery).toHaveBeenLastCalledWith({ ...CATALOGUE_QUERY, q: null })
  })

  it('filters by genre, platform, and ESRB from the Filters sheet', () => {
    const { onQuery } = renderScreen()
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    fireEvent.click(screen.getByRole('button', { name: 'Genre: 0 selected' }))
    fireEvent.change(screen.getByLabelText('Search genre'), { target: { value: 'rogue' } })
    expect(screen.queryByRole('button', { name: 'Platform' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Roguelike' }))
    expect(onQuery).toHaveBeenLastCalledWith({ ...CATALOGUE_QUERY, genre: 'roguelike' })
    fireEvent.click(screen.getByRole('button', { name: 'ESRB: 0 selected' }))
    fireEvent.click(screen.getByRole('button', { name: 'Mature' }))
    expect(onQuery).toHaveBeenLastCalledWith({ ...CATALOGUE_QUERY, esrb: 'Mature' })
  })

  it('searches developers once typing pauses and filters by the one picked', async () => {
    vi.useFakeTimers()
    const searchTaxonomy = vi.fn(async (table: string, q: string) => ({
      hits: table === 'developers' && q === 'super' ? [{ id: 'd1', name: 'Supergiant Games', slug: 'supergiant' }] : [],
    }))
    const { onQuery } = renderScreen({ searchTaxonomy })
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    fireEvent.click(screen.getByRole('button', { name: 'Developer: Any' }))
    fireEvent.change(screen.getByLabelText('Search developer'), { target: { value: 'sup' } })
    fireEvent.change(screen.getByLabelText('Search developer'), { target: { value: 'super' } })
    expect(screen.getByRole('progressbar', { name: 'Searching developer' })).toBeTruthy()
    await act(async () => { await vi.advanceTimersByTimeAsync(TAXONOMY_SEARCH_DELAY_MS) })
    expect(searchTaxonomy.mock.calls).toEqual([['developers', 'super']])
    fireEvent.click(screen.getByRole('button', { name: 'Supergiant Games' }))
    expect(onQuery).toHaveBeenLastCalledWith({ ...CATALOGUE_QUERY, developer: 'supergiant' })
  })

  it('says why a publisher search failed', async () => {
    vi.useFakeTimers()
    renderScreen({ searchTaxonomy: async () => ({ error: 'Too many searches. Try again in 30 seconds.' }) })
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    fireEvent.click(screen.getByRole('button', { name: 'Publisher: Any' }))
    fireEvent.change(screen.getByLabelText('Search publisher'), { target: { value: 'dev' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(TAXONOMY_SEARCH_DELAY_MS) })
    expect(screen.getByText('Too many searches. Try again in 30 seconds.').textContent).toBe('Too many searches. Try again in 30 seconds.')
  })

  it('names the active filters as chips, removes one, and clears them all', () => {
    const query = { ...CATALOGUE_QUERY, genre: 'roguelike', developer: 'supergiant' }
    const { onQuery } = renderScreen({
      query,
      facets: { ...FACETS, filter_names: { developer: 'Supergiant Games', publisher: null } },
    })
    expect(screen.getByRole('button', { name: 'Remove Developer: Supergiant Games' }).textContent).toContain('Developer: Supergiant Games')
    fireEvent.click(screen.getByRole('button', { name: 'Remove Genre: Roguelike' }))
    expect(onQuery).toHaveBeenLastCalledWith({ ...CATALOGUE_QUERY, developer: 'supergiant' })
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(onQuery).toHaveBeenLastCalledWith({ ...CATALOGUE_QUERY, sort: query.sort, order: query.order })
  })

  it('offers to clear the filters when nothing matches', () => {
    const { onQuery } = renderScreen({ games: [], total: 0, query: { ...CATALOGUE_QUERY, q: 'zzz', sort: 'ngplus_rating', order: 'desc' } })
    expect(screen.getByText('No games found').textContent).toBe('No games found')
    expect(screen.getByText('Try a different search or filter.').textContent).toBe('Try a different search or filter.')
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(onQuery).toHaveBeenLastCalledWith({ ...CATALOGUE_QUERY, sort: 'ngplus_rating', order: 'desc' })
  })

  it('loads the next page at the end of the list only while there is one', () => {
    const more = renderScreen({ hasMore: true })
    fireEvent.click(screen.getByRole('button', { name: 'end of list' }))
    expect(more.onLoadMore).toHaveBeenCalledTimes(1)
    cleanup()
    const loading = renderScreen({ hasMore: true, loadingMore: true })
    expect(screen.getByRole('progressbar', { name: 'Loading more games' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'end of list' }))
    expect(loading.onLoadMore).not.toHaveBeenCalled()
  })

  it('keeps the games when the next page or a refresh fails', () => {
    const { onLoadMore, onRetry } = renderScreen({
      hasMore: true,
      loadMoreError: "Couldn't load more games.",
      refreshError: "Couldn't refresh.",
    })
    expect(screen.getByRole('link', { name: 'Hades' })).toBeTruthy()
    expect(screen.getByText("Couldn't load more games.").textContent).toBe("Couldn't load more games.")
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading more' }))
    expect(onLoadMore).toHaveBeenCalledTimes(1)
    expect(screen.getByText("Couldn't refresh.").textContent).toBe("Couldn't refresh.")
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('says the results are updating while a new filter loads over the old grid', () => {
    renderScreen({ total: 812, updating: true })
    expect(screen.getByText('Updating results').textContent).toBe('Updating results')
    expect(screen.queryByText('812 games')).toBeNull()
    expect(screen.getByRole('link', { name: 'Hades' })).toBeTruthy()
  })

  it('has a loading skeleton', () => {
    render(<CatalogueSkeleton onBack={() => undefined} />)
    expect(screen.getByLabelText('Loading games')).toBeTruthy()
  })
})
