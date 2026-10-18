// @vitest-environment jsdom
import type { ExplorePageData } from '@screenpeak/shared/api/explore'
import type { LibraryGameCard } from '@screenpeak/shared/api/library'
import type { ProfilePageData } from '@screenpeak/shared/api/profile'
import type { FeedItem } from '@screenpeak/shared/types'
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import AppTabs from './app-tabs'
import { CatalogueScreen } from './catalogue-screen'
import { ExploreScreen } from './explore-screen'
import { FeedScreen } from './feed-screen'
import { LibraryScreen } from './library-screen'
import { ListDetailScreen } from './list-detail-screen'
import { ListsScreen } from './lists-screen'
import { LoadoutScreen } from './loadout-screen'
import { ProfileHub } from './profile-hub'
import { WelcomeScreen } from './welcome-screen'
import { screenGate } from './screen-state'
import { loadProfileHub, profileHubModel } from '@/lib/profile-hub'

vi.mock('expo-router/unstable-native-tabs', () => {
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

vi.mock('react-native', () => ({
  Linking: { openURL: vi.fn(() => Promise.resolve()) },
  Pressable: ({
    onPress,
    children,
    accessibilityLabel,
    accessibilityRole,
    disabled,
  }: {
    onPress?: () => void
    children?: React.ReactNode
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
    children,
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
    'aria-label': accessibilityLabel,
    role: role ?? accessibilityRole,
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
  StyleSheet: { create: (styles: unknown) => styles },
}))

vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children),
}))

vi.mock('expo-image', () => ({
  Image: () => null,
}))

afterEach(() => {
  cleanup()
})

const OPEN = vi.fn()

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
    game_released: null,
    game_developer: null,
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
    description: '',
    owner_username: 'mina',
    last_activity: '2026-10-01 00:00:00+00',
    game_count: 3,
    like_count: 2,
    viewer_has_liked: false,
    covers: [],
  }],
  recommendations: {
    games: [{
      id: 'g-hades',
      name: 'Hades',
      slug: 'hades',
      cover_image_url: null,
      released: null,
      developer: null,
      avg_rating: 9,
      user_rating: null,
      avg_follower_rating: 8.5,
      follower_count: 2,
      library_status: null,
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
      selected_title: null,
      created_at: '2026-01-01 00:00:00+00',
      mutual_follower_count: 1,
      follower_count: 4,
      following_count: 2,
      game_count: 10,
      avg_rating: 8,
    }],
  },
  viewer: { id: 'viewer' },
}

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
    expect(screen.getByLabelText('ScreenPeak').textContent).toBe('ScreenPeak')
  })
})

describe('feed', () => {
  it('shows the welcome screen when signed out, even if items were passed', () => {
    render(<FeedScreen signedIn={false} items={[feedItem({})]} onOpen={OPEN} />)
    expect(screen.getByRole('button', { name: 'Browse' }).textContent).toBe('Browse')
    expect(screen.queryByText('ada rated Hades a 9/10')).toBeNull()
  })

  it('shows a rating and opens the game when signed in', () => {
    const onOpen = vi.fn()
    render(<FeedScreen signedIn items={[feedItem({})]} onOpen={onOpen} />)
    fireEvent.click(screen.getByRole('link', { name: 'ada rated Hades a 9/10' }))
    expect(onOpen).toHaveBeenCalledWith('/games/hades')
    expect(screen.queryByRole('button', { name: 'Browse' })).toBeNull()
  })

  it('opens a liked list on that list', () => {
    const onOpen = vi.fn()
    render(<FeedScreen signedIn items={[feedItem({
      activity_type: 'list_liked',
      game_slug: null,
      game_name: null,
      rating: null,
      list_id: 'list-1',
      list_name: 'Underworld',
      list_owner_username: 'ada',
    })]} onOpen={onOpen} />)
    fireEvent.click(screen.getByRole('link', { name: 'ada liked "Underworld" by ada' }))
    expect(onOpen).toHaveBeenCalledWith('/user/ada/lists/list-1')
  })

  it('says the feed is empty when there is no activity', () => {
    render(<FeedScreen signedIn items={[]} onOpen={OPEN} />)
    expect(screen.getByText('Nothing in your feed yet.').textContent).toBe('Nothing in your feed yet.')
  })
})

describe('explore', () => {
  const genres = [{ id: 'genre-1', name: 'Roguelike', slug: 'roguelike' }]
  const platforms = [{ id: 'platform-1', name: 'PC', slug: 'pc' }]

  it('searches, then shows trending, friends, recommendations, and browse', () => {
    const onOpen = vi.fn()
    const onSearch = vi.fn()
    render(
      <ExploreScreen
        data={EXPLORE}
        genres={genres}
        platforms={platforms}
        results={[{ id: 'g-hades', name: 'Hades', slug: 'hades', cover_image_url: null, released: null, avg_rating: 9 }]}
        searching={false}
        searchError={null}
        onSearch={onSearch}
        onOpen={onOpen}
        onRange={() => undefined}
      />,
    )
    fireEvent.change(screen.getByLabelText('Search games'), { target: { value: 'Hades' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect(onSearch).toHaveBeenCalledWith('Hades')
    fireEvent.click(screen.getByRole('link', { name: 'Hades' }))
    expect(onOpen).toHaveBeenCalledWith('/games/hades')
    expect(screen.getByRole('link', { name: 'Celeste' }).textContent).toBe('Celeste')
    expect(screen.getByText('2 followers completed').textContent).toBe('2 followers completed')
    fireEvent.click(screen.getByRole('link', { name: 'Underworld' }))
    expect(onOpen).toHaveBeenCalledWith('/user/ada/lists/list-rec')
    fireEvent.click(screen.getByRole('link', { name: 'ada' }))
    expect(onOpen).toHaveBeenCalledWith('/user/ada')
    fireEvent.click(screen.getByRole('button', { name: 'Browse Roguelike' }))
    expect(onOpen).toHaveBeenCalledWith('/games?genre=roguelike')
    fireEvent.click(screen.getByRole('button', { name: 'Browse PC' }))
    expect(onOpen).toHaveBeenCalledWith('/games?platform=pc')
    fireEvent.click(screen.getByRole('button', { name: 'Browse all' }))
    expect(onOpen).toHaveBeenCalledWith('/games')
  })

  it('does not search an empty name', () => {
    const onSearch = vi.fn()
    render(
      <ExploreScreen
        data={{ ...EXPLORE, recommendations: null, viewer: null }}
        genres={[]}
        platforms={[]}
        results={null}
        searching={false}
        searchError={null}
        onSearch={onSearch}
        onOpen={OPEN}
        onRange={() => undefined}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect(onSearch).not.toHaveBeenCalled()
    expect(screen.getByText('Type a game name.').textContent).toBe('Type a game name.')
    expect(screen.getByText("Sign up to see what people you follow are playing.").textContent)
      .toBe("Sign up to see what people you follow are playing.")
    expect(screen.getByText('Sign up to get recommendations.').textContent).toBe('Sign up to get recommendations.')
    expect(screen.getAllByRole('button', { name: 'Sign up' })).toHaveLength(2)
    expect(screen.queryByText('2 followers completed')).toBeNull()
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
    expect(screen.getByText('Completed').textContent).toBe('Completed')
    fireEvent.click(screen.getByRole('link', { name: 'Hades' }))
    expect(onOpen).toHaveBeenCalledWith('/games/hades')
    cleanup()
    render(<LibraryScreen locked={false} games={[{ ...HADES, id: '22222222-2222-2222-2222-222222222222', name: 'Celeste', slug: 'celeste', library_status: 'abandoned' }]} onOpen={onOpen} />)
    expect(screen.getByText('Abandoned').textContent).toBe('Abandoned')
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
    const model = profileHubModel(data)
    expect(model.loadoutHref).toBeNull()
    expect(model.library).toBeNull()
    render(<ProfileHub model={model} onOpen={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Loadout' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Library/ })).toBeNull()
    expect(screen.queryByText('10 games · 3 completed')).toBeNull()
    expect(screen.queryByText('A patient roguelike reader.')).toBeNull()
    expect(screen.getByRole('button', { name: 'Lists' })).toBeTruthy()
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
    expect(screen.queryByText('A patient roguelike reader.')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Lists' }))
    expect(onOpen).toHaveBeenCalledWith('/user/ada/lists')
  })

  it('loads another player from the profile route only, public or private', async () => {
    const privatePage = profilePage({
      username: 'ada',
      owner: false,
      libraryPublic: false,
      loadoutPublic: false,
      stats: null,
      viewer: 'other',
    })
    const publicPage = profilePage({
      username: 'ada',
      owner: false,
      libraryPublic: true,
      loadoutPublic: true,
      stats: { total_games: 10, completed: 3 },
      viewer: null,
    })
    const pages = [privatePage, publicPage]
    const get = vi.fn(async (username: string) => {
      const page = pages.shift()
      if (!page || page.profile.username !== username) throw new Error('unexpected profile fetch')
      return page
    })
    const library = vi.fn(async () => {
      throw new Error('library was fetched')
    })
    const loadout = vi.fn(async () => {
      throw new Error('loadout was fetched')
    })
    const lists = vi.fn(async () => {
      throw new Error('lists were fetched')
    })
    const users = { get, library, loadout, lists }

    const hidden = await loadProfileHub({ users }, 'ada')
    expect(hidden.loadoutHref).toBeNull()
    expect(hidden.library).toBeNull()
    expect(hidden.listsHref).toBe('/user/ada/lists')

    const visible = await loadProfileHub({ users }, 'ada')
    expect(visible.loadoutHref).toBe('/user/ada/loadout')
    expect(visible.library).toEqual({ href: '/user/ada/library', totalGames: 10, completed: 3 })
    expect(visible.listsHref).toBe('/user/ada/lists')
    expect(get.mock.calls).toEqual([['ada'], ['ada']])
  })
})

describe('stack screens', () => {
  it('opens a catalogue game and the next page', () => {
    const onOpen = vi.fn()
    const onPage = vi.fn()
    render(
      <CatalogueScreen
        filterLabel="Roguelike"
        games={[{ id: 'g1', name: 'Hades', slug: 'hades', cover_image_url: null, released: null, developer: null, avg_rating: 9, user_rating: null }]}
        total={11}
        page={1}
        totalPages={2}
        onOpen={onOpen}
        onPage={onPage}
        onBack={() => onOpen('/back')}
      />,
    )
    expect(screen.getByText('Roguelike').textContent).toBe('Roguelike')
    fireEvent.click(screen.getByRole('link', { name: 'Hades' }))
    expect(onOpen).toHaveBeenCalledWith('/games/hades')
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(onPage).toHaveBeenCalledWith(2)
  })

  it('opens a list and its game', () => {
    const onOpen = vi.fn()
    render(<ListsScreen username="peek" lists={[{ id: 'list-1', name: 'Wishlist', game_count: 2 }]} onOpen={onOpen} />)
    fireEvent.click(screen.getByRole('link', { name: 'Wishlist' }))
    expect(onOpen).toHaveBeenCalledWith('/user/peek/lists/list-1')
    cleanup()
    render(
      <ListDetailScreen
        name="Wishlist"
        description="Later."
        games={[{ slug: 'hades', name: 'Hades' }]}
        onOpen={onOpen}
      />,
    )
    expect(screen.getByText('Later.').textContent).toBe('Later.')
    fireEvent.click(screen.getByRole('link', { name: 'Hades' }))
    expect(onOpen).toHaveBeenCalledWith('/games/hades')
  })

  it('shows a loadout paragraph and a genre', () => {
    render(
      <LoadoutScreen
        username="peek"
        identity="A patient roguelike reader."
        ratingCount={5}
        avgRating={8}
        genres={[{ genre_name: 'Roguelike', weighted_rating: 8, rated_count: 5, completed_count: 2 }]}
        onBack={() => undefined}
      />,
    )
    expect(screen.getByText("peek's Loadout").textContent).toBe("peek's Loadout")
    expect(screen.getByText('A patient roguelike reader.').textContent).toBe('A patient roguelike reader.')
    expect(screen.getByText('Roguelike').textContent).toBe('Roguelike')
    expect(screen.getByText('5 rated · 8 average').textContent).toBe('5 rated · 8 average')
  })
})

describe('screen gate', () => {
  it('turns a missing API url and a 404 into the copy the screen shows', async () => {
    const { ApiClientError } = await import('@/lib/api/client')
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
