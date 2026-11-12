// @vitest-environment jsdom
import type { LibraryGameCard } from '@screenpeak/shared/api/library'
import type { ProfilePageData } from '@screenpeak/shared/api/profile'
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import AppTabs from './app-tabs'
import { LibraryScreen } from './library-screen'
import { ListDetailScreen } from './list-detail-screen'
import { ListsScreen } from './lists-screen'
import { ProfileHub } from './profile-hub'
import { WelcomeScreen } from './welcome-screen'
import { screenGate } from './screen-state'
import { profileHubModel } from '@/lib/profile-hub'

vi.mock('expo-router/native-tabs', () => {
  function Label({ children }: { children?: React.ReactNode }) {
    return React.createElement('span', null, children)
  }
  function Icon() {
    return null
  }
  function Trigger({ name, children }: { name: string, children?: React.ReactNode }) {
    return React.createElement('div', { 'data-tab': name }, children)
  }
  Trigger.Label = Label
  Trigger.Icon = Icon
  function NativeTabs({ children }: { children?: React.ReactNode }) {
    return React.createElement('nav', { 'aria-label': 'Main' }, children)
  }
  NativeTabs.Trigger = Trigger
  return { NativeTabs }
})

const NAMED_ROLES = new Set(['button', 'link', 'img', 'image', 'header', 'heading', 'text', 'summary'])

function exposedRole(role?: string, accessibilityRole?: string): string | undefined {
  const value = role ?? accessibilityRole
  if (value === 'image' || value === 'img') return 'img'
  if (value === 'header' || value === 'heading') return 'heading'
  return value
}

function exposedName(role: string | undefined, accessibilityRole: string | undefined, label?: string): string | undefined {
  if (!label) return undefined
  const mapped = exposedRole(role, accessibilityRole)
  if (!mapped || (!NAMED_ROLES.has(mapped) && !NAMED_ROLES.has(role ?? '') && !NAMED_ROLES.has(accessibilityRole ?? ''))) return undefined
  return label
}

vi.mock('lucide-react-native', () => {
  function Icon({ accessibilityLabel }: { accessibilityLabel?: string }) {
    return React.createElement('span', { role: 'img', 'aria-label': accessibilityLabel })
  }
  return {
    ArrowDownWideNarrow: Icon,
    ArrowUpNarrowWide: Icon,
    ChevronDown: Icon,
    Clock: Icon,
    Heart: Icon,
    Library: Icon,
    List: Icon,
    Lock: Icon,
    Pencil: Icon,
    Pin: Icon,
    Repeat: Icon,
    Share2: Icon,
    SlidersHorizontal: Icon,
    Trophy: Icon,
    X: Icon,
    Crosshair: Icon,
  }
})

vi.mock('react-native', () => ({
  Linking: { openURL: vi.fn(() => Promise.resolve()) },
  Platform: { OS: 'web' },
  Keyboard: { addListener: () => ({ remove() {} }) },
  Pressable: ({
    onPress,
    children,
    accessibilityLabel,
    accessibilityRole,
    disabled,
  }: {
    onPress?: () => void
    children?: React.ReactNode | ((state: { pressed: boolean }) => React.ReactNode)
    accessibilityLabel?: string
    accessibilityRole?: string
    disabled?: boolean
  }) => React.createElement(
    'button',
    {
      type: 'button',
      onClick: onPress,
      'aria-label': accessibilityLabel,
      role: accessibilityRole,
      disabled,
    },
    typeof children === 'function' ? children({ pressed: false }) : children,
  ),
  View: ({
    children,
    accessibilityLabel,
    accessibilityRole,
    role,
  }: {
    children?: React.ReactNode
    accessibilityLabel?: string
    accessibilityRole?: string
    role?: string
  }) => React.createElement('div', {
    'aria-label': exposedName(role, accessibilityRole, accessibilityLabel),
    role: exposedRole(role, accessibilityRole),
  }, children),
  Text: ({ children }: { children?: React.ReactNode }) => React.createElement('span', null, children),
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
  ScrollView: ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children),
  RefreshControl: () => null,
  FlatList: ({
    data,
    renderItem,
    ListHeaderComponent,
    ListEmptyComponent,
  }: {
    data?: { id?: string }[]
    renderItem?: (info: { item: { id?: string } }) => React.ReactNode
    ListHeaderComponent?: React.ReactNode
    ListEmptyComponent?: React.ReactNode
  }) => React.createElement(
    'div',
    null,
    ListHeaderComponent,
    data && data.length > 0 && renderItem ? data.map((item) => renderItem({ item })) : ListEmptyComponent,
  ),
  Modal: ({ visible, children }: { visible?: boolean, children?: React.ReactNode }) => (
    visible ? React.createElement('div', null, children) : null
  ),
  useWindowDimensions: () => ({ width: 390, height: 844, scale: 1, fontScale: 1 }),
  StyleSheet: { create: (styles: unknown) => styles, absoluteFill: {} },
}))

vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children),
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}))

vi.mock('expo-image', () => ({
  Image: () => null,
}))

afterEach(() => {
  cleanup()
})

const HADES: LibraryGameCard = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Hades',
  slug: 'hades',
  cover_image_url: null,
  released: '2020-09-17',
  developer: 'Supergiant Games',
  avg_rating: 9,
  user_rating: 8,
  library_status: 'completed',
  completed_all_achievements: false,
  hours_played: 40,
  play_count: 1,
}

describe('tab bar', () => {
  it('shows Feed, Explore, Library, and Profile, and does not offer Games', () => {
    render(<AppTabs />)
    const nav = screen.getByRole('navigation', { name: 'Main' })
    const tabs = Array.from(nav.querySelectorAll('[data-tab]')).map((node) => ({
      name: node.getAttribute('data-tab'),
      label: node.textContent,
    }))
    expect(tabs).toEqual([
      { name: 'index', label: 'Feed' },
      { name: 'explore', label: 'Explore' },
      { name: 'library', label: 'Library' },
      { name: 'profile', label: 'Profile' },
    ])
  })
})

describe('welcome', () => {
  it('offers Sign up, Log in, and Browse to the catalogue', () => {
    const onOpen = vi.fn()
    render(<WelcomeScreen onOpen={onOpen} />)
    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }))
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }))
    fireEvent.click(screen.getByRole('button', { name: 'Browse' }))
    expect(onOpen.mock.calls).toEqual([['/sign-up'], ['/sign-in'], ['/games']])
    expect(screen.getByRole('img', { name: 'ScreenPeak' }).textContent).toBe('ScreenPeak')
  })
})

describe('library', () => {
  it('asks signed-out players to sign up and hides the games', () => {
    const onOpen = vi.fn()
    render(<LibraryScreen locked games={[HADES]} onOpen={onOpen} />)
    expect(screen.getByText('Sign up to see your library.').textContent).toBe('Sign up to see your library.')
    expect(screen.queryByText('Hades')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }))
    expect(onOpen).toHaveBeenCalledWith('/sign-up')
  })

  it('lists a signed-in library and opens the game', () => {
    const onOpen = vi.fn()
    render(<LibraryScreen locked={false} games={[HADES]} onOpen={onOpen} />)
    expect(screen.getByRole('button', { name: 'Status: All' }).textContent).toContain('Status: All')
    expect(screen.getByRole('button', { name: 'Sort: Name' }).textContent).toContain('Sort: Name')
    fireEvent.click(screen.getByRole('link', { name: 'Hades' }))
    expect(onOpen).toHaveBeenCalledWith('/games/hades')
    cleanup()
    render(<LibraryScreen locked={false} games={[{ ...HADES, id: '22222222-2222-2222-2222-222222222222', name: 'Celeste', slug: 'celeste', library_status: 'abandoned' }]} onOpen={onOpen} />)
    expect(screen.getByText('Dropped').textContent).toBe('Dropped')
  })
})

function profilePage(input: {
  username: string
  owner: boolean
  libraryPublic: boolean
  loadoutPublic: boolean
  stats: { total_games: number, completed: number } | null
  viewer: 'owner' | 'other' | null
}): ProfilePageData {
  return {
    profile: {
      id: '33333333-3333-3333-3333-333333333333',
      username: input.username,
      display_name: null,
      avatar_url: null,
      created_at: '2026-01-01 00:00:00+00',
      selected_title: null,
      user_bio: input.username === 'peek' ? 'Looks at screens.' : null,
      profile_loadout_bio: input.owner || input.loadoutPublic ? 'A patient roguelike reader.' : null,
      library_public: input.libraryPublic,
      loadout_public: input.loadoutPublic,
      follower_count: input.username === 'peek' ? 3 : 4,
      following_count: input.username === 'peek' ? 1 : 2,
    },
    library_stats: input.stats,
    favorites: [],
    recent_reviews: [],
    rating_count: 5,
    avg_rating: 8,
    viewer: input.viewer === null ? null : {
      is_owner: input.viewer === 'owner',
      is_following: false,
      top_developer_names: [],
    },
  }
}

function renderHub(data: ProfilePageData, onOpen: (href: string) => void) {
  return render(<ProfileHub model={profileHubModel(data)} onOpen={onOpen} />)
}

describe('profile hub', () => {
  it('shows Loadout, Lists, and the library preview on your own profile even when the public flags are off', () => {
    const onOpen = vi.fn()
    renderHub(profilePage({
      username: 'peek',
      owner: true,
      libraryPublic: false,
      loadoutPublic: false,
      stats: { total_games: 5, completed: 2 },
      viewer: 'owner',
    }), onOpen)
    fireEvent.click(screen.getByRole('button', { name: 'Loadout' }))
    fireEvent.click(screen.getByRole('button', { name: 'Lists' }))
    fireEvent.click(screen.getByRole('button', { name: 'Library, 5 games, 2 completed' }))
    expect(onOpen.mock.calls).toEqual([
      ['/user/peek/loadout'],
      ['/user/peek/lists'],
      ['/library'],
    ])
    expect(screen.getByText('5 games · 2 completed').textContent).toBe('5 games · 2 completed')
    expect(screen.queryByText('Hades')).toBeNull()
  })

  it('shows the same sections on another player when that player has made them public', () => {
    const onOpen = vi.fn()
    renderHub(profilePage({
      username: 'ada',
      owner: false,
      libraryPublic: true,
      loadoutPublic: true,
      stats: { total_games: 10, completed: 3 },
      viewer: null,
    }), onOpen)
    fireEvent.click(screen.getByRole('button', { name: 'Loadout' }))
    fireEvent.click(screen.getByRole('button', { name: 'Lists' }))
    fireEvent.click(screen.getByRole('button', { name: 'Library, 10 games, 3 completed' }))
    expect(onOpen.mock.calls).toEqual([
      ['/user/ada/loadout'],
      ['/user/ada/lists'],
      ['/user/ada/library'],
    ])
  })

  it('hides Loadout, the library counts, and the loadout bio when another player is private even if the payload includes them', () => {
    const data = profilePage({
      username: 'ada',
      owner: false,
      libraryPublic: false,
      loadoutPublic: false,
      stats: { total_games: 10, completed: 3 },
      viewer: 'other',
    })
    data.profile.profile_loadout_bio = 'A patient roguelike reader.'
    data.recent_reviews = [{
      user_id: data.profile.id,
      rating: 9,
      review: 'Sharp climb.',
      created_at: '2026-02-01 00:00:00+00',
      updated_at: '2026-02-01 00:00:00+00',
      users: { username: 'ada', display_name: 'Ada', avatar_url: '' },
      games: { name: 'Celeste', slug: 'celeste' },
    }]
    const model = profileHubModel(data)
    expect(model.loadoutHref).toBeNull()
    expect(model.library).toBeNull()
    render(<ProfileHub model={model} onOpen={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Loadout' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Library/ })).toBeNull()
    expect(screen.queryByText('10 games · 3 completed')).toBeNull()
    expect(screen.queryByText(/patient roguelike reader/)).toBeNull()
    expect(screen.queryByText('Games')).toBeNull()
    expect(screen.getByRole('button', { name: 'Lists' })).toBeTruthy()
    expect(screen.getByText('Sharp climb.').textContent).toBe('Sharp climb.')
    expect(screen.getByRole('link', { name: 'Celeste' }).textContent).toBe('Celeste')
    expect(screen.getByText('9 / 10').textContent).toBe('9 / 10')
  })

  it('omits Loadout and the library preview when another player has hidden them, and still links Lists', () => {
    const onOpen = vi.fn()
    renderHub(profilePage({
      username: 'ada',
      owner: false,
      libraryPublic: false,
      loadoutPublic: false,
      stats: null,
      viewer: 'other',
    }), onOpen)
    expect(screen.queryByRole('button', { name: 'Loadout' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Library/ })).toBeNull()
    expect(screen.queryByText('Library is private')).toBeNull()
    expect(screen.queryByText(/patient roguelike reader/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Lists' }))
    expect(onOpen).toHaveBeenCalledWith('/user/ada/lists')
  })

  it('hides a private library and loadout and keeps the lists link', () => {
    const hidden = profileHubModel(profilePage({
      username: 'ada',
      owner: false,
      libraryPublic: false,
      loadoutPublic: false,
      stats: null,
      viewer: 'other',
    }))
    expect(hidden.loadoutHref).toBeNull()
    expect(hidden.library).toBeNull()
    expect(hidden.listsHref).toBe('/user/ada/lists')

    const visible = profileHubModel(profilePage({
      username: 'ada',
      owner: false,
      libraryPublic: true,
      loadoutPublic: true,
      stats: { total_games: 10, completed: 3 },
      viewer: null,
    }))
    expect(visible.loadoutHref).toBe('/user/ada/loadout')
    expect(visible.library).toEqual({ href: '/user/ada/library', totalGames: 10, completed: 3 })
    expect(visible.listsHref).toBe('/user/ada/lists')
  })
})

describe('stack screens', () => {
  it('opens a list and its game', () => {
    const onOpen = vi.fn()
    render(<ListsScreen username="peek" lists={[{
      id: 'list-1',
      name: 'Wishlist',
      description: '',
      is_public: true,
      is_pinned: true,
      is_default: true,
      last_activity: '',
      game_count: 2,
      owner_username: 'peek',
      owner_id: 'viewer-1',
      covers: [],
      like_count: 0,
      viewer_has_liked: false,
    }]} onOpen={onOpen} />)
    fireEvent.click(screen.getByRole('link', { name: 'Wishlist' }))
    expect(onOpen).toHaveBeenCalledWith('/user/peek/lists/list-1')
    cleanup()
    render(
      <ListDetailScreen
        name="Wishlist"
        description="Later."
        games={[{
          id: 'g1',
          name: 'Hades',
          slug: 'hades',
          cover_image_url: null,
          released: null,
          developer: null,
          avg_rating: null,
          user_rating: null,
        }]}
        onOpen={onOpen}
      />,
    )
    expect(screen.getByText('Later.').textContent).toBe('Later.')
    fireEvent.click(screen.getByRole('link', { name: 'Hades' }))
    expect(onOpen).toHaveBeenCalledWith('/games/hades')
  })
})

describe('screen gate', () => {
  it('turns a missing API url and a 404 into the copy the screen shows', async () => {
    const { ApiClientError } = await import('@screenpeak/shared/api/client')
    expect(screenGate({ ready: true, configured: false, loading: false, error: null })).toEqual({
      title: 'API URL missing',
      body: 'Set EXPO_PUBLIC_API_URL to the ScreenPeak server.',
      retry: false,
    })
    expect(screenGate({
      ready: true,
      configured: true,
      loading: false,
      error: new ApiClientError(404, 'not_found', 'Not found.'),
    })).toEqual({ title: "Couldn't load this screen", body: 'Not found.', retry: true })
    expect(screenGate({ ready: true, configured: true, loading: false, error: null })).toBeNull()
  })
})
