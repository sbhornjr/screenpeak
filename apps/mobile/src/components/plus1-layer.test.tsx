// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { plus1 } from '@/lib/plus1'

import { Plus1Layer } from './plus1-layer'

function flatStyle(style: unknown): Record<string, string | number> {
  if (Array.isArray(style)) return Object.assign({}, ...style.filter(Boolean).map(flatStyle))
  if (style && typeof style === 'object') return style as Record<string, string | number>
  return {}
}

// Real react-native and react-native-reanimated pull in Flow syntax Vitest
// can't parse (the same problem lucide-react-native and expo-haptics have —
// see vitest.config.mts). Reanimated's own choreography isn't what this file
// tests; this stub only needs to not crash and to call through synchronously.
vi.mock('react-native', () => ({
  View: ({ children, style, ...rest }: { children?: React.ReactNode, style?: unknown }) =>
    React.createElement('div', { ...rest, style: flatStyle(style) }, children),
  StyleSheet: {
    create: (styles: unknown) => styles,
    absoluteFill: {},
  },
}))

vi.mock('react-native-reanimated', () => ({
  default: {
    Text: ({ children, style }: { children?: React.ReactNode, style?: unknown }) =>
      React.createElement('span', { style: flatStyle(style) }, children),
  },
  Easing: { bezier: () => (t: number) => t },
  interpolate: () => 0,
  useAnimatedStyle: (factory: () => unknown) => factory(),
  useReducedMotion: () => false,
  useSharedValue: (initial: number) => ({ value: initial }),
  withTiming: (toValue: number) => toValue,
}))

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Plus1Layer', () => {
  it('renders nothing until a chip fires', () => {
    const { container } = render(<Plus1Layer />)
    expect(container.firstChild).toBeNull()
  })

  it('floats up a chip for each plus1() call, then removes it', async () => {
    vi.useFakeTimers()
    render(<Plus1Layer />)
    act(() => { plus1('RATED') })
    expect(screen.getByText('+1 RATED')).toBeTruthy()

    await act(async () => { await vi.advanceTimersByTimeAsync(999) })
    expect(screen.getByText('+1 RATED')).toBeTruthy()

    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(screen.queryByText('+1 RATED')).toBeNull()
  })

  it('stacks more than one chip at once', () => {
    render(<Plus1Layer />)
    act(() => {
      plus1('SAVED')
      plus1('LISTED')
    })
    expect(screen.getByText('+1 SAVED')).toBeTruthy()
    expect(screen.getByText('+1 LISTED')).toBeTruthy()
  })
})
