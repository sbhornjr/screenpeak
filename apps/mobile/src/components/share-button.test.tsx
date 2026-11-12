// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ShareButton } from './share-button'

const { shareUrlMock } = vi.hoisted(() => ({ shareUrlMock: vi.fn() }))

vi.mock('@/lib/share', () => ({ shareUrl: shareUrlMock }))

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
  Text: ({ children }: { children?: React.ReactNode }) => React.createElement('span', null, children),
  StyleSheet: { create: (styles: unknown) => styles },
}))

afterEach(() => {
  cleanup()
  shareUrlMock.mockReset()
  vi.useRealTimers()
})

describe('ShareButton', () => {
  it('shares the given url and title', async () => {
    shareUrlMock.mockResolvedValue('shared')
    render(<ShareButton url="https://screenpeak.app/games/hades" title="Hades" label="Share Hades" />)
    fireEvent.click(screen.getByRole('button', { name: 'Share Hades' }))
    await act(async () => { await Promise.resolve() })
    expect(shareUrlMock).toHaveBeenCalledWith('https://screenpeak.app/games/hades', 'Hades')
    expect(screen.getByRole('button', { name: 'Share Hades' })).toBeTruthy()
  })

  it('shows Link copied after the web fallback copies, then reverts to Share', async () => {
    vi.useFakeTimers()
    shareUrlMock.mockResolvedValue('copied')
    render(<ShareButton url="https://screenpeak.app" title="ScreenPeak" label="Share ScreenPeak" />)
    fireEvent.click(screen.getByRole('button', { name: 'Share ScreenPeak' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(screen.getByRole('button', { name: 'Link copied' })).toBeTruthy()
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(screen.getByRole('button', { name: 'Share ScreenPeak' })).toBeTruthy()
  })
})
