// @vitest-environment jsdom
import type { GamePageData } from '@screenpeak/shared/api/games'
import type { ListCard, ListPageData, ListsPageData } from '@screenpeak/shared/api/lists'
import { ApiClientError } from '@screenpeak/shared/api/client'
import { colors, hitTarget, space } from '@screenpeak/shared/tokens'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { listsQueryKey } from '@/lib/lists-page'

import { ClearListsOnSignOut } from './clear-lists-on-sign-out'
import { ListDetail, UserLists } from './lists-browser'

process.env.TZ = 'America/Los_Angeles'

const PEEK = '22222222-2222-4222-8222-222222222222'
const OTHER = '33333333-3333-4333-8333-333333333333'
const LIST = '44444444-4444-4444-8444-444444444444'
const HADES = '11111111-1111-4111-8111-111111111111'
const CELESTE = '55555555-5555-4555-8555-555555555555'

const auth = vi.hoisted(() => ({
  session: { user: { id: '22222222-2222-4222-8222-222222222222' } } as { user: { id: string } } | null,
}))

const push = vi.hoisted(() => vi.fn())
const back = vi.hoisted(() => vi.fn())
const viewport = vi.hoisted(() => ({ width: 375, height: 667, scale: 1, fontScale: 1 }))

const { getLists, getList, createList, updateList, deleteList, likeList, unlikeList, searchGames, syncGames, removeGame } = vi.hoisted(() => ({
  getLists: vi.fn(),
  getList: vi.fn(),
  createList: vi.fn(),
  updateList: vi.fn(),
  deleteList: vi.fn(),
  likeList: vi.fn(),
  unlikeList: vi.fn(),
  searchGames: vi.fn(),
  syncGames: vi.fn(),
  removeGame: vi.fn(),
}))

vi.mock('expo-router', () => ({
  router: {
    push,
    back,
    replace: vi.fn(),
    navigate: vi.fn(),
    dismissTo: vi.fn(),
    canGoBack: () => true,
    canDismiss: () => false,
  },
}))

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ ready: true, session: auth.session }),
}))

vi.mock('@/lib/api', () => ({
  apiConfigured: () => true,
  api: {
    games: { search: searchGames },
    lists: {
      create: createList,
      update: updateList,
      delete: deleteList,
      like: likeList,
      unlike: unlikeList,
      syncGames,
      removeGame,
    },
    users: { lists: getLists, list: getList },
  },
}))

vi.mock('expo-image', () => ({
  Image: () => null,
}))

vi.mock('lucide-react-native', () => {
  function Icon(props: { color?: string, fill?: string, size?: number }) {
    return React.createElement('span', {
      'aria-hidden': 'true',
      'data-color': props.color,
      'data-fill': props.fill,
      'data-size': props.size,
    })
  }
  return { ChevronDown: Icon, Heart: Icon, Lock: Icon, Pin: Icon, X: Icon }
})

vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children, accessibilityLabel }: { children?: React.ReactNode, accessibilityLabel?: string }) => (
    React.createElement('div', { 'aria-label': accessibilityLabel }, children)
  ),
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
    accessibilityElementsHidden,
    disabled,
    hitSlop,
    style,
  }: {
    onPress?: () => void
    children?: React.ReactNode | ((state: { pressed: boolean }) => React.ReactNode)
    accessibilityLabel?: string
    accessibilityRole?: string
    accessibilityState?: { selected?: boolean, checked?: boolean }
    accessibilityElementsHidden?: boolean
    disabled?: boolean
    hitSlop?: number | { top?: number, right?: number, bottom?: number, left?: number }
    style?: unknown
  }) => React.createElement(
    'button',
    {
      type: 'button',
      onClick: onPress,
      ref: (node: (HTMLButtonElement & { press?: () => void }) | null) => {
        if (node && onPress) node.press = onPress
      },
      'aria-label': accessibilityLabel,
      'aria-hidden': accessibilityElementsHidden ? 'true' : undefined,
      role: accessibilityRole ?? 'button',
      'aria-selected': accessibilityState?.selected ? 'true' : undefined,
      'aria-checked': accessibilityState?.checked === undefined ? undefined : String(accessibilityState.checked),
      disabled,
      'data-hit-slop': hitSlop == null ? undefined : JSON.stringify(typeof hitSlop === 'number'
        ? { top: hitSlop, right: hitSlop, bottom: hitSlop, left: hitSlop }
        : hitSlop),
      'data-style': JSON.stringify(flatStyle(style)),
    },
    typeof children === 'function' ? children({ pressed: false }) : children,
  ),
  View: ({
    children,
    accessibilityLabel,
    accessibilityElementsHidden,
    role,
    style,
  }: {
    children?: React.ReactNode
    accessibilityLabel?: string
    accessibilityElementsHidden?: boolean
    role?: string
    style?: unknown
  }) => React.createElement('div', {
    'aria-label': accessibilityLabel,
    'aria-hidden': accessibilityElementsHidden ? 'true' : undefined,
    role,
    'data-style': JSON.stringify(flatStyle(style)),
  }, children),
  Text: ({
    children,
    accessibilityLiveRegion,
    accessibilityRole,
    accessibilityLabel,
    numberOfLines,
    style,
  }: {
    children?: React.ReactNode
    accessibilityLiveRegion?: string
    accessibilityRole?: string
    accessibilityLabel?: string
    numberOfLines?: number
    style?: unknown
  }) => React.createElement('span', {
    role: accessibilityRole === 'header' ? 'heading' : undefined,
    'aria-live': accessibilityLiveRegion,
    'aria-label': accessibilityLabel,
    'data-lines': numberOfLines,
    'data-style': JSON.stringify(flatStyle(style)),
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
    data.length === 0 ? ListEmptyComponent : data.map(item => renderItem({ item })),
  ),
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
  ScrollView: ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children),
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
  useWindowDimensions: () => viewport,
  StyleSheet: { create: (styles: unknown) => styles, absoluteFill: {} },
}))

const WISH: ListCard = {
  id: LIST,
  name: 'Wishlist',
  description: 'Later.',
  is_public: true,
  is_pinned: true,
  is_default: true,
  last_activity: '2026-03-01 00:00:00+00',
  game_count: 1,
  owner_username: 'peek',
  owner_id: PEEK,
  covers: [],
  like_count: 2,
  viewer_has_liked: false,
}

const PAGE: ListsPageData = {
  profile: { id: PEEK, username: 'peek', avatar_url: null },
  tab: 'user',
  default_list_public: true,
  lists: [WISH],
}

const DETAIL: ListPageData = {
  profile: { id: PEEK, username: 'peek', avatar_url: null },
  list: {
    id: LIST,
    name: 'Night runs',
    description: 'After midnight.',
    is_public: true,
    is_pinned: false,
    is_default: false,
    updated_at: '2026-03-01 00:00:00+00',
    game_count: 1,
  },
  like_count: 0,
  games: [{
    id: HADES,
    name: 'Hades',
    slug: 'hades',
    cover_image_url: null,
    released: '2020-09-17',
    developer: 'Supergiant Games',
    avg_rating: 9,
    user_rating: 8,
  }],
  viewer: { is_owner: true, has_liked: false },
}

function gamePage(listIds: string[]): GamePageData {
  return {
    game: {
      id: HADES,
      name: 'Hades',
      slug: 'hades',
      igdb_id: 1,
      cover_image_url: null,
      artwork_image_url: null,
      released: '2020-09-17',
      description: null,
      esrb_rating: null,
      reddit_url: null,
      screenshots: [],
      created_at: null,
    },
    taxonomy: { genres: [], platforms: [], developers: [], publishers: [] },
    stats: {
      total_ratings: 0,
      total_reviews: 0,
      rating_1: 0, rating_2: 0, rating_3: 0, rating_4: 0, rating_5: 0,
      rating_6: 0, rating_7: 0, rating_8: 0, rating_9: 0, rating_10: 0,
      avg_rating: null,
    },
    viewer: {
      review: null,
      libraryEntry: null,
      lists: [{ id: LIST, name: 'Night runs', game_count: 1 }],
      listIdsGameIsIn: listIds,
      defaultListPrivacy: true,
    },
  }
}

function renderLists(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
  return {
    client,
    ...view,
    rerender(next: React.ReactNode) {
      view.rerender(<QueryClientProvider client={client}>{next}</QueryClientProvider>)
    },
  }
}

function pressTwice(name: string) {
  const button = screen.getByRole('button', { name }) as HTMLButtonElement & { press?: () => void }
  const tap = button.press
  if (!tap) throw new Error(`missing press for ${name}`)
  act(() => {
    tap()
    tap()
  })
}

afterEach(() => {
  cleanup()
  viewport.width = 375
  auth.session = { user: { id: PEEK } }
  push.mockReset()
  back.mockReset()
  getLists.mockReset()
  getList.mockReset()
  createList.mockReset()
  updateList.mockReset()
  deleteList.mockReset()
  likeList.mockReset()
  unlikeList.mockReset()
  searchGames.mockReset()
  syncGames.mockReset()
  removeGame.mockReset()
})

describe('UserLists', () => {
  it('shows your lists and opens one', async () => {
    getLists.mockResolvedValue(PAGE)
    renderLists(<UserLists username="peek" />)
    expect((await screen.findByRole('link', { name: 'Wishlist' })).textContent).toContain('Wishlist')
    expect(screen.getByRole('heading', { name: 'Your Lists' }).textContent).toBe('Your Lists')
    expect(screen.getByText('1 game').textContent).toBe('1 game')
    expect(screen.getByLabelText('Updated 2/28/2026').textContent).toBe('2/28/2026')
    expect(screen.getByText('Later.').textContent).toBe('Later.')
    expect(screen.getByRole('button', { name: 'Show: My lists' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'New list' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Unpin Wishlist' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Like list, 2 likes' })).toBeNull()
    expect(screen.getByLabelText('2 likes').textContent).toBe('2')
    fireEvent.click(screen.getByRole('link', { name: 'Wishlist' }))
    expect(push).toHaveBeenCalledWith('/user/peek/lists/' + LIST)
    expect(getLists).toHaveBeenCalledWith('peek', 'user')
  })

  it('keeps the current lists on screen until liked lists arrive', async () => {
    let release: (page: ListsPageData) => void = () => undefined
    getLists.mockImplementation((_username: string, tab: string) => {
      if (tab === 'liked') {
        return new Promise<ListsPageData>((resolve) => {
          release = resolve
        })
      }
      return Promise.resolve(PAGE)
    })
    renderLists(<UserLists username="peek" />)
    expect(await screen.findByRole('link', { name: 'Wishlist' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Show: My lists' }))
    fireEvent.click(screen.getByRole('button', { name: 'Liked lists' }))
    expect(screen.getByRole('button', { name: 'Show: Liked lists' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Wishlist' })).toBeTruthy()
    release({
      ...PAGE,
      tab: 'liked',
      lists: [{ ...WISH, id: 'liked-1', name: 'Ada picks', owner_id: OTHER, owner_username: 'ada', is_pinned: false }],
    })
    expect(await screen.findByRole('link', { name: 'Ada picks' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Wishlist' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Like list, 2 likes' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Pin Ada picks' })).toBeNull()
  })

  it('drops the previous viewer’s list while the next viewer’s lists load', async () => {
    getLists.mockResolvedValue({ ...PAGE, lists: [{ ...WISH, name: 'Secret shelf', is_public: false }] })
    const { rerender } = renderLists(<UserLists username="peek" />)
    expect(await screen.findByRole('link', { name: 'Secret shelf' })).toBeTruthy()
    expect(screen.getByLabelText('Private')).toBeTruthy()
    expect(screen.queryByText(/Private/)).toBeNull()
    const meta = screen.getByText('1 game').parentElement
    expect(JSON.parse(meta?.getAttribute('data-style') || '{}').flexWrap).toBe('nowrap')
    expect(screen.getByText('2/28/2026').getAttribute('data-lines')).toBe('1')
    getLists.mockImplementation(() => new Promise(() => undefined))
    auth.session = { user: { id: OTHER } }
    rerender(<UserLists username="peek" />)
    expect(screen.queryByRole('link', { name: 'Secret shelf' })).toBeNull()
    expect(screen.getByLabelText('Loading lists')).toBeTruthy()
  })

  it('pins immediately, rolls back on a 429, and leaves another viewer’s cache alone', async () => {
    getLists.mockResolvedValue(PAGE)
    let rejectPin: (error: unknown) => void = () => undefined
    updateList.mockImplementation(() => new Promise((_resolve, reject) => {
      rejectPin = reject
    }))
    const { client } = renderLists(<UserLists username="peek" />)
    expect(await screen.findByRole('button', { name: 'Unpin Wishlist' })).toBeTruthy()
    const other = { ...PAGE, lists: [{ ...WISH, name: 'Other shelf' }] }
    client.setQueryData(listsQueryKey('peek', 'user', OTHER), other)
    pressTwice('Unpin Wishlist')
    expect(await screen.findByRole('button', { name: 'Pin Wishlist' })).toBeTruthy()
    expect(updateList).toHaveBeenCalledTimes(1)
    expect(updateList).toHaveBeenCalledWith(LIST, { isPinned: false })
    expect(client.getQueryData(listsQueryKey('peek', 'user', OTHER))).toEqual(other)
    rejectPin(new ApiClientError(429, 'rate_limited', 'slow down', 9))
    expect((await screen.findByText('Too many requests. Try again in 9 seconds.')).textContent)
      .toBe('Too many requests. Try again in 9 seconds.')
    expect(screen.getByRole('button', { name: 'Unpin Wishlist' })).toBeTruthy()
    expect(client.getQueryData(listsQueryKey('peek', 'user', OTHER))).toEqual(other)
  })

  it('shows a created list before the reload finishes', async () => {
    let release: (page: ListsPageData) => void = () => undefined
    getLists.mockResolvedValueOnce(PAGE)
    getLists.mockImplementation(() => new Promise<ListsPageData>((resolve) => {
      release = resolve
    }))
    createList.mockResolvedValue({ id: 'list-9' })
    renderLists(<UserLists username="peek" />)
    expect(await screen.findByRole('link', { name: 'Wishlist' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'New list' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'List name' }), { target: { value: 'Night runs' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Description' }), { target: { value: 'After midnight.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create list' }))
    expect(await screen.findByRole('link', { name: 'Night runs' })).toBeTruthy()
    const labels = screen.getAllByRole('link').map(link => link.getAttribute('aria-label'))
    expect(labels.filter(label => label === 'Wishlist' || label === 'Night runs')).toEqual(['Wishlist', 'Night runs'])
    expect(createList).toHaveBeenCalledWith({
      name: 'Night runs',
      description: 'After midnight.',
      isPublic: true,
      isPinned: false,
    })
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeTruthy()
    release({
      ...PAGE,
      lists: [{ ...WISH, id: 'list-9', name: 'Night runs', is_default: false, is_pinned: false, description: 'After midnight.' }, WISH],
    })
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Saving…' })).toBeNull())
    expect(screen.getByRole('link', { name: 'Night runs' })).toBeTruthy()
  })

  it('shows the rate-limit message and loads lists after Retry', async () => {
    getLists
      .mockRejectedValueOnce(new ApiClientError(429, 'rate_limited', 'slow down', 9))
      .mockResolvedValueOnce(PAGE)
    renderLists(<UserLists username="peek" />)
    expect((await screen.findByText('Too many requests')).textContent).toBe('Too many requests')
    expect(screen.getByText('Too many requests. Try again in 9 seconds.').textContent)
      .toBe('Too many requests. Try again in 9 seconds.')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('link', { name: 'Wishlist' })).toBeTruthy()
  })

  it('shows an empty list of lists for the owner', async () => {
    getLists.mockResolvedValue({ ...PAGE, lists: [] })
    renderLists(<UserLists username="peek" />)
    expect((await screen.findByText('No lists yet.')).textContent).toBe('No lists yet.')
    expect(screen.getByText('Create one to start collecting games.').textContent).toBe('Create one to start collecting games.')
  })

  it('hides New list on someone else’s lists', async () => {
    getLists.mockResolvedValue({
      ...PAGE,
      profile: { id: OTHER, username: 'ada', avatar_url: null },
      default_list_public: null,
      lists: [{ ...WISH, owner_id: OTHER, owner_username: 'ada', name: 'Ada picks', is_pinned: false }],
    })
    renderLists(<UserLists username="ada" />)
    expect((await screen.findByRole('heading', { name: "ada's Lists" })).textContent).toBe("ada's Lists")
    expect(screen.getByRole('link', { name: 'Ada picks' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'New list' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Pin Ada picks' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Like list, 2 likes' })).toBeTruthy()
  })

  it('shows the like count without a like button when signed out', async () => {
    auth.session = null
    getLists.mockResolvedValue({
      ...PAGE,
      default_list_public: null,
      lists: [{ ...WISH, owner_id: OTHER, owner_username: 'ada' }],
    })
    renderLists(<UserLists username="ada" />)
    const count = await screen.findByLabelText('2 likes')
    expect(count.textContent).toBe('2')
    expect(count.getAttribute('role')).toBeNull()
    fireEvent.click(count)
    expect(likeList).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Like list, 2 likes' })).toBeNull()
    expect(screen.queryByText('Sign up to like a list, or to make your own.')).toBeNull()
  })

  it('creates one list when Create is pressed twice', async () => {
    getLists.mockResolvedValue(PAGE)
    let release: () => void = () => undefined
    createList.mockImplementation(() => new Promise<{ id: string }>((resolve) => {
      release = () => resolve({ id: 'list-9' })
    }))
    renderLists(<UserLists username="peek" />)
    expect(await screen.findByRole('link', { name: 'Wishlist' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'New list' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'List name' }), { target: { value: 'Night runs' } })
    pressTwice('Create list')
    await waitFor(() => expect(createList).toHaveBeenCalledTimes(1))
    release()
  })

  it('likes once when Like is pressed twice, and both rate limits return the server label', async () => {
    const ada = { ...WISH, id: 'list-a', name: 'Ada picks', owner_id: OTHER, owner_username: 'ada', is_pinned: false }
    const bob = { ...WISH, id: 'list-b', name: 'Bob picks', owner_id: '66666666-6666-4666-8666-666666666666', owner_username: 'bob', is_pinned: false, like_count: 0 }
    getLists.mockResolvedValue({
      ...PAGE,
      profile: { id: OTHER, username: 'ada', avatar_url: null },
      lists: [ada, bob],
    })
    const rejects: ((error: unknown) => void)[] = []
    likeList.mockImplementation(() => new Promise<void>((_resolve, reject) => {
      rejects.push(reject)
    }))
    renderLists(<UserLists username="ada" />)
    expect(await screen.findByRole('button', { name: 'Like list, 2 likes' })).toBeTruthy()
    pressTwice('Like list, 2 likes')
    fireEvent.click(screen.getByRole('button', { name: 'Like list, 0 likes' }))
    await waitFor(() => expect(likeList).toHaveBeenCalledTimes(2))
    const likedAda = await screen.findByRole('button', { name: 'Unlike list, 3 likes' })
    expect(likedAda.textContent).toBe('3')
    expect(likedAda.querySelector('[data-fill]')?.getAttribute('data-fill')).toBe(colors.accent)
    expect(JSON.parse(likedAda.querySelector('span[data-style]')?.getAttribute('data-style') || '{}').color).toBe(colors.accent)
    expect(JSON.parse(likedAda.querySelector('span[data-style]')?.getAttribute('data-style') || '{}').position).toBeUndefined()
    const likedBob = screen.getByRole('button', { name: 'Unlike list, 1 like' })
    expect(likedBob.textContent).toBe('1')
    rejects[0](new ApiClientError(429, 'rate_limited', 'slow down', 9))
    rejects[1](new ApiClientError(429, 'rate_limited', 'slow down', 9))
    expect(await screen.findByRole('button', { name: 'Like list, 2 likes' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Like list, 0 likes' })).toBeTruthy()
  })

  it('does not show peek’s lists while ada’s lists are still loading', async () => {
    getLists.mockResolvedValue({ ...PAGE, lists: [{ ...WISH, name: 'Secret shelf', is_public: false }] })
    const { rerender } = renderLists(<UserLists username="peek" />)
    expect(await screen.findByRole('link', { name: 'Secret shelf' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Your Lists' })).toBeTruthy()
    getLists.mockImplementation(() => new Promise(() => undefined))
    rerender(<UserLists username="ada" />)
    expect(screen.queryByRole('link', { name: 'Secret shelf' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Your Lists' })).toBeNull()
    expect(screen.getByLabelText('Loading lists')).toBeTruthy()
  })

  it('drops cached lists when the player signs out', async () => {
    getLists.mockResolvedValue({ ...PAGE, lists: [{ ...WISH, name: 'Secret shelf', is_public: false }] })
    const { client, rerender } = renderLists(
      <>
        <ClearListsOnSignOut />
        <UserLists username="peek" />
      </>,
    )
    expect(await screen.findByRole('link', { name: 'Secret shelf' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Your Lists' })).toBeTruthy()
    auth.session = null
    getLists.mockImplementation(() => new Promise(() => undefined))
    rerender(
      <>
        <ClearListsOnSignOut />
        <UserLists username="peek" />
      </>,
    )
    await waitFor(() => expect(client.getQueryData(listsQueryKey('peek', 'user', PEEK))).toBeUndefined())
    expect(screen.queryByRole('link', { name: 'Secret shelf' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Your Lists' })).toBeNull()
  })

  it('fits five covers inside a 320-point card', async () => {
    viewport.width = 320
    const covers = ['a', 'b', 'c', 'd', 'e'].map(slug => ({ cover_image_url: null, slug }))
    getLists.mockResolvedValue({
      ...PAGE,
      profile: { id: OTHER, username: 'ada', avatar_url: null },
      default_list_public: null,
      lists: [
        { ...WISH, name: 'Ada picks', owner_id: OTHER, owner_username: 'ada', is_pinned: false, covers },
        WISH,
      ],
    })
    renderLists(<UserLists username="ada" />)
    const title = await screen.findByRole('link', { name: 'Ada picks' })
    const owner = screen.getByRole('link', { name: 'ada' })
    const like = screen.getByRole('button', { name: 'Like list, 2 likes' })
    const pin = screen.getByRole('button', { name: 'Unpin Wishlist' })
    const wish = screen.getByRole('link', { name: 'Wishlist' })
    const ownerStyle = JSON.parse(owner.getAttribute('data-style') || '{}')
    expect(JSON.parse(title.getAttribute('data-style') || '{}').minHeight).toBe(hitTarget)
    expect(ownerStyle.minHeight).toBeUndefined()
    expect(ownerStyle.alignSelf).toBe('flex-start')
    expect(ownerStyle.flex).toBeUndefined()
    fireEvent.click(owner)
    expect(push).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledWith('/user/ada')
    push.mockClear()
    const rest = owner.parentElement?.querySelector('button[aria-hidden="true"]')
    expect(rest).toBeTruthy()
    fireEvent.click(rest!)
    expect(push).toHaveBeenCalledWith(`/user/ada/lists/${LIST}`)
    expect(push).not.toHaveBeenCalledWith('/user/ada')
    const likeStyle = JSON.parse(like.getAttribute('data-style') || '{}')
    const slop = JSON.parse(like.getAttribute('data-hit-slop') || '{}') as { top: number, bottom: number }
    const heart = like.querySelector('[data-size]')
    const heartSize = Number(heart?.getAttribute('data-size'))
    const rowStyle = JSON.parse(heart?.parentElement?.getAttribute('data-style') || '{}')
    const countStyle = JSON.parse(like.querySelector('span[data-style]')?.getAttribute('data-style') || '{}')
    expect(likeStyle.minHeight).toBeUndefined()
    expect(likeStyle.borderWidth).toBeUndefined()
    expect(heartSize).toBe(16)
    expect(slop.top + heartSize + slop.bottom).toBeGreaterThanOrEqual(hitTarget)
    expect(rowStyle.flexDirection).toBe('row')
    expect(rowStyle.alignItems).toBe('center')
    expect(like.querySelector('[data-color]')?.getAttribute('data-color')).toBe(colors.accent)
    expect(like.querySelector('[data-fill]')?.getAttribute('data-fill')).toBe('transparent')
    expect(like.textContent).toBe('2')
    expect(countStyle.color).toBe(colors.accent)
    expect(countStyle.position).toBeUndefined()
    const ownCount = screen.getByLabelText('2 likes')
    expect(ownCount.textContent).toBe('2')
    expect(wish.contains(ownCount)).toBe(false)
    expect(title.contains(like)).toBe(false)
    expect(wish.contains(pin)).toBe(false)
    expect(like.parentElement?.contains(pin)).toBe(false)
    expect(pin.parentElement?.contains(like)).toBe(false)
    const coverNodes = Array.from(document.querySelectorAll('[data-style]')).filter(node => {
      const style = JSON.parse(node.getAttribute('data-style') || '{}')
      return style.flex === 1 && style.maxWidth === space[12] && style.height === space[16]
    })
    expect(coverNodes).toHaveLength(5)
    const inner = viewport.width - space[4] * 2 - space[3] * 2
    const gaps = space[2] * 4
    const coverWidth = Math.min(space[12], (inner - gaps) / 5)
    expect(coverWidth * 5 + gaps).toBeLessThanOrEqual(inner)
    expect(coverWidth).toBeLessThan(space[12])
  })

  it('keeps a three-digit count beside the heart', async () => {
    getLists.mockResolvedValue({
      ...PAGE,
      profile: { id: OTHER, username: 'ada', avatar_url: null },
      lists: [{ ...WISH, name: 'Ada picks', owner_id: OTHER, owner_username: 'ada', is_pinned: false, like_count: 100, viewer_has_liked: true }],
    })
    renderLists(<UserLists username="ada" />)
    const like = await screen.findByRole('button', { name: 'Unlike list, 100 likes' })
    const heart = like.querySelector('[data-size]')
    const rowStyle = JSON.parse(heart?.parentElement?.getAttribute('data-style') || '{}')
    const countStyle = JSON.parse(like.querySelector('span[data-style]')?.getAttribute('data-style') || '{}')
    expect(like.textContent).toBe('100')
    expect(heart?.getAttribute('data-size')).toBe('16')
    expect(heart?.getAttribute('data-fill')).toBe(colors.accent)
    expect(rowStyle.flexDirection).toBe('row')
    expect(rowStyle.alignItems).toBe('center')
    expect(countStyle.color).toBe(colors.accent)
    expect(countStyle.position).toBeUndefined()
  })
})

describe('ListDetail', () => {
  it('shows the owner, the description, and a half-width cover that remove does not open', async () => {
    getList.mockResolvedValue(DETAIL)
    renderLists(<ListDetail username="peek" listId={LIST} />)
    expect((await screen.findByRole('heading', { name: 'Night runs' })).textContent).toBe('Night runs')
    expect(screen.getByText('After midnight.').textContent).toBe('After midnight.')
    expect(screen.getByText('1 game').textContent).toBe('1 game')
    expect(screen.getByLabelText('Updated 2/28/2026').textContent).toBe('2/28/2026')
    expect(screen.getByLabelText('0 likes').textContent).toBe('0')
    expect(screen.queryByRole('button', { name: 'Like list, 0 likes' })).toBeNull()
    expect(screen.getByRole('link', { name: 'peek' })).toBeTruthy()
    const remove = screen.getByRole('button', { name: 'Remove Hades' })
    expect(JSON.parse(remove.getAttribute('data-style') || '{}').minHeight).toBe(hitTarget)
    expect(JSON.parse(remove.getAttribute('data-style') || '{}').minWidth).toBe(hitTarget)
    const cell = screen.getByRole('link', { name: 'Hades' }).parentElement
    const pad = viewport.width <= 375 ? space[4] : space[6]
    expect(JSON.parse(cell?.getAttribute('data-style') || '{}').width).toBe((viewport.width - pad * 2 - space[3]) / 2)
    fireEvent.click(remove)
    expect(push).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Remove Hades?' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }))
    expect(screen.getByRole('link', { name: 'Hades' })).toBeTruthy()
    expect(removeGame).not.toHaveBeenCalled()
  })

  it('removes a game immediately, restores it on a 429, and leaves another viewer’s game page alone', async () => {
    getList.mockResolvedValue(DETAIL)
    let rejectRemove: (error: unknown) => void = () => undefined
    removeGame.mockImplementation(() => new Promise((_resolve, reject) => {
      rejectRemove = reject
    }))
    const { client } = renderLists(<ListDetail username="peek" listId={LIST} />)
    expect(await screen.findByRole('link', { name: 'Hades' })).toBeTruthy()
    client.setQueryData(['game', 'hades', PEEK], gamePage([LIST]))
    client.setQueryData(['game', 'hades', OTHER], gamePage([LIST]))
    client.setQueryData(['game', 'hades', 'reviews', PEEK, 1, 'date', 'desc'], { reviews: ['kept'] })
    fireEvent.click(screen.getByRole('button', { name: 'Remove Hades' }))
    pressTwice('Remove')
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Hades' })).toBeNull())
    expect(removeGame).toHaveBeenCalledTimes(1)
    expect(removeGame).toHaveBeenCalledWith(LIST, HADES)
    expect(client.getQueryData<GamePageData>(['game', 'hades', PEEK])?.viewer?.listIdsGameIsIn).toEqual([])
    expect(client.getQueryData<GamePageData>(['game', 'hades', OTHER])?.viewer?.listIdsGameIsIn).toEqual([LIST])
    expect(client.getQueryData(['game', 'hades', 'reviews', PEEK, 1, 'date', 'desc'])).toEqual({ reviews: ['kept'] })
    rejectRemove(new ApiClientError(429, 'rate_limited', 'slow down', 4))
    expect((await screen.findByText('Too many requests. Try again in 4 seconds.')).textContent)
      .toBe('Too many requests. Try again in 4 seconds.')
    expect(screen.getByRole('link', { name: 'Hades' })).toBeTruthy()
    expect(client.getQueryData<GamePageData>(['game', 'hades', PEEK])?.viewer?.listIdsGameIsIn).toEqual([LIST])
  })

  it('hides delete on the default list and deletes a custom list after confirmation', async () => {
    getList.mockResolvedValue({ ...DETAIL, list: { ...DETAIL.list, is_default: true, name: 'Wishlist' } })
    renderLists(<ListDetail username="peek" listId={LIST} />)
    expect(await screen.findByRole('heading', { name: 'Wishlist' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Edit list' }))
    expect(screen.queryByRole('button', { name: 'Delete list' })).toBeNull()
    cleanup()
    getList.mockResolvedValue(DETAIL)
    deleteList.mockResolvedValue(undefined)
    renderLists(<ListDetail username="peek" listId={LIST} />)
    expect(await screen.findByRole('heading', { name: 'Night runs' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Edit list' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete list' }))
    expect(screen.getByRole('dialog', { name: 'Delete this list?' })).toBeTruthy()
    expect(screen.getByText('This cannot be undone.').textContent).toBe('This cannot be undone.')
    fireEvent.click(screen.getByRole('button', { name: 'Delete list' }))
    await waitFor(() => expect(deleteList).toHaveBeenCalledWith(LIST))
    await waitFor(() => expect(back).toHaveBeenCalled())
  })

  it('renames the list before the save returns', async () => {
    getList.mockResolvedValue(DETAIL)
    let release: () => void = () => undefined
    updateList.mockImplementation(() => new Promise<void>((resolve) => {
      release = resolve
    }))
    renderLists(<ListDetail username="peek" listId={LIST} />)
    expect(await screen.findByRole('heading', { name: 'Night runs' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Edit list' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'List name' }), { target: { value: 'Dawn runs' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('heading', { name: 'Dawn runs' })).toBeTruthy()
    expect(updateList).toHaveBeenCalledWith(LIST, {
      name: 'Dawn runs',
      description: 'After midnight.',
      isPublic: true,
      isPinned: false,
    })
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeTruthy()
    release()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit list' })).toBeNull())
  })

  it('adds a searched game and keeps one that was already selected', async () => {
    getList.mockResolvedValue(DETAIL)
    searchGames.mockResolvedValue({
      games: [{
        id: CELESTE,
        name: 'Celeste',
        slug: 'celeste',
        cover_image_url: null,
        released: '2018-01-25',
        avg_rating: 9,
      }],
    })
    let release: () => void = () => undefined
    syncGames.mockImplementation(() => new Promise<void>((resolve) => {
      release = resolve
    }))
    renderLists(<ListDetail username="peek" listId={LIST} />)
    expect(await screen.findByRole('link', { name: 'Hades' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Add games' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Search games' }), { target: { value: 'cel' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Celeste' }))
    pressTwice('Save games')
    expect(await screen.findByRole('link', { name: 'Celeste' })).toBeTruthy()
    expect(syncGames).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('link', { name: 'Hades' })).toBeTruthy()
    expect(syncGames).toHaveBeenCalledWith(LIST, { toAdd: [{ id: CELESTE }], toRemove: [] })
    expect(searchGames).toHaveBeenCalledWith('cel')
    release()
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add games' })).toBeNull())
  })

  it('shows the later search when the earlier one resolves last', async () => {
    getList.mockResolvedValue(DETAIL)
    let resolveHades: (value: unknown) => void = () => undefined
    let resolveCeleste: (value: unknown) => void = () => undefined
    searchGames.mockImplementation((query: string) => new Promise((resolve) => {
      if (query === 'hades') resolveHades = resolve
      else resolveCeleste = resolve
    }))
    renderLists(<ListDetail username="peek" listId={LIST} />)
    expect(await screen.findByRole('link', { name: 'Hades' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Add games' }))
    const field = screen.getByRole('textbox', { name: 'Search games' })
    fireEvent.change(field, { target: { value: 'hades' } })
    pressTwice('Search')
    fireEvent.change(field, { target: { value: 'celeste' } })
    fireEvent.click(screen.getByRole('button', { name: 'Searching…' }))
    resolveCeleste({
      games: [{ id: CELESTE, name: 'Celeste', slug: 'celeste', cover_image_url: null, released: '2018-01-25', avg_rating: 9 }],
    })
    expect(await screen.findByRole('button', { name: 'Celeste' })).toBeTruthy()
    resolveHades({
      games: [{ id: HADES, name: 'Hades II', slug: 'hades-ii', cover_image_url: null, released: '2024-01-01', avg_rating: 9 }],
    })
    await waitFor(() => expect(searchGames).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('button', { name: 'Celeste' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Hades II' })).toBeNull()
  })

  it('does not keep the previous list while the next list loads', async () => {
    getList.mockResolvedValue(DETAIL)
    const { rerender } = renderLists(<ListDetail username="peek" listId={LIST} />)
    expect(await screen.findByRole('heading', { name: 'Night runs' })).toBeTruthy()
    getList.mockImplementation(() => new Promise(() => undefined))
    rerender(<ListDetail username="peek" listId={CELESTE} />)
    expect(screen.queryByRole('heading', { name: 'Night runs' })).toBeNull()
    expect(screen.getByLabelText('Loading list')).toBeTruthy()
  })

  it('reloads when the game page invalidates lists', async () => {
    getList.mockResolvedValue(DETAIL)
    const { client } = renderLists(<ListDetail username="peek" listId={LIST} />)
    expect(await screen.findByRole('link', { name: 'Hades' })).toBeTruthy()
    getList.mockClear()
    await client.invalidateQueries({ queryKey: ['lists'] })
    expect(getList).toHaveBeenCalledWith('peek', LIST)
  })

  it('shows an empty list and hides owner controls for someone else', async () => {
    getList.mockResolvedValue({
      ...DETAIL,
      games: [],
      list: { ...DETAIL.list, game_count: 0 },
      viewer: { is_owner: false, has_liked: false },
    })
    renderLists(<ListDetail username="ada" listId={LIST} />)
    expect((await screen.findByText('This list is empty')).textContent).toBe('This list is empty')
    expect(screen.getByText("The owner hasn't added any games yet.").textContent)
      .toBe("The owner hasn't added any games yet.")
    expect(screen.queryByRole('button', { name: 'Edit list' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add games' })).toBeNull()
    const like = screen.getByRole('button', { name: 'Like list, 0 likes' })
    expect(like.querySelector('[data-fill]')?.getAttribute('data-fill')).toBe('transparent')
    expect(like.textContent).toBe('0')
    let release: () => void = () => undefined
    likeList.mockImplementation(() => new Promise<void>((resolve) => {
      release = resolve
    }))
    fireEvent.click(like)
    const liked = await screen.findByRole('button', { name: 'Unlike list, 1 like' })
    expect(liked.textContent).toBe('1')
    expect(liked.querySelector('[data-fill]')?.getAttribute('data-fill')).toBe(colors.accent)
    expect(JSON.parse(liked.querySelector('span[data-style]')?.getAttribute('data-style') || '{}').color).toBe(colors.accent)
    expect(liked.querySelector('[data-size]')?.getAttribute('data-size')).toBe('16')
    release()
  })

  it('tells the owner an empty list can be filled', async () => {
    getList.mockResolvedValue({
      ...DETAIL,
      games: [],
      list: { ...DETAIL.list, game_count: 0, name: 'Wishlist', is_default: true },
    })
    renderLists(<ListDetail username="peek" listId={LIST} />)
    expect((await screen.findByText('This list is empty')).textContent).toBe('This list is empty')
    expect(screen.getByText('Add a few games to get it started.').textContent).toBe('Add a few games to get it started.')
  })

  it('shows a private list on one line and keeps the like count off a button', async () => {
    getList.mockResolvedValue({
      ...DETAIL,
      list: { ...DETAIL.list, is_public: false, name: 'Secret shelf' },
      like_count: 4,
    })
    renderLists(<ListDetail username="peek" listId={LIST} />)
    expect(await screen.findByRole('heading', { name: 'Secret shelf' })).toBeTruthy()
    expect(screen.getByLabelText('Private')).toBeTruthy()
    expect(screen.queryByText(/Private/)).toBeNull()
    expect(screen.getByLabelText('4 likes').textContent).toBe('4')
    expect(screen.queryByRole('button', { name: 'Like list, 4 likes' })).toBeNull()
    const row = screen.getByText('1 game').parentElement
    expect(JSON.parse(row?.getAttribute('data-style') || '{}').flexWrap).toBe('nowrap')
  })
})
