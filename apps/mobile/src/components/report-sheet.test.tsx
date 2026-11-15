// @vitest-environment jsdom
import { ApiClientError } from '@screenpeak/shared/api/client'
import { REPORT_REASONS } from '@screenpeak/shared/constants'
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ReportButton, ReportSheet } from './report-sheet'

const create = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api', () => ({
  api: { reports: { create } },
}))

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
  TextInput: Object.assign(({
    accessibilityLabel,
    value,
    onChangeText,
  }: {
    accessibilityLabel?: string
    value?: string
    onChangeText?: (value: string) => void
  }) => React.createElement('input', {
    'aria-label': accessibilityLabel,
    value: value ?? '',
    onChange: (event: { target: { value: string } }) => onChangeText?.(event.target.value),
  }), { State: { currentlyFocusedInput: () => null } }),
  Keyboard: { addListener: () => ({ remove() {} }) },
  useWindowDimensions: () => ({ width: 375, height: 667, scale: 1, fontScale: 1 }),
  StyleSheet: { create: (styles: unknown) => styles, absoluteFill: {} },
}))

beforeEach(() => {
  create.mockReset()
})

afterEach(() => {
  cleanup()
})

describe('report sheet', () => {
  it.each(['review', 'list', 'profile'] as const)('lists the %s reasons, ending in Other', targetType => {
    render(<ReportSheet visible targetType={targetType} targetId="t1" onClose={() => {}} />)
    const reasons = REPORT_REASONS[targetType]
    expect(reasons.at(-1)).toBe('Other')
    for (const reason of reasons) expect(screen.getByRole('button', { name: reason })).toBeTruthy()
  })

  it('waits for a reason, then sends it with the trimmed details and confirms in the sheet', async () => {
    create.mockResolvedValue({ ok: true })
    render(<ReportSheet visible targetType="review" targetId="r1" onClose={() => {}} />)
    const submit = screen.getByRole('button', { name: 'Report' }) as HTMLButtonElement
    expect(submit.disabled).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Spam' }))
    fireEvent.change(screen.getByLabelText('Details (optional)'), { target: { value: '  same link everywhere  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Report' }))

    await waitFor(() => expect(screen.getByText('Thanks. We\'ll take a look.')).toBeTruthy())
    expect(create).toHaveBeenCalledWith({ targetType: 'review', targetId: 'r1', reason: 'Spam', details: 'same link everywhere' })
    expect(screen.getByText('Reported')).toBeTruthy()
  })

  it('leaves details out when they are blank', async () => {
    create.mockResolvedValue({ ok: true })
    render(<ReportSheet visible targetType="list" targetId="l1" onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Other' }))
    fireEvent.click(screen.getByRole('button', { name: 'Report' }))
    await waitFor(() => expect(create).toHaveBeenCalledWith({ targetType: 'list', targetId: 'l1', reason: 'Other' }))
  })

  it('shows the failure sentence and keeps the form when the report is refused', async () => {
    create.mockRejectedValue(new ApiClientError(429, 'rate_limited', 'Too many', 12))
    render(<ReportSheet visible targetType="profile" targetId="u1" onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Inappropriate bio' }))
    fireEvent.click(screen.getByRole('button', { name: 'Report' }))
    await waitFor(() => expect(screen.getByText('Too many requests. Try again in 12 seconds.')).toBeTruthy())
    expect(screen.queryByText('Thanks. We\'ll take a look.')).toBeNull()
  })

  it('opens from the flag button', () => {
    render(<ReportButton targetType="profile" targetId="u1" />)
    expect(screen.queryByRole('button', { name: 'Inappropriate username' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Report profile' }))
    expect(screen.getByRole('button', { name: 'Inappropriate username' })).toBeTruthy()
  })
})
