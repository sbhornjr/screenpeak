// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DataAttribution, IGDB_ATTRIBUTION, IGDB_ATTRIBUTION_URL } from './data-attribution'

const { openURL } = vi.hoisted(() => ({ openURL: vi.fn(() => Promise.resolve()) }))

vi.mock('react-native', () => ({
  Linking: { openURL },
  Pressable: ({
    onPress,
    children,
    accessibilityLabel,
    accessibilityRole,
  }: {
    onPress: () => void;
    children: React.ReactNode;
    accessibilityLabel: string;
    accessibilityRole: string;
  }) => React.createElement('button', { type: 'button', onClick: onPress, 'aria-label': accessibilityLabel, role: accessibilityRole }, children),
  Text: ({ children }: { children: React.ReactNode }) => React.createElement('span', null, children),
  StyleSheet: { create: (styles: unknown) => styles },
}))

afterEach(() => {
  cleanup()
  openURL.mockReset()
  openURL.mockImplementation(() => Promise.resolve())
})

describe('DataAttribution', () => {
  it('shows the IGDB credit', () => {
    render(<DataAttribution />)
    expect(screen.getByRole('link', { name: IGDB_ATTRIBUTION }).textContent).toBe(IGDB_ATTRIBUTION)
  })

  it('swallows a rejected openURL', async () => {
    openURL.mockRejectedValueOnce(new Error('no activity'))
    render(<DataAttribution />)
    fireEvent.click(screen.getByRole('link', { name: IGDB_ATTRIBUTION }))
    await vi.waitFor(() => expect(openURL).toHaveBeenCalledWith(IGDB_ATTRIBUTION_URL))
    await new Promise(resolve => setTimeout(resolve, 0))
  })
})
