// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ListLike } from './list-chrome'

const { tapHaptic } = vi.hoisted(() => ({ tapHaptic: vi.fn() }))

vi.mock('@/lib/haptics', () => ({ tapHaptic }))

vi.mock('react-native', () => ({
  Pressable: ({
    onPress,
    children,
    accessibilityLabel,
  }: {
    onPress?: () => void
    children?: React.ReactNode
    accessibilityLabel?: string
  }) => React.createElement(
    'button',
    { type: 'button', onClick: onPress, 'aria-label': accessibilityLabel },
    children,
  ),
  View: ({ children, accessibilityLabel }: { children?: React.ReactNode, accessibilityLabel?: string }) =>
    React.createElement('div', { 'aria-label': accessibilityLabel }, children),
  Text: ({ children }: { children?: React.ReactNode }) => React.createElement('span', null, children),
  StyleSheet: { create: (styles: unknown) => styles },
}))

afterEach(() => {
  cleanup()
  tapHaptic.mockReset()
})

describe('ListLike', () => {
  it('fires a haptic and the press handler on an interactive like', () => {
    const onPress = vi.fn()
    render(<ListLike count={3} liked={false} interactive onPress={onPress} />)
    fireEvent.click(screen.getByRole('button', { name: 'Like list, 3 likes' }))
    expect(tapHaptic).toHaveBeenCalledTimes(1)
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('is just a count, with no haptic, when not interactive', () => {
    render(<ListLike count={5} liked={false} interactive={false} />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(tapHaptic).not.toHaveBeenCalled()
  })
})
