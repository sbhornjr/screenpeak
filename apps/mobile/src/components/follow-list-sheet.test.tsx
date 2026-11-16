// @vitest-environment jsdom
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { FollowListSheet } from './follow-list-sheet'

const followers = vi.hoisted(() => vi.fn())
const following = vi.hoisted(() => vi.fn())
const follow = vi.hoisted(() => vi.fn())
const unfollow = vi.hoisted(() => vi.fn())
const go = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api', () => ({
  api: { users: { followers, following, follow, unfollow } },
}))

vi.mock('@/lib/go', () => ({ go }))

vi.mock('expo-image', () => ({ Image: () => null }))

vi.mock('react-native-safe-area-context', () => ({
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
    accessibilityState?: { selected?: boolean, disabled?: boolean }
    disabled?: boolean
  }) => React.createElement(
    'button',
    {
      type: 'button',
      onClick: onPress,
      'aria-label': accessibilityLabel,
      role: accessibilityRole ?? 'button',
      'aria-pressed': accessibilityState?.selected,
      disabled: disabled || accessibilityState?.disabled,
    },
    typeof children === 'function' ? children({ pressed: false }) : children,
  ),
  View: ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children),
  Text: ({ children }: { children?: React.ReactNode }) => React.createElement('span', null, children),
  ScrollView: ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children),
  Modal: ({ visible, children }: { visible?: boolean, children?: React.ReactNode }) => (
    visible ? React.createElement('div', null, children) : null
  ),
  TextInput: Object.assign(() => null, { State: { currentlyFocusedInput: () => null } }),
  Keyboard: { addListener: () => ({ remove() {} }) },
  useWindowDimensions: () => ({ width: 375, height: 667, scale: 1, fontScale: 1 }),
  StyleSheet: { create: (styles: unknown) => styles, absoluteFill: {} },
}))

function renderSheet(props: Partial<Parameters<typeof FollowListSheet>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <FollowListSheet
        visible
        username="ada"
        kind="followers"
        viewerId="viewer-1"
        onClose={() => {}}
        {...props}
      />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  followers.mockReset()
  following.mockReset()
  follow.mockReset()
  unfollow.mockReset()
  go.mockReset()
})

afterEach(() => {
  cleanup()
})

describe('FollowListSheet', () => {
  it('renders a loaded row with avatar and username', async () => {
    followers.mockResolvedValue({ users: [{ id: 'u1', username: 'bea', avatar_url: null, is_following: false }] })
    renderSheet()
    expect(await screen.findByText('bea')).toBeTruthy()
  })

  it('shows "No followers yet." for an empty resolved list', async () => {
    followers.mockResolvedValue({ users: [] })
    renderSheet()
    expect(await screen.findByText('No followers yet.')).toBeTruthy()
  })

  it('shows an error state when the fetch rejects, with a working Retry', async () => {
    followers.mockRejectedValueOnce(new Error('down')).mockResolvedValue({ users: [{ id: 'u1', username: 'bea', avatar_url: null, is_following: false }] })
    renderSheet()
    const retry = await screen.findByRole('button', { name: 'Retry' })
    fireEvent.click(retry)
    expect(await screen.findByText('bea')).toBeTruthy()
  })

  it('shows a Follow button for a row where is_following is false, and pressing it calls api.users.follow with that row\'s id', async () => {
    followers.mockResolvedValue({ users: [{ id: 'u1', username: 'bea', avatar_url: null, is_following: false }] })
    follow.mockResolvedValue({ following: true })
    renderSheet()
    const button = await screen.findByRole('button', { name: 'Follow bea' })
    fireEvent.click(button)
    await waitFor(() => expect(follow).toHaveBeenCalledWith('u1'))
  })

  it('shows no Follow button on the row whose id equals the viewerId prop', async () => {
    followers.mockResolvedValue({ users: [{ id: 'viewer-1', username: 'me', avatar_url: null, is_following: false }] })
    renderSheet()
    await screen.findByText('me')
    expect(screen.queryByRole('button', { name: /Follow|Following/ })).toBeNull()
  })

  it('shows no Follow button for any row when viewerId is null', async () => {
    followers.mockResolvedValue({ users: [{ id: 'u1', username: 'bea', avatar_url: null, is_following: false }] })
    renderSheet({ viewerId: null })
    await screen.findByText('bea')
    expect(screen.queryByRole('button', { name: /Follow|Following/ })).toBeNull()
  })

  it('tapping a row calls go(profileHref(username)) and onClose', async () => {
    followers.mockResolvedValue({ users: [{ id: 'u1', username: 'bea', avatar_url: null, is_following: false }] })
    const onClose = vi.fn()
    renderSheet({ onClose })
    fireEvent.click(await screen.findByRole('button', { name: 'bea' }))
    expect(go).toHaveBeenCalledWith('/user/bea')
    expect(onClose).toHaveBeenCalled()
  })

  it('keeps a toggled row\'s state correct after the sheet closes and reopens', async () => {
    // Final-review finding: the row only updated its own local state, so closing
    // and reopening re-read the follow-list query cache, which the toggle never
    // touched — the row silently reverted. Mocking followers() to always resolve
    // the pre-toggle value (rather than updating it) proves the fix comes from
    // patching the cache on toggle, not from a lucky refetch returning fresh data.
    followers.mockResolvedValue({ users: [{ id: 'u1', username: 'bea', avatar_url: null, is_following: false }] })
    follow.mockResolvedValue({ following: true })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const props = { visible: true, username: 'ada', kind: 'followers' as const, viewerId: 'viewer-1', onClose: () => {} }
    const { rerender } = render(
      <QueryClientProvider client={client}>
        <FollowListSheet {...props} />
      </QueryClientProvider>,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Follow bea' }))
    await screen.findByRole('button', { name: 'Unfollow bea' })

    rerender(
      <QueryClientProvider client={client}>
        <FollowListSheet {...props} visible={false} />
      </QueryClientProvider>,
    )
    rerender(
      <QueryClientProvider client={client}>
        <FollowListSheet {...props} />
      </QueryClientProvider>,
    )

    expect(await screen.findByRole('button', { name: 'Unfollow bea' })).toBeTruthy()
  })
})
