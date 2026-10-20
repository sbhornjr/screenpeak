// @vitest-environment jsdom
import type { LibraryGameCard, LibraryPageData } from '@screenpeak/shared/api/library'
import type { ProfilePageData } from '@screenpeak/shared/api/profile'
import { ApiClientError } from '@screenpeak/shared/api/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { profileHubModel } from '@/lib/profile-hub'

import { OwnLibrary, UserLibrary } from './library-browser'

const auth = vi.hoisted(() => ({
  session: { user: { id: 'viewer-1' } } as { user: { id: string } } | null,
}))

const { getMe, getUser, getLibrary, putLibrary, deleteLibrary } = vi.hoisted(() => ({
  getMe: vi.fn(),
  getUser: vi.fn(),
  getLibrary: vi.fn(),
  putLibrary: vi.fn(),
  deleteLibrary: vi.fn(),
}))

vi.mock('expo-router', () => ({
  router: {
    push: vi.fn(),
    back: vi.fn(),
    replace: vi.fn(),
    navigate: vi.fn(),
    dismissTo: vi.fn(),
    canGoBack: () => false,
    canDismiss: () => false,
  },
}))

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ ready: true, session: auth.session }),
}))

vi.mock('@/lib/api', () => ({
  apiConfigured: () => true,
  api: {
    me: { get: getMe, library: { put: putLibrary, delete: deleteLibrary } },
    users: { get: getUser, library: getLibrary },
  },
}))

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
    Clock: Icon,
    Pencil: Icon,
    Repeat: Icon,
    SlidersHorizontal: Icon,
    Trophy: Icon,
  }
})

vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children),
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
    disabled,
  }: {
    onPress?: () => void
    children?: React.ReactNode | ((state: { pressed: boolean }) => React.ReactNode)
    accessibilityLabel?: string
    accessibilityRole?: string
    accessibilityState?: { selected?: boolean }
    disabled?: boolean
  }) => React.createElement(
    'button',
    {
      type: 'button',
      onClick: onPress,
      'aria-label': accessibilityLabel,
      role: accessibilityRole ?? 'button',
      'aria-selected': accessibilityState?.selected ? 'true' : undefined,
      disabled,
    },
    typeof children === 'function' ? children({ pressed: false }) : children,
  ),
  View: ({ children, accessibilityLabel }: { children?: React.ReactNode, accessibilityLabel?: string }) => (
    React.createElement('div', { 'aria-label': accessibilityLabel }, children)
  ),
  Text: ({
    children,
    accessibilityLabel,
    accessibilityRole,
    accessibilityLiveRegion,
    accessibilityElementsHidden,
  }: {
    children?: React.ReactNode
    accessibilityLabel?: string
    accessibilityRole?: string
    accessibilityLiveRegion?: string
    accessibilityElementsHidden?: boolean
  }) => React.createElement('span', {
    'aria-label': accessibilityLabel,
    role: accessibilityRole === 'header' ? 'heading' : undefined,
    'aria-live': accessibilityLiveRegion,
    'aria-hidden': accessibilityElementsHidden ? 'true' : undefined,
  }, children),
  FlatList: ({
    data,
    renderItem,
    ListHeaderComponent,
    ListEmptyComponent,
    refreshing,
  }: {
    data: { id: string }[]
    renderItem: (info: { item: { id: string } }) => React.ReactNode
    ListHeaderComponent?: React.ReactNode
    ListEmptyComponent?: React.ReactNode
    refreshing?: boolean
  }) => React.createElement(
    'div',
    { 'aria-busy': refreshing ? 'true' : 'false' },
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
  useWindowDimensions: () => ({ width: 375, height: 667, scale: 1, fontScale: 1 }),
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

const PAGE: LibraryPageData = {
  username: 'peek',
  facets: { genres: [], platforms: [], developers: [], publishers: [], esrb_ratings: [] },
  games: [HADES],
}

function profile(input: { username: string, libraryPublic: boolean, owner: boolean }): ProfilePageData {
  return {
    profile: {
      id: '22222222-2222-4222-8222-222222222222',
      username: input.username,
      display_name: input.username,
      avatar_url: null,
      created_at: '2026-01-01 00:00:00+00',
      selected_title: null,
      user_bio: null,
      profile_loadout_bio: null,
      library_public: input.libraryPublic,
      loadout_public: false,
      follower_count: 0,
      following_count: 0,
    },
    library_stats: input.libraryPublic || input.owner ? { total_games: 1, completed: 0 } : null,
    favorites: [],
    recent_reviews: [],
    rating_count: 0,
    avg_rating: null,
    viewer: { is_owner: input.owner, is_following: false, top_developer_names: [] },
  }
}

function renderLibrary(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
  return {
    ...view,
    rerender(next: React.ReactNode) {
      view.rerender(<QueryClientProvider client={client}>{next}</QueryClientProvider>)
    },
  }
}

afterEach(() => {
  cleanup()
  auth.session = { user: { id: 'viewer-1' } }
  getMe.mockReset()
  getUser.mockReset()
  getLibrary.mockReset()
  putLibrary.mockReset()
  deleteLibrary.mockReset()
})

describe('OwnLibrary', () => {
  it('asks a signed-out player to sign up', () => {
    auth.session = null
    renderLibrary(<OwnLibrary />)
    expect(screen.getByText('Sign up to see your library.').textContent).toBe('Sign up to see your library.')
    expect(getMe).not.toHaveBeenCalled()
    expect(getLibrary).not.toHaveBeenCalled()
  })

  it('lists your games and refetches when the Playing tab is chosen', async () => {
    getMe.mockResolvedValue({ user: { username: 'peek' } })
    getLibrary.mockResolvedValue(PAGE)
    renderLibrary(<OwnLibrary />)
    expect((await screen.findByRole('link', { name: 'Hades' })).textContent).toContain('Hades')
    expect(getLibrary).toHaveBeenCalledWith('peek', expect.objectContaining({ status: '', sort: 'name', order: 'asc' }))
    fireEvent.click(screen.getByRole('button', { name: 'Playing' }))
    await waitFor(() => expect(getLibrary).toHaveBeenCalledWith('peek', expect.objectContaining({ status: 'playing' })))
  })

  it('shows a completed chip immediately, then puts the playing chip back when the save is rate limited', async () => {
    getMe.mockResolvedValue({ user: { username: 'peek' } })
    getLibrary.mockResolvedValue(PAGE)
    let rejectSave: (error: unknown) => void = () => undefined
    putLibrary.mockImplementation(() => new Promise((_resolve, reject) => {
      rejectSave = reject
    }))
    renderLibrary(<OwnLibrary />)
    const link = await screen.findByRole('link', { name: 'Hades' })
    expect(link.textContent).toContain('Playing')
    fireEvent.click(screen.getByRole('button', { name: 'Edit Hades' }))
    fireEvent.click(screen.getByRole('button', { name: 'Log as completed' }))
    fireEvent.click(screen.getByRole('button', { name: 'Update library entry' }))
    await waitFor(() => expect(link.textContent).toContain('Done'))
    expect(putLibrary).toHaveBeenCalledWith(HADES.id, { status: 'completed' })
    rejectSave(new ApiClientError(429, 'rate_limited', 'slow down', 9))
    expect((await screen.findByText('Too many requests. Try again in 9 seconds.')).textContent)
      .toBe('Too many requests. Try again in 9 seconds.')
    await waitFor(() => expect(link.textContent).toContain('Playing'))
    expect(link.textContent).not.toContain('Done')
  })

  it('keeps the filters sheet and the previous game while the next filter loads', async () => {
    getMe.mockResolvedValue({ user: { username: 'peek' } })
    let releaseNext: (page: LibraryPageData) => void = () => undefined
    getLibrary.mockImplementation(() => {
      if (getLibrary.mock.calls.length === 1) return Promise.resolve({
        ...PAGE,
        facets: {
          genres: [{ id: 'genre-1', name: 'Roguelike', slug: 'roguelike' }],
          platforms: [],
          developers: [],
          publishers: [],
          esrb_ratings: [],
        },
      })
      return new Promise<LibraryPageData>((resolve) => {
        releaseNext = resolve
      })
    })
    renderLibrary(<OwnLibrary />)
    expect((await screen.findByRole('link', { name: 'Hades' })).textContent).toContain('Hades')
    fireEvent.change(screen.getByRole('textbox', { name: 'Search games' }), { target: { value: 'had' } })
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    fireEvent.click(screen.getByRole('button', { name: 'Roguelike' }))
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Hades' })).toBeTruthy()
    expect((screen.getByRole('textbox', { name: 'Search games' }) as HTMLInputElement).value).toBe('had')
    expect(document.querySelector('[aria-busy="true"]')).toBeTruthy()
    releaseNext({ ...PAGE, games: [] })
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Hades' })).toBeNull())
  })

  it('drops the cached games when the viewer changes and does not fetch them for the new viewer', async () => {
    getMe.mockResolvedValue({ user: { username: 'peek' } })
    getLibrary.mockResolvedValue(PAGE)
    const { rerender } = renderLibrary(<OwnLibrary />)
    expect((await screen.findByRole('link', { name: 'Hades' })).textContent).toContain('Hades')
    const calls = getLibrary.mock.calls.length
    getMe.mockImplementation(() => new Promise(() => undefined))
    auth.session = { user: { id: 'viewer-2' } }
    rerender(<OwnLibrary />)
    expect(screen.queryByRole('link', { name: 'Hades' })).toBeNull()
    expect(getLibrary).toHaveBeenCalledTimes(calls)
  })

  it('drops a cached library after sign-out', async () => {
    getMe.mockResolvedValue({ user: { username: 'peek' } })
    getLibrary.mockResolvedValue(PAGE)
    const { rerender } = renderLibrary(<OwnLibrary />)
    expect((await screen.findByRole('link', { name: 'Hades' })).textContent).toContain('Hades')
    const calls = getLibrary.mock.calls.length
    auth.session = null
    rerender(<OwnLibrary />)
    expect(screen.getByText('Sign up to see your library.').textContent).toBe('Sign up to see your library.')
    expect(screen.queryByRole('link', { name: 'Hades' })).toBeNull()
    expect(getLibrary).toHaveBeenCalledTimes(calls)
  })

  it('keeps the edit sheet and its choices when a 429 removes the card from Playing', async () => {
    getMe.mockResolvedValue({ user: { username: 'peek' } })
    getLibrary.mockResolvedValue(PAGE)
    let rejectSave: (error: unknown) => void = () => undefined
    putLibrary.mockImplementation(() => new Promise((_resolve, reject) => {
      rejectSave = reject
    }))
    renderLibrary(<OwnLibrary />)
    expect(await screen.findByRole('link', { name: 'Hades' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Playing' }))
    expect(await screen.findByRole('button', { name: 'Edit Hades' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Hades' }))
    fireEvent.click(screen.getByRole('button', { name: 'Log as completed' }))
    fireEvent.click(screen.getByRole('button', { name: 'Update library entry' }))
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Hades' })).toBeNull())
    expect(screen.getByRole('button', { name: 'Log as completed' }).getAttribute('aria-selected')).toBe('true')
    rejectSave(new ApiClientError(429, 'rate_limited', 'slow down', 9))
    expect((await screen.findByText('Too many requests. Try again in 9 seconds.')).textContent)
      .toBe('Too many requests. Try again in 9 seconds.')
    expect(screen.getByRole('button', { name: 'Log as completed' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('button', { name: 'Update library entry' })).toBeTruthy()
    expect(screen.getByText('Manage game').textContent).toBe('Manage game')
  })

  it('closes the edit sheet after the save succeeds', async () => {
    getMe.mockResolvedValue({ user: { username: 'peek' } })
    getLibrary.mockResolvedValue(PAGE)
    let resolveSave: (value: unknown) => void = () => undefined
    putLibrary.mockImplementation(() => new Promise((resolve) => {
      resolveSave = resolve
    }))
    renderLibrary(<OwnLibrary />)
    expect(await screen.findByRole('link', { name: 'Hades' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Playing' }))
    expect(await screen.findByRole('button', { name: 'Edit Hades' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Hades' }))
    fireEvent.click(screen.getByRole('button', { name: 'Log as completed' }))
    fireEvent.click(screen.getByRole('button', { name: 'Update library entry' }))
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Hades' })).toBeNull())
    expect(screen.getByText('Manage game').textContent).toBe('Manage game')
    resolveSave(undefined)
    await waitFor(() => expect(screen.queryByText('Manage game')).toBeNull())
    expect(screen.queryByRole('button', { name: 'Update library entry' })).toBeNull()
  })

  it('lets All bring back the previous games when a filter request fails', async () => {
    getMe.mockResolvedValue({ user: { username: 'peek' } })
    getLibrary
      .mockResolvedValueOnce(PAGE)
      .mockRejectedValueOnce(new ApiClientError(500, 'internal', 'The library request failed.'))
      .mockResolvedValue(PAGE)
    renderLibrary(<OwnLibrary />)
    expect(await screen.findByRole('link', { name: 'Hades' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Playing' }))
    expect((await screen.findByText('The library request failed.')).textContent).toBe('The library request failed.')
    expect(screen.getByRole('link', { name: 'Hades' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'All' }))
    await waitFor(() => expect(screen.queryByText('The library request failed.')).toBeNull())
    expect(screen.getByRole('link', { name: 'Hades' })).toBeTruthy()
  })

  it('shows the rate-limit message and loads the library after Retry', async () => {
    getMe.mockResolvedValue({ user: { username: 'peek' } })
    getLibrary
      .mockRejectedValueOnce(new ApiClientError(429, 'rate_limited', 'slow down', 9))
      .mockResolvedValueOnce(PAGE)
    renderLibrary(<OwnLibrary />)
    expect((await screen.findByText('Too many requests. Try again in 9 seconds.')).textContent)
      .toBe('Too many requests. Try again in 9 seconds.')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect((await screen.findByRole('link', { name: 'Hades' })).textContent).toContain('Hades')
  })
})

describe('UserLibrary', () => {
  it('shows a private library without requesting the games', async () => {
    getUser.mockResolvedValue(profile({ username: 'ada', libraryPublic: false, owner: false }))
    renderLibrary(<UserLibrary username="ada" />)
    expect((await screen.findByText('This library is private.')).textContent).toBe('This library is private.')
    expect(getLibrary).not.toHaveBeenCalled()
    expect(screen.queryByRole('link', { name: 'Hades' })).toBeNull()
  })

  it('shows a public library and hides the edit control', async () => {
    getUser.mockResolvedValue(profile({ username: 'nova', libraryPublic: true, owner: false }))
    getLibrary.mockResolvedValue({ ...PAGE, username: 'nova' })
    renderLibrary(<UserLibrary username="nova" />)
    expect((await screen.findByRole('link', { name: 'Hades' })).textContent).toContain('Hades')
    expect(screen.queryByRole('button', { name: 'Edit Hades' })).toBeNull()
  })

  it('uses the profile hub cache when that screen was opened first', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
    client.setQueryData(
      ['profile', 'nova', 'viewer-1'],
      profileHubModel(profile({ username: 'nova', libraryPublic: true, owner: false })),
    )
    getLibrary.mockResolvedValue({ ...PAGE, username: 'nova' })
    render(<QueryClientProvider client={client}><UserLibrary username="nova" /></QueryClientProvider>)
    expect((await screen.findByRole('link', { name: 'Hades' })).textContent).toContain('Hades')
    expect(getUser).not.toHaveBeenCalled()
  })

  it('keeps a cached private hub from requesting the games', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
    client.setQueryData(
      ['profile', 'ada', 'viewer-1'],
      profileHubModel(profile({ username: 'ada', libraryPublic: false, owner: false })),
    )
    render(<QueryClientProvider client={client}><UserLibrary username="ada" /></QueryClientProvider>)
    expect((await screen.findByText('This library is private.')).textContent).toBe('This library is private.')
    expect(getLibrary).not.toHaveBeenCalled()
    expect(getUser).not.toHaveBeenCalled()
  })

  it('lets the owner edit a library opened from their profile', async () => {
    getUser.mockResolvedValue(profile({ username: 'peek', libraryPublic: false, owner: true }))
    getLibrary.mockResolvedValue(PAGE)
    renderLibrary(<UserLibrary username="peek" />)
    expect(await screen.findByRole('button', { name: 'Edit Hades' })).toBeTruthy()
  })
})
