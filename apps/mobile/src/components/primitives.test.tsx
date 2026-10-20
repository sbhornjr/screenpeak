// @vitest-environment jsdom
import React, { act } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { colors, space } from '@/theme'

import { Avatar } from './avatar'
import { Button } from './button'
import { EmptyState } from './empty-state'
import { RatingBadge } from './rating-badge'
import { ScreenScroll } from './screen-scroll'
import { SectionHead } from './section-head'
import { Sheet, useSheetDismiss } from './sheet'
import { TextField } from './text-field'
import { Wordmark } from './wordmark'
import { Text } from 'react-native'

const keyboard = vi.hoisted(() => ({
  listeners: new Map<string, (event: { endCoordinates: { height: number } }) => void>(),
}))

const focusedField = vi.hoisted(() => ({
  current: null as null | {
    measureLayout: ReturnType<typeof vi.fn>
    scrollIntoView?: (options: { block?: string }) => void
  },
}))

const scrollToKeyboard = vi.hoisted(() => vi.fn())

const platform = vi.hoisted(() => ({ os: 'ios' }))

const modal = vi.hoisted(() => ({ reportsDismiss: true }))

function flattenStyle(style: unknown): Record<string, unknown> {
  if (!style) return {}
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flattenStyle))
  return style as Record<string, unknown>
}

const NAMED = new Set(['button', 'link', 'img', 'image', 'header', 'heading', 'text', 'summary', 'dialog'])

function exposedRole(role?: string, accessibilityRole?: string): string | undefined {
  const value = role ?? accessibilityRole
  if (value === 'image' || value === 'img') return 'img'
  if (value === 'header' || value === 'heading') return 'heading'
  return value
}

function exposedName(role: string | undefined, accessibilityRole: string | undefined, label?: string): string | undefined {
  if (!label) return undefined
  const mapped = exposedRole(role, accessibilityRole)
  if (!mapped || (!NAMED.has(mapped) && !NAMED.has(role ?? '') && !NAMED.has(accessibilityRole ?? ''))) return undefined
  return label
}

vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return platform.os
    },
    select: (spec: Record<string, unknown>) => spec[platform.os] ?? spec.default,
  },
  Keyboard: {
    addListener: (event: string, callback: (value: { endCoordinates: { height: number } }) => void) => {
      keyboard.listeners.set(event, callback)
      return { remove: () => keyboard.listeners.delete(event) }
    },
  },
  useWindowDimensions: () => ({ width: 400, height: 800, scale: 1, fontScale: 1 }),
  Pressable: ({
    onPress,
    children,
    accessibilityLabel,
    accessibilityRole,
    disabled,
    focusable,
    style,
  }: {
    onPress?: () => void
    children?: React.ReactNode
    accessibilityLabel?: string
    accessibilityRole?: string
    disabled?: boolean
    focusable?: boolean
    style?: unknown
  }) => {
    const [focused, setFocused] = React.useState(false)
    const role = exposedRole(undefined, accessibilityRole)
    return React.createElement(
      'button',
      {
        type: 'button',
        onClick: onPress,
        onFocus: () => setFocused(true),
        onBlur: () => setFocused(false),
        'aria-label': exposedName(undefined, accessibilityRole, accessibilityLabel),
        role,
        disabled,
        tabIndex: focusable === false ? -1 : 0,
        'data-style': JSON.stringify(flattenStyle(typeof style === 'function' ? style({ pressed: false, focused }) : style)),
      },
      children,
    )
  },
  View: ({
    children,
    accessibilityLabel,
    accessibilityRole,
    accessibilityLevel,
    role,
    style,
    accessibilityElementsHidden,
    onKeyDown,
  }: {
    children?: React.ReactNode
    accessibilityLabel?: string
    accessibilityRole?: string
    accessibilityLevel?: number
    role?: string
    style?: unknown
    accessibilityElementsHidden?: boolean
    onKeyDown?: (event: { key: string }) => void
  }) => React.createElement(
    'div',
    {
      'aria-label': exposedName(role, accessibilityRole, accessibilityLabel),
      role: exposedRole(role, accessibilityRole),
      'aria-level': accessibilityLevel,
      'aria-hidden': accessibilityElementsHidden ? 'true' : undefined,
      'data-style': JSON.stringify(flattenStyle(style)),
      onKeyDown,
    },
    children,
  ),
  Text: ({
    children,
    accessibilityLabel,
    accessibilityRole,
    accessibilityLevel,
    role,
    style,
    accessibilityElementsHidden,
    ...props
  }: {
    children?: React.ReactNode
    accessibilityLabel?: string
    accessibilityRole?: string
    accessibilityLevel?: number
    role?: string
    style?: unknown
    accessibilityElementsHidden?: boolean
    'aria-hidden'?: boolean
  }) => React.createElement(
    'span',
    {
      'aria-label': accessibilityLabel,
      role: exposedRole(role, accessibilityRole),
      'aria-level': accessibilityLevel,
      'aria-hidden': props['aria-hidden'] || accessibilityElementsHidden ? 'true' : undefined,
      'data-style': JSON.stringify(flattenStyle(style)),
    },
    children,
  ),
  TextInput: Object.assign(
    ({
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
    { State: { currentlyFocusedInput: () => focusedField.current } },
  ),
  ScrollView: React.forwardRef(function SheetScrollView({
    children,
    keyboardShouldPersistTaps,
    automaticallyAdjustKeyboardInsets,
  }: {
    children?: React.ReactNode
    keyboardShouldPersistTaps?: string
    automaticallyAdjustKeyboardInsets?: boolean
  }, ref: React.Ref<{ scrollResponderScrollNativeHandleToKeyboard: typeof scrollToKeyboard }>) {
    React.useImperativeHandle(ref, () => ({
      scrollResponderScrollNativeHandleToKeyboard: scrollToKeyboard,
    }))
    return React.createElement(
      'div',
      {
        'data-persist-taps': keyboardShouldPersistTaps ?? '',
        'data-keyboard-insets': automaticallyAdjustKeyboardInsets ? 'true' : 'false',
      },
      children,
    )
  }),
  Modal: ({
    visible,
    onRequestClose,
    onDismiss,
    children,
  }: {
    visible?: boolean
    onRequestClose?: () => void
    onDismiss?: () => void
    children?: React.ReactNode
  }) => {
    const wasVisible = React.useRef(visible)
    React.useEffect(() => {
      if (wasVisible.current && visible === false && modal.reportsDismiss) onDismiss?.()
      wasVisible.current = visible
    }, [visible, onDismiss])
    return visible
      ? React.createElement(
        'div',
        {
          'data-modal': 'open',
          onKeyDown: (event: { key: string }) => {
            if (event.key === 'Escape') onRequestClose?.()
          },
        },
        children,
      )
      : null
  },
  StyleSheet: {
    create: (styles: unknown) => styles,
    absoluteFill: {},
    flatten: flattenStyle,
  },
}))

vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children),
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 34, left: 0 }),
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
  keyboard.listeners.clear()
  platform.os = 'ios'
  modal.reportsDismiss = true
})

function painted(node: Element): Record<string, unknown> {
  return JSON.parse(node.getAttribute('data-style') || '{}') as Record<string, unknown>
}

describe('Wordmark', () => {
  it('reads ScreenPeak and keeps the two words out of the accessibility tree', () => {
    render(<Wordmark />)
    const mark = screen.getByRole('img', { name: 'ScreenPeak' })
    expect(mark.textContent).toBe('ScreenPeak')
    expect(screen.getByText('Screen').getAttribute('aria-hidden')).toBe('true')
    expect(screen.getByText('Peak').getAttribute('aria-hidden')).toBe('true')
  })
})

describe('SectionHead', () => {
  it('shows the section name and its count as a level-2 heading', () => {
    render(<SectionHead count={4}>Reviews</SectionHead>)
    const heading = screen.getByRole('heading', { level: 2 })
    expect(heading.textContent).toBe('Reviews· 4')
    expect(screen.getByText('Reviews').textContent).toBe('Reviews')
    expect(screen.getByText('· 4').textContent).toBe('· 4')
  })
})

describe('Button', () => {
  it('runs the press and keeps a 44pt target', () => {
    const onPress = vi.fn()
    render(<Button label="Sign up" onPress={onPress} />)
    const button = screen.getByRole('button', { name: 'Sign up' })
    expect(button.textContent).toBe('Sign up')
    expect(painted(button).minHeight).toBe(44)
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

  it('draws the accent ring while focused', () => {
    render(<Button label="Sign up" onPress={() => undefined} />)
    const button = screen.getByRole('button', { name: 'Sign up' })
    expect(painted(button).boxShadow).toBeUndefined()
    fireEvent.focus(button)
    expect(String(painted(button).boxShadow)).toContain(colors.accent)
  })
})

describe('TextField', () => {
  it('shows the label, accepts what the player types, and stays at least 44pt tall', () => {
    const onChangeText = vi.fn()
    render(<TextField label="Email" placeholder="Email" value="" onChangeText={onChangeText} />)
    expect(screen.getByText('Email').textContent).toBe('Email')
    const field = screen.getByRole('textbox', { name: 'Email' })
    expect(field.getAttribute('placeholder')).toBe('Email')
    expect(painted(field).minHeight).toBe(44)
    expect(painted(field).lineHeight).toBeUndefined()
    fireEvent.change(field, { target: { value: 'peek@example.com' } })
    expect(onChangeText).toHaveBeenCalledWith('peek@example.com')
  })
})

describe('RatingBadge', () => {
  it('names 9 good, 7 mid, and 5 bad', () => {
    const { rerender } = render(<RatingBadge score={9} />)
    expect(screen.getByLabelText('9 out of 10, good').textContent).toBe('9')

    rerender(<RatingBadge score={7} />)
    expect(screen.getByLabelText('7 out of 10, mid').textContent).toBe('7')

    rerender(<RatingBadge score={5} />)
    expect(screen.getByLabelText('5 out of 10, bad').textContent).toBe('5')
  })

  it('treats 80 on a 100-point scale as a good score', () => {
    render(<RatingBadge score={80} scale={100} />)
    expect(screen.getByLabelText('80 out of 100, good').textContent).toBe('80')
  })
})

describe('Avatar', () => {
  it('shows the first letter of peek when there is no photo', () => {
    render(<Avatar alt="peek" src={null} />)
    expect(screen.getByRole('img', { name: 'peek' }).textContent).toBe('P')
  })

  it('shows the photo instead of the letter when a picture is set', () => {
    render(<Avatar alt="ada" src="https://cdn.example/ada.png" />)
    expect(screen.getByRole('img', { name: 'ada' }).getAttribute('src')).toBe('https://cdn.example/ada.png')
    expect(screen.queryByText('A')).toBeNull()
  })
})

describe('EmptyState', () => {
  it('shows the title as a level-2 heading, the description, and runs the action', () => {
    const onAction = vi.fn()
    render(
      <EmptyState
        title="Nothing in your feed yet."
        description="Follow someone to see what they play."
        actionLabel="Browse"
        onAction={onAction}
      />,
    )
    expect(screen.getByRole('heading', { level: 2, name: 'Nothing in your feed yet.' }).textContent).toBe('Nothing in your feed yet.')
    expect(screen.getByText('Follow someone to see what they play.').textContent).toBe('Follow someone to see what they play.')
    fireEvent.click(screen.getByRole('button', { name: 'Browse' }))
    expect(onAction).toHaveBeenCalledTimes(1)
  })
})

describe('ScreenScroll', () => {
  it('uses the screen title as the level-1 heading', () => {
    render(<ScreenScroll title="Library"><Text>Hi</Text></ScreenScroll>)
    expect(screen.getByRole('heading', { level: 1, name: 'Library' }).textContent).toBe('Library')
  })

  it('centers the ScreenPeak wordmark between equal header sides', () => {
    render(<ScreenScroll title="Library" onBack={() => undefined}><Text>Hi</Text></ScreenScroll>)
    const mark = screen.getByRole('img', { name: 'ScreenPeak' })
    const bar = mark.parentElement?.parentElement
    expect(bar?.getAttribute('data-style')).toBe(JSON.stringify({
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 44,
    }))
    const sides = bar ? Array.from(bar.children).filter((node) => node !== mark.parentElement) : []
    expect(sides).toHaveLength(2)
    expect(sides.map((node) => node.getAttribute('data-style'))).toEqual([
      JSON.stringify({ flex: 1, minHeight: 44, justifyContent: 'center', minWidth: 0 }),
      JSON.stringify({ flex: 1, minHeight: 44, justifyContent: 'center', minWidth: 0 }),
    ])
    expect(mark.parentElement?.getAttribute('data-style')).toBe(JSON.stringify({ alignItems: 'center' }))
  })
})

describe('Sheet', () => {
  it('keeps the title and Close on screen while a long list scrolls', () => {
    render(
      <Sheet visible title="Add to list" onClose={() => undefined}>
        {Array.from({ length: 40 }, (_, index) => <Text key={index}>{`Row ${index}`}</Text>)}
      </Sheet>,
    )
    const dialog = screen.getByRole('dialog', { name: 'Add to list' })
    const scroll = document.querySelector('[data-persist-taps="handled"]')
    const heading = screen.getByRole('heading', { level: 2, name: 'Add to list' })
    const close = screen.getByRole('button', { name: 'Close' })
    expect(scroll).not.toBeNull()
    expect(scroll?.textContent).toContain('Row 39')
    expect(scroll?.contains(heading)).toBe(false)
    expect(scroll?.contains(close)).toBe(false)
    expect(scroll?.getAttribute('data-keyboard-insets')).toBe('true')
    expect(painted(dialog).maxHeight).toBe(720)
    expect(painted(dialog).paddingBottom).toBe(space[4] + 34)

    act(() => {
      keyboard.listeners.get('keyboardDidShow')?.({ endCoordinates: { height: 300 } })
    })
    expect(painted(screen.getByRole('dialog', { name: 'Add to list' })).paddingBottom).toBe(space[4] + 34)
  })

  it('scrolls a focused field through the scroll view host and never calls measureLayout', async () => {
    platform.os = 'ios'
    const measureLayout = vi.fn()
    focusedField.current = { measureLayout }
    scrollToKeyboard.mockClear()
    render(
      <Sheet visible title="Rate" onClose={() => undefined}>
        <Text>Note</Text>
      </Sheet>,
    )
    await act(async () => {
      await new Promise(resolve => requestAnimationFrame(() => resolve(undefined)))
    })
    expect(measureLayout).not.toHaveBeenCalled()
    expect(scrollToKeyboard).toHaveBeenCalledWith(focusedField.current, 80, true)

    scrollToKeyboard.mockClear()
    act(() => {
      keyboard.listeners.get('keyboardDidShow')?.({ endCoordinates: { height: 300 } })
    })
    await act(async () => {
      await new Promise(resolve => requestAnimationFrame(() => resolve(undefined)))
    })
    expect(measureLayout).not.toHaveBeenCalled()
    expect(scrollToKeyboard).toHaveBeenCalledWith(focusedField.current, 80, true)
    focusedField.current = null
  })

  it('uses scrollIntoView when the focused field is a web element', async () => {
    const measureLayout = vi.fn()
    const scrollIntoView = vi.fn()
    focusedField.current = { measureLayout, scrollIntoView }
    scrollToKeyboard.mockClear()
    render(
      <Sheet visible title="Rate" onClose={() => undefined}>
        <Text>Note</Text>
      </Sheet>,
    )
    await act(async () => {
      await new Promise(resolve => requestAnimationFrame(() => resolve(undefined)))
    })
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center' })
    expect(measureLayout).not.toHaveBeenCalled()
    expect(scrollToKeyboard).not.toHaveBeenCalled()
    focusedField.current = null
  })

  it('runs a navigation only after the sheet has closed', () => {
    function Leave({ onLeave }: { onLeave: () => void }) {
      const dismiss = useSheetDismiss()
      return <Button label="Log in" onPress={() => dismiss(onLeave)} />
    }
    function Harness({ onLeave }: { onLeave: () => void }) {
      const [open, setOpen] = React.useState(true)
      return (
        <Sheet visible={open} title="Sign up" onClose={() => setOpen(false)}>
          <Leave onLeave={onLeave} />
        </Sheet>
      )
    }
    const onLeave = vi.fn(() => {
      expect(screen.queryByRole('dialog', { name: 'Sign up' })).toBeNull()
    })
    render(<Harness onLeave={onLeave} />)
    expect(screen.getByRole('dialog', { name: 'Sign up' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }))
    expect(onLeave).toHaveBeenCalledTimes(1)
  })

  it('on android navigates after the sheet closes when the modal does not report dismiss', async () => {
    platform.os = 'android'
    modal.reportsDismiss = false
    function Leave({ onLeave }: { onLeave: () => void }) {
      const dismiss = useSheetDismiss()
      return <Button label="Sign up" onPress={() => dismiss(onLeave)} />
    }
    function Harness({ onLeave }: { onLeave: () => void }) {
      const [open, setOpen] = React.useState(true)
      return (
        <Sheet visible={open} title="Sign up" onClose={() => setOpen(false)}>
          <Leave onLeave={onLeave} />
        </Sheet>
      )
    }
    const onLeave = vi.fn(() => {
      expect(screen.queryByRole('dialog', { name: 'Sign up' })).toBeNull()
    })
    render(<Harness onLeave={onLeave} />)
    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }))
    expect(onLeave).not.toHaveBeenCalled()
    await act(async () => {
      await new Promise(resolve => requestAnimationFrame(() => resolve(undefined)))
    })
    expect(onLeave).toHaveBeenCalledTimes(1)
  })

  it('leaves keyboard insets to the browser when the window itself shrinks', () => {
    platform.os = 'web'
    render(
      <Sheet visible title="Rate" onClose={() => undefined}>
        <Text>Note</Text>
      </Sheet>,
    )
    const scroll = document.querySelector('[data-persist-taps="handled"]')
    expect(scroll?.getAttribute('data-keyboard-insets')).toBe('false')
    expect(painted(screen.getByRole('dialog', { name: 'Rate' })).paddingBottom).toBe(space[4] + 34)
  })

  it('closes from the scrim and from the system back', () => {
    const onClose = vi.fn()
    render(
      <Sheet visible title="Rate" onClose={onClose}>
        <Button label="Score 9" onPress={() => undefined} />
      </Sheet>,
    )
    const dismiss = screen.getByRole('button', { name: 'Dismiss' })
    expect(dismiss.tabIndex).toBe(-1)
    fireEvent.click(dismiss)
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Rate' }), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)

    cleanup()
    const closed = vi.fn()
    render(
      <Sheet visible={false} title="Rate" onClose={closed}>
        <Button label="Score 9" onPress={() => undefined} />
      </Sheet>,
    )
    expect(screen.queryByRole('dialog', { name: 'Rate' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Score 9' })).toBeNull()
  })
})
