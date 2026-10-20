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
  }: {
    onPress?: () => void
    children?: React.ReactNode
    accessibilityLabel?: string
    accessibilityRole?: string
  }) => React.createElement(
    'button',
    { type: 'button', onClick: onPress, 'aria-label': accessibilityLabel, role: accessibilityRole ?? 'button' },
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

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
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

  it('drops a follower when you unfollow and keeps the server count after a refresh', async () => {
    getProfile.mockResolvedValueOnce(ada(true, 4)).mockResolvedValue(ada(false, 3))
    unfollow.mockResolvedValue({ following: false })
    renderScreen()

    fireEvent.click(await screen.findByRole('button', { name: 'Unfollow ada' }))
    await waitFor(() => expect(unfollow).toHaveBeenCalledWith(ADA))
    expect(await screen.findByRole('button', { name: 'Follow ada' })).toBeTruthy()
    expect(screen.getByText('3 followers · 2 following').textContent).toBe('3 followers · 2 following')
    await waitFor(() => expect(getProfile).toHaveBeenCalledTimes(2))

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(getProfile).toHaveBeenCalledTimes(3))
    expect(getProfile).toHaveBeenNthCalledWith(1, 'ada')
    expect(getProfile).toHaveBeenNthCalledWith(3, 'ada')
  })
})
