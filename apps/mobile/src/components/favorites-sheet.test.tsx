// @vitest-environment jsdom
import type { GameSearchHit } from '@screenpeak/shared/api/search'
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { FavoritePick } from '@/lib/favorite-games'

import { FavoritesSheet } from './favorites-sheet'

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

afterEach(() => {
  cleanup()
})

function hit(id: string, name: string): GameSearchHit {
  return { id, name, slug: name.toLowerCase(), cover_image_url: null, released: null, avg_rating: null }
}

function renderSheet(current: FavoritePick[], found: GameSearchHit[] = []) {
  const onSearch = vi.fn(async () => found)
  const onSave = vi.fn(async () => null as string | null)
  const onClose = vi.fn()
  render(<FavoritesSheet visible current={current} onClose={onClose} onSearch={onSearch} onSave={onSave} />)
  return { onSearch, onSave, onClose }
}

async function search(query: string) {
  fireEvent.change(screen.getByLabelText('Search games'), { target: { value: query } })
  fireEvent.click(screen.getByRole('button', { name: 'Search' }))
}

describe('favorites sheet', () => {
  it('shows the current picks, adds a search result first, and saves the ids in that order', async () => {
    const { onSearch, onSave, onClose } = renderSheet([{ id: 'hades', name: 'Hades' }], [hit('celeste', 'Celeste')])
    expect(screen.getByText('You can only select 5 favorite games. Choose wisely.')).toBeTruthy()
    expect(screen.getByText('1 of 5 picked')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Hades, picked' }).getAttribute('aria-pressed')).toBe('true')

    await search('cel')
    await waitFor(() => expect(onSearch).toHaveBeenCalledWith('cel'))
    fireEvent.click(await screen.findByRole('button', { name: 'Celeste' }))
    expect(screen.getByText('2 of 5 picked')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Celeste, picked' })).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'Save favorites' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(['celeste', 'hades']))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('drops a pick when you tap it again', async () => {
    const { onSave } = renderSheet([{ id: 'hades', name: 'Hades' }, { id: 'celeste', name: 'Celeste' }])
    fireEvent.click(screen.getByRole('button', { name: 'Hades, picked' }))
    expect(screen.queryByRole('button', { name: 'Hades, picked' })).toBeNull()
    expect(screen.getByText('1 of 5 picked')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Save favorites' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(['celeste']))
  })

  it('will not pick a sixth game', async () => {
    const five = ['a', 'b', 'c', 'd', 'e'].map(id => ({ id, name: `Game ${id}` }))
    renderSheet(five, [hit('f', 'Game f')])
    await search('game')
    const sixth = await screen.findByRole('button', { name: 'Game f' })
    expect((sixth as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('5 of 5 picked')).toBeTruthy()
  })

  it('asks for a name before searching', () => {
    const { onSearch } = renderSheet([])
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect(screen.getByText('Type a game name.')).toBeTruthy()
    expect(onSearch).not.toHaveBeenCalled()
  })

  it('keeps the sheet open with the failure when the save fails', async () => {
    const onSave = vi.fn(async () => 'Couldn’t save. Try again.' as string | null)
    const onClose = vi.fn()
    render(<FavoritesSheet visible current={[]} onClose={onClose} onSearch={vi.fn(async () => [])} onSave={onSave} />)
    fireEvent.click(screen.getByRole('button', { name: 'Save favorites' }))
    expect(await screen.findByText('Couldn’t save. Try again.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
  })
})
