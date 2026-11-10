// @vitest-environment jsdom
import type { LoadoutPageData } from '@screenpeak/shared/api/loadout'
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { LoadoutScreen, LoadoutSkeleton, type LoadoutScreenProps } from './loadout-screen'

vi.mock('expo-image', () => ({
  Image: () => null,
}))

vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children, accessibilityLabel }: { children?: React.ReactNode, accessibilityLabel?: string }) =>
    React.createElement('div', { 'aria-label': accessibilityLabel }, children),
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
      disabled: disabled || accessibilityState?.disabled,
    },
    typeof children === 'function' ? children({ pressed: false }) : children,
  ),
  View: ({ children, accessibilityLabel, accessible, role }: {
    children?: React.ReactNode
    accessibilityLabel?: string
    accessible?: boolean
    role?: string
  }) => React.createElement('div', { 'aria-label': accessibilityLabel, role: role ?? (accessible && accessibilityLabel ? 'img' : undefined) }, children),
  Text: ({ children, accessibilityRole }: { children?: React.ReactNode, accessibilityRole?: string }) =>
    React.createElement('span', { role: accessibilityRole === 'header' ? 'heading' : undefined }, children),
  ActivityIndicator: ({ accessibilityLabel }: { accessibilityLabel?: string }) =>
    React.createElement('div', { role: 'progressbar', 'aria-label': accessibilityLabel }),
  ScrollView: ({ children, accessibilityLabel }: { children?: React.ReactNode, accessibilityLabel?: string }) =>
    React.createElement('div', { 'aria-label': accessibilityLabel }, children),
  RefreshControl: () => null,
  Modal: ({ visible, children }: { visible?: boolean, children?: React.ReactNode }) => (
    visible ? React.createElement('div', null, children) : null
  ),
  TextInput: Object.assign(() => null, { State: { currentlyFocusedInput: () => null } }),
  Keyboard: { addListener: () => ({ remove() {} }) },
  useWindowDimensions: () => ({ width: 375, height: 667, scale: 1, fontScale: 1 }),
  StyleSheet: { create: (styles: unknown) => styles, absoluteFill: {} },
}))

afterEach(() => {
  cleanup()
})

const GAME = {
  id: 'g-hades',
  name: 'Hades',
  slug: 'hades',
  cover_image_url: null,
  released: '2020-09-17',
  developer: 'Supergiant Games',
  avg_rating: 9,
  user_rating: 10,
}

const PAGE: LoadoutPageData = {
  username: 'peek',
  total_games: 12,
  completed_games: 4,
  rating_count: 6,
  avg_rating: 7.456,
  identity: 'You chase hard games and forgive their bosses.',
  can_generate: true,
  genres: [{ genre_name: 'Roguelike', weighted_rating: 9.1, rated_count: 3, completed_count: 2 }],
  developers: [{ developer_name: 'Supergiant Games', weighted_rating: 5.5, rated_count: 2, game_count: 3 }],
  distribution: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map(rating => ({ rating, count: rating === 10 ? 3 : rating === 7 ? 1 : 0 })),
  top_games: [GAME],
  bottom_games: [{ ...GAME, id: 'g-bad', name: 'Bad Port', slug: 'bad-port', user_rating: 2 }],
  viewer: { is_owner: true },
}

function renderScreen(props: Partial<LoadoutScreenProps> = {}) {
  const onOpen = vi.fn()
  const onGenerate = vi.fn(async () => null as string | null)
  const onSaveBio = vi.fn(async () => null as string | null)
  const onClear = vi.fn(async () => null as string | null)
  render(
    <LoadoutScreen
      data={PAGE}
      onOpen={onOpen}
      onBack={() => undefined}
      onGenerate={onGenerate}
      onSaveBio={onSaveBio}
      onClear={onClear}
      {...props}
    />,
  )
  return { onOpen, onGenerate, onSaveBio, onClear }
}

describe('loadout', () => {
  it('names the player and shows saved, completed, rated, and the average', () => {
    renderScreen()
    expect(screen.getByRole('heading', { name: "peek's Loadout" })).toBeTruthy()
    for (const [value, label] of [['12', 'Saved'], ['4', 'Completed'], ['6', 'Rated'], ['7.45', 'Avg']]) {
      expect(screen.getByLabelText(`${label}: ${value}`)).toBeTruthy()
    }
  })

  it('quotes the Read-out and lets its owner regenerate it', async () => {
    const { onGenerate } = renderScreen()
    expect(screen.getByText('“You chase hard games and forgive their bosses.”')).toBeTruthy()
    expect(screen.getByText('Drafted with AI · edit anytime')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }))
    await waitFor(() => expect(onGenerate).toHaveBeenCalledTimes(1))
  })

  it('shows Generating while the Read-out is written, then why it failed', async () => {
    let finish: (value: string | null) => void = () => undefined
    const onGenerate = vi.fn(() => new Promise<string | null>((resolve) => { finish = resolve }))
    renderScreen({ onGenerate })
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }))
    const busy = await screen.findByRole('button', { name: 'Generating…' })
    expect((busy as HTMLButtonElement).disabled).toBe(true)
    finish('Too many requests. Try again in 42 seconds.')
    expect(await screen.findByText('Too many requests. Try again in 42 seconds.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Regenerate' })).toBeTruthy()
  })

  it('saves the Read-out to the profile once', async () => {
    const { onSaveBio } = renderScreen()
    fireEvent.click(screen.getByRole('button', { name: 'Save to profile' }))
    const saved = await screen.findByRole('button', { name: 'Saved to profile' })
    expect((saved as HTMLButtonElement).disabled).toBe(true)
    expect(onSaveBio).toHaveBeenCalledTimes(1)
  })

  it('asks before clearing the Read-out, and Cancel keeps it', async () => {
    const { onClear } = renderScreen()
    fireEvent.click(screen.getByRole('button', { name: 'Clear my Read-out' }))
    expect(screen.getByText(/This removes your generated Read-out and any saved copy of it on your profile\./)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClear).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Clear my Read-out' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear it' }))
    await waitFor(() => expect(onClear).toHaveBeenCalledTimes(1))
  })

  it('counts the ratings an owner needs before a Read-out and sends them to the catalogue', () => {
    const { onOpen } = renderScreen({ data: { ...PAGE, identity: '', can_generate: false, rating_count: 3 } })
    expect(screen.getByText('Rate 2 more games to unlock your Read-out.')).toBeTruthy()
    expect(screen.getByLabelText('3 of 5 ratings')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Generate/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Find games to rate' }))
    expect(onOpen).toHaveBeenLastCalledWith('/games')
  })

  it('says one more game in the singular', () => {
    renderScreen({ data: { ...PAGE, identity: '', can_generate: false, rating_count: 4 } })
    expect(screen.getByText('Rate 1 more game to unlock your Read-out.')).toBeTruthy()
  })

  it('offers an eligible owner their first Read-out', async () => {
    const { onGenerate } = renderScreen({ data: { ...PAGE, identity: '' } })
    expect(screen.getByText("You haven't generated a Read-out yet.")).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Save to profile' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Clear my Read-out' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Generate your Read-out' }))
    await waitFor(() => expect(onGenerate).toHaveBeenCalledTimes(1))
  })

  it('shows another player’s Read-out without the owner controls', () => {
    renderScreen({ data: { ...PAGE, viewer: { is_owner: false } }, onGenerate: undefined, onSaveBio: undefined, onClear: undefined })
    expect(screen.getByText('“You chase hard games and forgive their bosses.”')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Regenerate' })).toBeNull()
    expect(screen.queryByText('Drafted with AI · edit anytime')).toBeNull()
    cleanup()
    renderScreen({ data: { ...PAGE, identity: '', viewer: null }, onGenerate: undefined, onSaveBio: undefined, onClear: undefined })
    expect(screen.getByText('No Read-out yet.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Generate/ })).toBeNull()
  })

  it('charts the scoring style from 10 down to 1 with each share', () => {
    renderScreen()
    expect(screen.getByRole('heading', { name: 'Scoring style' })).toBeTruthy()
    expect(screen.getByLabelText('10 out of 10: 3 ratings, 75%')).toBeTruthy()
    expect(screen.getByLabelText('7 out of 10: 1 rating, 25%')).toBeTruthy()
    expect(screen.getByLabelText('1 out of 10: 0 ratings')).toBeTruthy()
    expect(screen.getByText('4 ratings')).toBeTruthy()
  })

  it('shows favorite genres and developers with their averages', () => {
    renderScreen()
    const genre = screen.getByLabelText('Roguelike, 9.1 average, 3 rated, 2 completed')
    expect(genre.textContent).toContain('Roguelike')
    expect(screen.getByLabelText('Supergiant Games, 5.5 average, 2 rated, 3 total')).toBeTruthy()
  })

  it('opens the top and bottom scored games', () => {
    const { onOpen } = renderScreen()
    expect(screen.getByRole('heading', { name: 'Top scores' })).toBeTruthy()
    fireEvent.click(screen.getByRole('link', { name: 'Hades' }))
    expect(onOpen).toHaveBeenLastCalledWith('/games/hades')
    fireEvent.click(screen.getByRole('link', { name: 'Bad Port' }))
    expect(onOpen).toHaveBeenLastCalledWith('/games/bad-port')
  })

  it('leaves out sections with nothing in them', () => {
    renderScreen({ data: { ...PAGE, genres: [], developers: [], top_games: [], bottom_games: [] } })
    for (const name of ['Favorite genres', 'Favorite developers', 'Top scores', 'Bottom scores']) {
      expect(screen.queryByRole('heading', { name })).toBeNull()
    }
  })

  it('keeps the page when a refresh fails and offers Retry', () => {
    const onRetry = vi.fn()
    renderScreen({ refreshError: "Couldn't refresh.", onRetry })
    expect(screen.getByText("Couldn't refresh.")).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('has a loading skeleton', () => {
    render(<LoadoutSkeleton onBack={() => undefined} />)
    expect(screen.getByLabelText('Loading Loadout')).toBeTruthy()
  })
})
