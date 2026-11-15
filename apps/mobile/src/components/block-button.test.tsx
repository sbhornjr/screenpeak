// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { BlockButton } from './block-button'

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
  // The sheet asks which field is focused when it opens.
  TextInput: { State: { currentlyFocusedInput: () => null } },
  Keyboard: { addListener: () => ({ remove() {} }) },
  useWindowDimensions: () => ({ width: 375, height: 667, scale: 1, fontScale: 1 }),
  StyleSheet: { create: (styles: unknown) => styles, absoluteFill: {} },
}))

afterEach(() => {
  cleanup()
})

function renderButton(blocked: boolean, block = vi.fn(async () => null as string | null)) {
  const unblock = vi.fn(async () => null as string | null)
  render(<BlockButton username="rival" blocked={blocked} onBlock={block} onUnblock={unblock} />)
  return { block, unblock }
}

describe('block button', () => {
  it('asks before blocking, and Cancel blocks nothing', () => {
    const { block } = renderButton(false)
    expect(screen.queryByText('Block rival?')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Block rival' }))
    expect(screen.getByText('Block rival?')).toBeTruthy()
    expect(block).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByText('Block rival?')).toBeNull()
    expect(block).not.toHaveBeenCalled()
  })

  it('blocks after the confirm, and closes the sheet', async () => {
    const { block } = renderButton(false)
    fireEvent.click(screen.getByRole('button', { name: 'Block rival' }))
    const buttons = screen.getAllByRole('button', { name: 'Block rival' })
    fireEvent.click(buttons[buttons.length - 1])
    await waitFor(() => expect(block).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.queryByText('Block rival?')).toBeNull())
  })

  it('keeps the sheet open with the failure when blocking fails', async () => {
    const { block } = renderButton(false, vi.fn(async () => 'Too many requests. Try again soon.' as string | null))
    fireEvent.click(screen.getByRole('button', { name: 'Block rival' }))
    const buttons = screen.getAllByRole('button', { name: 'Block rival' })
    fireEvent.click(buttons[buttons.length - 1])
    expect(await screen.findByText('Too many requests. Try again soon.')).toBeTruthy()
    expect(block).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Block rival?')).toBeTruthy()
  })

  it('unblocks straight away, with no confirm', async () => {
    const { unblock } = renderButton(true)
    fireEvent.click(screen.getByRole('button', { name: 'Unblock rival' }))
    await waitFor(() => expect(unblock).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('Block rival?')).toBeNull()
  })
})
