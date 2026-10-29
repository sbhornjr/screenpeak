// @vitest-environment jsdom
import type { ProfilePageData } from '@screenpeak/shared/api/profile'
import { ApiClientError } from '@screenpeak/shared/api/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'


import { ProfileHubScreen } from './profile-hub-screen'

const { getProfile, follow, unfollow } = vi.hoisted(() => ({
  getProfile: vi.fn(),
  follow: vi.fn(),
  unfollow: vi.fn(),
}))

vi.mock('expo-router', () => ({
  router: { push: vi.fn(), back: vi.fn(), replace: vi.fn(), navigate: vi.fn(), dismissTo: vi.fn(), canGoBack: () => false, canDismiss: () => false },
}))

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ ready: true, session: { user: { id: 'viewer' } } }),
}))

vi.mock('@/lib/api', () => ({
  apiConfigured: () => true,
  api: { users: { get: getProfile, follow, unfollow } },
}))

vi.mock('expo-image', () => ({
  Image: () => null,
}))

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
      role: accessibilityRole ?? 'button',
      disabled,
    },
    children,
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
    accessibilityLiveRegion,
  }: {
    children?: React.ReactNode
    accessibilityLiveRegion?: string
  }) => React.createElement('span', { 'aria-live': accessibilityLiveRegion }, children),
  ScrollView: ({
    children,
    refreshControl,
  }: {
    children?: React.ReactNode
    refreshControl?: React.ReactNode
  }) => React.createElement('div', null, refreshControl, children),
  RefreshControl: ({ onRefresh }: { onRefresh?: () => void }) => React.createElement(
    'button',
    { type: 'button', 'aria-label': 'Refresh', onClick: onRefresh },
  ),
  useWindowDimensions: () => ({ width: 375, height: 667, scale: 1, fontScale: 1 }),
  StyleSheet: { create: (styles: unknown) => styles, absoluteFill: {} },
}))

const ADA = '33333333-3333-3333-3333-333333333333'
const PEEK = '11111111-1111-4111-8111-111111111111'
const NOVA = '44444444-4444-4444-8444-444444444444'

function ada(following: boolean, followers: number): ProfilePageData {
  return {
    profile: {
      id: ADA,
      username: 'ada',
      display_name: 'Ada Lovelace',
      avatar_url: null,
      created_at: '2026-01-15 00:00:00+00',
      selected_title: 'Ranger',
      user_bio: 'Writes proofs.',
      profile_loadout_bio: null,
      library_public: false,
      loadout_public: false,
      follower_count: followers,
      following_count: 2,
    },
    library_stats: null,
    favorites: [],
    recent_reviews: [],
    rating_count: 1,
    avg_rating: 9,
    viewer: { is_owner: false, is_following: following, top_developer_names: [] },
  }
}

afterEach(() => {
  cleanup()
  getProfile.mockReset()
  follow.mockReset()
  unfollow.mockReset()
})

function peek(followingCount: number): ProfilePageData {
  return {
    profile: {
      id: PEEK,
      username: 'peek',
      display_name: 'Peek',
      avatar_url: null,
      created_at: '2026-01-15 00:00:00+00',
      selected_title: null,
      user_bio: null,
      profile_loadout_bio: null,
      library_public: true,
      loadout_public: true,
      follower_count: 1,
      following_count: followingCount,
    },
    library_stats: { total_games: 5, completed: 3 },
    favorites: [],
    recent_reviews: [],
    rating_count: 5,
    avg_rating: 8,
    viewer: { is_owner: true, is_following: false, top_developer_names: [] },
  }
}

function nova(following: boolean, followers: number): ProfilePageData {
  const row = ada(following, followers)
  return {
    ...row,
    profile: { ...row.profile, id: NOVA, username: 'nova', display_name: 'Nova Vale' },
  }
}

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ProfileHubScreen username="ada" />
    </QueryClientProvider>,
  )
}

describe('profile follow', () => {
  it('follows by the player id, shows the new count, and rolls it back when the write is refused', async () => {
    getProfile.mockResolvedValue(ada(false, 4))
    let rejectFollow: (error: unknown) => void = () => undefined
    follow.mockImplementation(() => new Promise((_resolve, reject) => { rejectFollow = reject }))
    renderScreen()

    const button = await screen.findByRole('button', { name: 'Follow ada' })
    fireEvent.click(button)
    fireEvent.click(button)
    await waitFor(() => expect(follow).toHaveBeenCalledTimes(1))
    expect(follow).toHaveBeenCalledWith(ADA)
    expect(screen.getByRole('button', { name: 'Unfollow ada' }).textContent).toBe('Following')
    expect(screen.getByText('5 followers · 2 following').textContent).toBe('5 followers · 2 following')

    getProfile.mockResolvedValue(ada(false, 4))
    rejectFollow(new ApiClientError(429, 'rate_limited', 'Too many requests. Try again soon.', 8))

    expect(await screen.findByText('Too many requests. Try again in 8 seconds.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Follow ada' }).textContent).toBe('Follow')
    expect(screen.getByText('4 followers · 2 following').textContent).toBe('4 followers · 2 following')
  })

  it('drops a follower when you unfollow and shows the count from a later refresh', async () => {
    getProfile.mockResolvedValueOnce(ada(true, 4)).mockResolvedValueOnce(ada(false, 3)).mockResolvedValue(ada(false, 2))
    unfollow.mockResolvedValue({ following: false })
    renderScreen()

    fireEvent.click(await screen.findByRole('button', { name: 'Unfollow ada' }))
    expect(await screen.findByRole('button', { name: 'Follow ada' })).toBeTruthy()
    expect(screen.getByText('3 followers · 2 following').textContent).toBe('3 followers · 2 following')

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(await screen.findByText('2 followers · 2 following')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Follow ada' }).textContent).toBe('Follow')
  })

  it('follows Ada, refreshes your following count, and leaves another viewer’s Ada row alone', async () => {
    let followed = false
    getProfile.mockImplementation(async (username: string) => {
      if (username === 'peek') return peek(followed ? 3 : 2)
      return ada(followed, followed ? 5 : 4)
    })
    follow.mockImplementation(async () => {
      followed = true
      return { following: true }
    })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(['profile', 'ada', 'other-viewer'], ada(false, 4))
    render(
      <QueryClientProvider client={client}>
        <ProfileHubScreen username="peek" />
        <ProfileHubScreen username="ada" />
      </QueryClientProvider>,
    )

    expect(await screen.findByText('1 follower · 2 following')).toBeTruthy()
    fireEvent.click(await screen.findByRole('button', { name: 'Follow ada' }))
    expect(await screen.findByText('1 follower · 3 following')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Unfollow ada' }).textContent).toBe('Following')
    expect(screen.getByText('5 followers · 2 following').textContent).toBe('5 followers · 2 following')
    const cached = client.getQueryData<ProfilePageData>(['profile', 'ada', 'other-viewer'])
    expect(cached?.viewer?.is_following).toBe(false)
    expect(cached?.profile.follower_count).toBe(4)
  })

  it('clears a follow in progress when you open another profile', async () => {
    let rejectFollow: (error: unknown) => void = () => undefined
    follow.mockImplementation(() => new Promise((_resolve, reject) => { rejectFollow = reject }))
    getProfile.mockImplementation(async (username: string) => username === 'nova' ? nova(false, 1) : ada(false, 4))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const view = render(
      <QueryClientProvider client={client}>
        <ProfileHubScreen username="ada" />
      </QueryClientProvider>,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Follow ada' }))
    const pending = await screen.findByRole('button', { name: 'Unfollow ada' })
    expect((pending as HTMLButtonElement).disabled).toBe(true)

    view.rerender(
      <QueryClientProvider client={client}>
        <ProfileHubScreen username="nova" />
      </QueryClientProvider>,
    )
    rejectFollow(new ApiClientError(429, 'rate_limited', 'Too many requests. Try again soon.', 8))
    const followNova = await screen.findByRole('button', { name: 'Follow nova' })
    expect((followNova as HTMLButtonElement).disabled).toBe(false)
    expect(screen.queryByText('Too many requests. Try again in 8 seconds.')).toBeNull()

    follow.mockResolvedValue({ following: true })
    fireEvent.click(followNova)
    await waitFor(() => expect(follow).toHaveBeenCalledWith(NOVA))
  })
})
