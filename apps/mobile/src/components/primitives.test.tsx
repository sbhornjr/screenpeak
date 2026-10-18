// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Avatar } from './avatar'
import { Button } from './button'
import { EmptyState } from './empty-state'
import { RatingBadge } from './rating-badge'
import { SectionHead } from './section-head'
import { Sheet } from './sheet'
import { TextField } from './text-field'
import { Wordmark } from './wordmark'

function flattenStyle(style: unknown): Record<string, unknown> {
  if (!style) return {}
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flattenStyle))
  return style as Record<string, unknown>
}

vi.mock('react-native', () => ({
  Pressable: ({
    onPress,
    children,
    accessibilityLabel,
    accessibilityRole,
    disabled,
    style,
  }: {
    onPress?: () => void
    children?: React.ReactNode
    accessibilityLabel?: string
    accessibilityRole?: string
    disabled?: boolean
    style?: unknown
  }) => React.createElement(
    'button',
    {
      type: 'button',
      onClick: onPress,
      'aria-label': accessibilityLabel,
      role: accessibilityRole,
      disabled,
      'data-style': JSON.stringify(flattenStyle(style)),
    },
    children,
  ),
  View: ({
    children,
    accessibilityLabel,
    accessibilityRole,
    role,
    style,
  }: {
    children?: React.ReactNode
    accessibilityLabel?: string
    accessibilityRole?: string
    role?: string
    style?: unknown
  }) => React.createElement(
    'div',
    {
      'aria-label': accessibilityLabel,
      role: role ?? accessibilityRole,
      'data-style': JSON.stringify(flattenStyle(style)),
    },
    children,
  ),
  Text: ({
    children,
    accessibilityLabel,
    style,
  }: {
    children?: React.ReactNode
    accessibilityLabel?: string
    style?: unknown
  }) => React.createElement(
    'span',
    {
      'aria-label': accessibilityLabel,
      'data-style': JSON.stringify(flattenStyle(style)),
    },
    children,
  ),
  TextInput: ({
    accessibilityLabel,
    value,
    onChangeText,
    placeholder,
    style,
  }: {
    accessibilityLabel?: string
    value?: string
    onChangeText?: (value: string) => void
    placeholder?: string
    style?: unknown
  }) => React.createElement('input', {
    'aria-label': accessibilityLabel,
    placeholder,
    value: value ?? '',
    'data-style': JSON.stringify(flattenStyle(style)),
    onChange: (event: { target: { value: string } }) => onChangeText?.(event.target.value),
  }),
  Modal: ({
    visible,
    children,
  }: {
    visible?: boolean
    children?: React.ReactNode
  }) => (visible ? React.createElement('div', { 'data-modal': 'open' }, children) : null),
  StyleSheet: {
    create: (styles: unknown) => styles,
    absoluteFill: {},
    flatten: flattenStyle,
  },
}))

vi.mock('expo-image', () => ({
  Image: ({
    accessibilityLabel,
    source,
  }: {
    accessibilityLabel?: string
    source?: string | { uri?: string }
  }) => React.createElement('img', {
    alt: accessibilityLabel ?? '',
    src: typeof source === 'string' ? source : source?.uri ?? '',
  }),
}))

afterEach(() => {
  cleanup()
})

function painted(node: Element): Record<string, unknown> {
  return JSON.parse(node.getAttribute('data-style') || '{}') as Record<string, unknown>
}

describe('Wordmark', () => {
  it('reads ScreenPeak, with Peak in the accent', () => {
    render(<Wordmark />)
    expect(screen.getByLabelText('ScreenPeak').textContent).toBe('ScreenPeak')
    expect(painted(screen.getByText('Peak')).color).toBe('#47c6dd')
    expect(painted(screen.getByText('Screen')).color).toBe('#dfe3ea')
  })
})

describe('SectionHead', () => {
  it('shows the section name and its count', () => {
    render(<SectionHead count={4}>Reviews</SectionHead>)
    expect(screen.getByRole('heading').textContent).toBe('Reviews· 4')
    expect(screen.getByText('Reviews').textContent).toBe('Reviews')
    expect(screen.getByText('· 4').textContent).toBe('· 4')
  })
})

describe('Button', () => {
  it('runs the press and keeps a 44pt target in the accent fill', () => {
    const onPress = vi.fn()
    render(<Button label="Sign up" onPress={onPress} />)
    const button = screen.getByRole('button', { name: 'Sign up' })
    expect(button.textContent).toBe('Sign up')
    expect(painted(screen.getByText('Sign up')).fontSize).toBe(14)
    expect(painted(button).minHeight).toBe(44)
    expect(painted(button).backgroundColor).toBe('#47c6dd')
    expect(painted(button).borderRadius).toBe(3)
    fireEvent.click(button)
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('does not run a disabled press', () => {
    const onPress = vi.fn()
    render(<Button label="Send reset link" disabled onPress={onPress} />)
    const button = screen.getByRole('button', { name: 'Send reset link' })
    expect((button as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(button)
    expect(onPress).not.toHaveBeenCalled()
  })
})

describe('TextField', () => {
  it('accepts what the player types and stays at least 44pt tall', () => {
    const onChangeText = vi.fn()
    render(<TextField label="Email" placeholder="Email" value="" onChangeText={onChangeText} />)
    const field = screen.getByLabelText('Email')
    expect(field.getAttribute('placeholder')).toBe('Email')
    expect(painted(field).minHeight).toBe(44)
    expect(painted(field).borderRadius).toBe(3)
    fireEvent.change(field, { target: { value: 'peek@example.com' } })
    expect(onChangeText).toHaveBeenCalledWith('peek@example.com')
  })
})

describe('RatingBadge', () => {
  it('paints 9 good, 7 mid, and 5 bad', () => {
    const { rerender } = render(<RatingBadge score={9} />)
    expect(screen.getByText('9').textContent).toBe('9')
    expect(painted(screen.getByText('9')).color).toBe('#4f86c6')
    expect(screen.getByText('9').getAttribute('aria-label')).toBe('9 out of 10')

    rerender(<RatingBadge score={7} />)
    expect(painted(screen.getByText('7')).color).toBe('#e0a13f')

    rerender(<RatingBadge score={5} />)
    expect(painted(screen.getByText('5')).color).toBe('#e0574c')
  })

  it('treats 80 on a 100-point scale as a good score', () => {
    render(<RatingBadge score={80} scale={100} />)
    expect(painted(screen.getByLabelText('80 out of 100')).color).toBe('#4f86c6')
  })
})

describe('Avatar', () => {
  it('shows the first letter of peek on the shared tint when there is no photo', () => {
    render(<Avatar alt="peek" src={null} />)
    expect(screen.getByRole('img', { name: 'peek' }).textContent).toBe('P')
    const letter = screen.getByText('P')
    const disc = letter.parentElement
    expect(disc).not.toBeNull()
    expect(painted(disc as Element).backgroundColor).toBe('#3f4d57')
    expect(painted(disc as Element).borderRadius).toBe(28)
  })

  it('shows the photo instead of the letter when a picture is set', () => {
    render(<Avatar alt="ada" src="https://cdn.example/ada.png" />)
    expect(screen.getByRole('img', { name: 'ada' }).getAttribute('src')).toBe('https://cdn.example/ada.png')
    expect(screen.queryByText('A')).toBeNull()
  })
})

describe('EmptyState', () => {
  it('shows the title, the description, and runs the action', () => {
    const onAction = vi.fn()
    render(
      <EmptyState
        title="Nothing in your feed yet."
        description="Follow someone to see what they play."
        actionLabel="Browse"
        onAction={onAction}
      />,
    )
    expect(screen.getByText('Nothing in your feed yet.').textContent).toBe('Nothing in your feed yet.')
    expect(screen.getByText('Follow someone to see what they play.').textContent).toBe('Follow someone to see what they play.')
    fireEvent.click(screen.getByRole('button', { name: 'Browse' }))
    expect(onAction).toHaveBeenCalledTimes(1)
  })
})

describe('Sheet', () => {
  it('opens as a dialog and closes from the Close control', () => {
    const onClose = vi.fn()
    const { rerender } = render(
      <Sheet visible title="Rate" onClose={onClose}>
        <Button label="Score 9" onPress={() => undefined} />
      </Sheet>,
    )
    expect(screen.getByRole('dialog', { name: 'Rate' }).textContent).toContain('Score 9')
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)

    rerender(
      <Sheet visible={false} title="Rate" onClose={onClose}>
        <Button label="Score 9" onPress={() => undefined} />
      </Sheet>,
    )
    expect(screen.queryByRole('dialog', { name: 'Rate' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Score 9' })).toBeNull()
  })
})
