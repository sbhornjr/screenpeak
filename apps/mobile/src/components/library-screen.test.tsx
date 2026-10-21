// @vitest-environment jsdom
import type { LibraryGameCard, LibraryPageData, LibraryQuery } from '@screenpeak/shared/api/library'
import { hitTarget, space } from '@screenpeak/shared/tokens'
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { LIBRARY_QUERY } from '@/lib/library-page'

import { LibraryScreen } from './library-screen'

vi.mock('expo-image', () => ({
  Image: () => null,
}))

vi.mock('lucide-react-native', () => {
  function Icon() {
    return React.createElement('span', { 'aria-hidden': 'true' })
  }
  return {
    ArrowDownWideNarrow: Icon,
    ArrowUpNarrowWide: Icon,
    ChevronDown: Icon,
    Clock: Icon,
    Pencil: Icon,
    Repeat: Icon,
    SlidersHorizontal: Icon,
    Trophy: Icon,
  }
})

const viewport = vi.hoisted(() => ({ width: 375, height: 667 }))

vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children),
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}))

function flatStyle(style: unknown): Record<string, unknown> {
  if (!style) return {}
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flatStyle))
  if (typeof style === 'function') return flatStyle((style as (state: { pressed: boolean }) => unknown)({ pressed: false }))
  return style as Record<string, unknown>
}

vi.mock('react-native', () => ({
  Platform: { OS: 'web' },
  Pressable: ({
    onPress,
    children,
    accessibilityLabel,
    accessibilityRole,
    accessibilityState,
    disabled,
    style,
  }: {
    onPress?: () => void
    children?: React.ReactNode | ((state: { pressed: boolean }) => React.ReactNode)
    accessibilityLabel?: string
    accessibilityRole?: string
    accessibilityState?: { selected?: boolean, disabled?: boolean }
    disabled?: boolean
    style?: unknown
  }) => React.createElement(
    'button',
    {
      type: 'button',
      onClick: onPress,
      'aria-label': accessibilityLabel,
      role: accessibilityRole ?? 'button',
      'aria-selected': accessibilityState?.selected ? 'true' : undefined,
      disabled,
      'data-style': JSON.stringify(flatStyle(style)),
    },
    typeof children === 'function' ? children({ pressed: false }) : children,
  ),
  View: ({
    children,
    accessibilityLabel,
    style,
  }: {
    children?: React.ReactNode
    accessibilityLabel?: string
    style?: unknown
  }) => React.createElement('div', {
    'aria-label': accessibilityLabel,
    'data-style': JSON.stringify(flatStyle(style)),
  }, children),
  Text: ({
    children,
    accessibilityLabel,
    accessibilityRole,
    accessibilityElementsHidden,
  }: {
    children?: React.ReactNode
    accessibilityLabel?: string
    accessibilityRole?: string
    accessibilityElementsHidden?: boolean
  }) => React.createElement('span', {
    'aria-label': accessibilityLabel,
    role: accessibilityRole === 'header' ? 'heading' : undefined,
    'aria-hidden': accessibilityElementsHidden ? 'true' : undefined,
  }, children),
  FlatList: ({
    data,
    renderItem,
    ListHeaderComponent,
    ListEmptyComponent,
  }: {
    data: LibraryGameCard[]
    renderItem: (info: { item: LibraryGameCard }) => React.ReactNode
    ListHeaderComponent?: React.ReactNode
    ListEmptyComponent?: React.ReactNode
  }) => React.createElement(
    'div',
    null,
    ListHeaderComponent,
    data.length === 0 ? ListEmptyComponent : data.map((item) => renderItem({ item })),
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
  useWindowDimensions: () => ({ width: viewport.width, height: viewport.height, scale: 1, fontScale: 1 }),
  StyleSheet: { create: (styles: unknown) => styles, absoluteFill: {} },
}))

const HADES: LibraryGameCard = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Hades',
  slug: 'hades',
  cover_image_url: null,
  released: '2020-09-17',
  developer: 'Supergiant Games',
  avg_rating: 9,
  user_rating: 8,
  library_status: 'playing',
  completed_all_achievements: true,
  hours_played: 12.5,
  play_count: 4,
}

const CELESTE: LibraryGameCard = {
  ...HADES,
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Celeste',
  slug: 'celeste',
  library_status: 'abandoned',
  completed_all_achievements: false,
  hours_played: null,
  play_count: 1,
  user_rating: null,
}

const FACETS: LibraryPageData['facets'] = {
  genres: [
    { id: 'genre-1', name: 'Roguelike', slug: 'roguelike' },
    { id: 'genre-2', name: 'Platformer', slug: 'platformer' },
  ],
  platforms: [{ id: 'platform-1', name: 'PC', slug: 'pc' }],
  developers: [{ id: 'dev-1', name: 'Supergiant Games', slug: 'supergiant-games' }],
  publishers: [],
  esrb_ratings: ['Teen'],
}

function renderLibrary(overrides: Partial<React.ComponentProps<typeof LibraryScreen>> = {}) {
  const onOpen = vi.fn()
  const onQuery = vi.fn()
  const onSave = vi.fn(async () => null)
  const onRemove = vi.fn(async () => null)
  const props = {
    locked: false,
    games: [HADES],
    facets: FACETS,
    query: LIBRARY_QUERY,
    canEdit: true,
    onOpen,
    onQuery,
    onSave,
    onRemove,
    ...overrides,
  }
  const view = render(<LibraryScreen {...props} />)
  return {
    onOpen,
    onQuery,
    onSave,
    onRemove,
    rerender(next: Partial<React.ComponentProps<typeof LibraryScreen>> = {}) {
      view.rerender(<LibraryScreen {...props} {...next} />)
    },
  }
}

afterEach(() => {
  cleanup()
  viewport.width = 375
})

describe('library screen', () => {
  it('asks a signed-out player to sign up and hides the games', () => {
    const { onOpen } = renderLibrary({ locked: true, games: [HADES] })
    expect(screen.getByText('Sign up to see your library.').textContent).toBe('Sign up to see your library.')
    expect(screen.queryByRole('link', { name: 'Hades' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }))
    expect(onOpen).toHaveBeenCalledWith('/sign-up')
  })

  it('shows status, score, hours, times played, and the 100% trophy, and opens the game', () => {
    const { onOpen } = renderLibrary()
    const card = screen.getByRole('link', { name: 'Hades' })
    expect(card.textContent).toContain('Playing')
    expect(card.textContent).toContain('8')
    expect(screen.getByLabelText('Hours played 12.5').textContent).toContain('12.5')
    expect(screen.getByLabelText('Times played 4').textContent).toContain('4')
    expect(screen.getByLabelText('100% achievements completed').textContent).toContain('100%')
    fireEvent.click(screen.getByRole('link', { name: 'Hades' }))
    expect(onOpen).toHaveBeenCalledWith('/games/hades')
  })

  it('labels a dropped game and hides the trophy when the flag is off', () => {
    renderLibrary({ games: [CELESTE], canEdit: false })
    expect(screen.getByText('Dropped').textContent).toBe('Dropped')
    expect(screen.getByLabelText('Hours played —').textContent).toContain('—')
    expect(screen.getByLabelText('Times played 1').textContent).toContain('1')
    expect(screen.queryByLabelText('100% achievements completed')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Edit Celeste' })).toBeNull()
  })

  it('filters by status, 100%, sort, and a library search', () => {
    const { onQuery, rerender } = renderLibrary()
    expect(screen.queryByText('Search games')).toBeNull()
    expect(screen.getByRole('button', { name: 'Status: All' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sort: Name' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Completed' })).toBeNull()
    fireEvent.change(screen.getByRole('textbox', { name: 'Search games' }), { target: { value: 'Hades' } })
    fireEvent.click(screen.getByRole('button', { name: 'Status: All' }))
    fireEvent.click(screen.getByRole('button', { name: 'Playing' }))
    expect(onQuery).toHaveBeenCalledWith({ ...LIBRARY_QUERY, status: 'playing' } satisfies LibraryQuery)
    expect((screen.getByRole('textbox', { name: 'Search games' }) as HTMLInputElement).value).toBe('Hades')

    fireEvent.click(screen.getByRole('button', { name: '100% only' }))
    expect(onQuery).toHaveBeenCalledWith({ ...LIBRARY_QUERY, is100: true })

    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect(onQuery).toHaveBeenCalledWith({ ...LIBRARY_QUERY, q: 'Hades' })

    fireEvent.click(screen.getByRole('button', { name: 'Sort: Name' }))
    fireEvent.click(screen.getByRole('button', { name: 'Date added' }))
    expect(onQuery).toHaveBeenCalledWith({ ...LIBRARY_QUERY, sort: 'date_added', order: 'desc' })
    expect((screen.getByRole('textbox', { name: 'Search games' }) as HTMLInputElement).value).toBe('Hades')

    rerender({ query: { ...LIBRARY_QUERY, sort: 'date_added', order: 'desc' } })
    expect((screen.getByRole('textbox', { name: 'Search games' }) as HTMLInputElement).value).toBe('Hades')
    fireEvent.click(screen.getByRole('button', { name: 'Sort descending — tap for ascending' }))
    expect(onQuery).toHaveBeenCalledWith({ ...LIBRARY_QUERY, sort: 'date_added', order: 'asc' })
  })

  it('applies a genre from its picker and clears that category', () => {
    const { onQuery, rerender } = renderLibrary()
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    fireEvent.click(screen.getByRole('button', { name: 'Genres: 0 selected' }))
    fireEvent.click(screen.getByRole('button', { name: 'Roguelike' }))
    expect(onQuery).toHaveBeenCalledWith({ ...LIBRARY_QUERY, genre: 'roguelike' })
    rerender({ query: { ...LIBRARY_QUERY, genre: 'roguelike' } })
    expect(screen.getByRole('button', { name: 'Genres: 1 selected' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Clear Genres' }))
    expect(onQuery).toHaveBeenCalledWith({ ...LIBRARY_QUERY, genre: null })
  })

  it('filters facet options from the category search', () => {
    const { onQuery } = renderLibrary()
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    fireEvent.click(screen.getByRole('button', { name: 'Genres: 0 selected' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Search genres' }), { target: { value: 'plat' } })
    expect(screen.queryByRole('button', { name: 'Roguelike' })).toBeNull()
    expect(screen.getByText('Platformer').textContent).toBe('Platformer')
    fireEvent.change(screen.getByRole('textbox', { name: 'Search genres' }), { target: { value: 'zzz' } })
    expect(screen.getByText('No matches').textContent).toBe('No matches')
    fireEvent.change(screen.getByRole('textbox', { name: 'Search genres' }), { target: { value: '  PLAT' } })
    fireEvent.click(screen.getByRole('button', { name: 'Platformer' }))
    expect(onQuery).toHaveBeenCalledWith({ ...LIBRARY_QUERY, genre: 'platformer' })
  })

  it('opens the edit sheet from the cover overlay without opening the game', () => {
    const { onOpen } = renderLibrary()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Hades' }))
    expect(onOpen).not.toHaveBeenCalled()
    expect(screen.getByText('Manage game').textContent).toBe('Manage game')
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    fireEvent.click(screen.getByRole('link', { name: 'Hades' }))
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onOpen).toHaveBeenCalledWith('/games/hades')
  })

  it('says the library is empty, and that a search found nothing', () => {
    renderLibrary({ games: [] })
    expect(screen.getByText('Nothing in this library yet.').textContent).toBe('Nothing in this library yet.')
    cleanup()
    renderLibrary({ games: [], query: { ...LIBRARY_QUERY, q: 'nope' } })
    expect(screen.getByText('No games found').textContent).toBe('No games found')
  })

  it('shows a private library without its games', () => {
    renderLibrary({ access: 'private', games: [HADES], canEdit: false })
    expect(screen.getByText('This library is private.').textContent).toBe('This library is private.')
    expect(screen.queryByRole('link', { name: 'Hades' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Edit Hades' })).toBeNull()
  })

  it('saves a status from the library sheet and keeps the edit control at 44 points', async () => {
    const { onSave } = renderLibrary()
    const edit = screen.getByRole('button', { name: 'Edit Hades' })
    expect(JSON.parse(edit.getAttribute('data-style') || '{}').minHeight).toBe(hitTarget)
    expect(JSON.parse(edit.getAttribute('data-style') || '{}').minWidth).toBe(hitTarget)
    fireEvent.click(edit)
    fireEvent.click(screen.getByRole('button', { name: 'Log as completed' }))
    fireEvent.click(screen.getByRole('button', { name: 'Update library entry' }))
    await screen.findByRole('button', { name: 'Edit Hades' })
    expect(onSave).toHaveBeenCalledWith(HADES.id, { status: 'completed' })
  })

  it('keeps a single card at the half-column width', () => {
    viewport.width = 320
    renderLibrary({ games: [HADES] })
    const cell = screen.getByRole('link', { name: 'Hades' }).parentElement
    const half = (320 - space[4] * 2 - space[3]) / 2
    expect(JSON.parse(cell?.getAttribute('data-style') || '{}').width).toBe(half)
  })
})
