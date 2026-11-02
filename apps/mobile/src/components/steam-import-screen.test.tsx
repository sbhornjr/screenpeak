// @vitest-environment jsdom
import type { SteamLinkEntry } from '@screenpeak/shared/types'
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SteamImportScreen, SteamImportUnlinked, type SteamImportScreenProps } from './steam-import-screen'

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
    accessibilityState,
    disabled,
  }: {
    onPress?: () => void
    children?: React.ReactNode | ((state: { pressed: boolean }) => React.ReactNode)
    accessibilityLabel?: string
    accessibilityRole?: string
    accessibilityState?: { selected?: boolean, disabled?: boolean, checked?: boolean }
    disabled?: boolean
  }) => React.createElement(
    'button',
    {
      type: 'button',
      onClick: onPress,
      'aria-label': accessibilityLabel,
      role: accessibilityRole ?? 'button',
      'aria-checked': accessibilityState?.checked,
      'aria-pressed': accessibilityState?.selected,
      disabled: disabled || accessibilityState?.disabled,
    },
    typeof children === 'function' ? children({ pressed: false }) : children,
  ),
  View: ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children),
  Text: ({ children, accessibilityRole, role }: { children?: React.ReactNode, accessibilityRole?: string, role?: string }) =>
    React.createElement('span', { role: role ?? (accessibilityRole === 'header' ? 'heading' : undefined) }, children),
  ScrollView: ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children),
  FlatList: ({
    data,
    renderItem,
    ListHeaderComponent,
    ListEmptyComponent,
  }: {
    data: unknown[]
    renderItem: (info: { item: unknown, index: number }) => React.ReactNode
    ListHeaderComponent?: React.ReactNode
    ListEmptyComponent?: React.ReactNode
  }) => React.createElement('div', null,
    ListHeaderComponent,
    data.length === 0 ? ListEmptyComponent : data.map((item, index) => React.createElement(React.Fragment, { key: index }, renderItem({ item, index })))),
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

afterEach(() => {
  cleanup()
})

function entry(gameId: string, name: string, overrides: Partial<SteamLinkEntry> = {}): SteamLinkEntry {
  return {
    gameId,
    playtimeSelected: 12.5,
    status: 'completed',
    selected: true,
    coverImageUrl: null,
    gameName: name,
    gameDeveloper: 'Supergiant',
    gameReleased: '2020-09-17',
    timesPlayed: 1,
    completedAllAchievements: false,
    ...overrides,
  }
}

function renderScreen(props: Partial<SteamImportScreenProps> = {}) {
  const handlers = {
    onRetryMatches: vi.fn(),
    onToggle: vi.fn(),
    onEdit: vi.fn(),
    onImport: vi.fn(),
    onBack: vi.fn(),
  }
  render(
    <SteamImportScreen
      entries={[entry('hades', 'Hades'), entry('celeste', 'Celeste', { selected: false })]}
      line="2 games ready from 3 Steam apps."
      notice={null}
      error={null}
      matching={false}
      importing={false}
      canRetryMatches={false}
      {...handlers}
      {...props}
    />,
  )
  return handlers
}

describe('steam import', () => {
  it('lists the matched games with their summary, and counts the selected ones', () => {
    renderScreen()
    expect(screen.getByRole('heading', { name: 'Import from Steam' })).toBeTruthy()
    expect(screen.getByText('2 games ready from 3 Steam apps.')).toBeTruthy()
    expect(screen.getAllByText('Completed · 12.5 hrs · Played 1×')).toHaveLength(2)
    expect(screen.getByRole('checkbox', { name: 'Deselect Hades' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('checkbox', { name: 'Select Celeste' }).getAttribute('aria-checked')).toBe('false')
    expect(screen.getByRole('button', { name: 'Import games (1)' })).toBeTruthy()
  })

  it('selects a game and imports', () => {
    const { onToggle, onImport } = renderScreen()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Celeste' }))
    expect(onToggle).toHaveBeenCalledWith('celeste')
    fireEvent.click(screen.getByRole('button', { name: 'Import games (1)' }))
    expect(onImport).toHaveBeenCalledTimes(1)
  })

  it('waits for matching, an import in flight, or a selection before importing', () => {
    renderScreen({ matching: true, line: 'Matching your library… 2 games ready, 4 still to check.' })
    expect((screen.getByRole('button', { name: 'Import games (1)' }) as HTMLButtonElement).disabled).toBe(true)
    cleanup()
    renderScreen({ importing: true })
    expect((screen.getByRole('button', { name: 'Importing…' }) as HTMLButtonElement).disabled).toBe(true)
    cleanup()
    renderScreen({ entries: [entry('hades', 'Hades', { selected: false })] })
    expect((screen.getByRole('button', { name: 'Import games (0)' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('edits one game in a sheet and reports the changed fields', () => {
    const { onEdit } = renderScreen()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Hades' }))
    fireEvent.click(screen.getByRole('button', { name: 'Log as playing' }))
    fireEvent.change(screen.getByLabelText('Hours played'), { target: { value: '40' } })
    fireEvent.click(screen.getByRole('button', { name: 'More times played' }))
    fireEvent.click(screen.getByRole('button', { name: '100% achievements completed' }))
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(onEdit).toHaveBeenCalledWith(
      entry('hades', 'Hades', { status: 'playing', playtimeSelected: 40, timesPlayed: 2, completedAllAchievements: true }),
      ['status', 'hours', 'times', 'achievements'],
    )
    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull()
  })

  it('keeps the sheet open on hours the server would refuse', () => {
    const { onEdit } = renderScreen()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Hades' }))
    fireEvent.change(screen.getByLabelText('Hours played'), { target: { value: '1.25' } })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.getByText('Hours can have at most one decimal place')).toBeTruthy()
    expect(onEdit).not.toHaveBeenCalled()
  })

  it('shows the notice, the error, and the retry pass', () => {
    const { onRetryMatches } = renderScreen({
      notice: 'Another import is running.',
      error: 'Steam is unavailable. Your matched games are still listed.',
      canRetryMatches: true,
    })
    expect(screen.getByText('Another import is running.')).toBeTruthy()
    expect(screen.getByText('Steam is unavailable. Your matched games are still listed.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try the remaining matches again' }))
    expect(onRetryMatches).toHaveBeenCalledTimes(1)
  })

  it('says when nothing matched', () => {
    renderScreen({ entries: [], line: '0 games ready from 3 Steam apps. 3 Steam apps could not be matched.' })
    expect(screen.getByText('No games to import')).toBeTruthy()
  })
})

describe('steam import without a link', () => {
  it('sends you to Settings to link Steam', () => {
    const onOpenSettings = vi.fn()
    render(<SteamImportUnlinked onBack={vi.fn()} onOpenSettings={onOpenSettings} />)
    expect(screen.getByText('Link Steam in Settings to import your games.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Open Settings' }))
    expect(onOpenSettings).toHaveBeenCalledTimes(1)
  })
})
