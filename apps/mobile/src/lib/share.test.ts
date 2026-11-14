import { Platform } from 'react-native'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { gameShareUrl, listShareUrl, profileShareUrl, shareUrl } from './share'

const { shareFn } = vi.hoisted(() => ({ shareFn: vi.fn() }))

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  Share: {
    share: shareFn,
    sharedAction: 'sharedAction',
    dismissedAction: 'dismissedAction',
  },
}))

function setPlatform(os: 'ios' | 'android' | 'web') {
  ;(Platform as { OS: string }).OS = os
}

describe('share urls', () => {
  it('builds the game, profile, and list urls on the production domain', () => {
    expect(gameShareUrl('hades')).toBe('https://screenpeak.app/games/hades')
    expect(profileShareUrl('ada')).toBe('https://screenpeak.app/user/ada')
    expect(listShareUrl('ada', 'abc-123')).toBe('https://screenpeak.app/user/ada/lists/abc-123')
  })
})

describe('shareUrl on a device', () => {
  beforeEach(() => { shareFn.mockReset() })

  it('shares the url field on iOS', async () => {
    setPlatform('ios')
    shareFn.mockResolvedValue({ action: 'sharedAction' })
    expect(await shareUrl('https://screenpeak.app/games/hades', 'Hades')).toBe('shared')
    expect(shareFn).toHaveBeenCalledWith({ url: 'https://screenpeak.app/games/hades', title: 'Hades' })
  })

  it('shares the url as the message on Android, which has no url field', async () => {
    setPlatform('android')
    shareFn.mockResolvedValue({ action: 'sharedAction' })
    expect(await shareUrl('https://screenpeak.app/games/hades', 'Hades')).toBe('shared')
    expect(shareFn).toHaveBeenCalledWith({ message: 'https://screenpeak.app/games/hades', title: 'Hades' })
  })

  it('reports a dismissed share sheet', async () => {
    setPlatform('ios')
    shareFn.mockResolvedValue({ action: 'dismissedAction' })
    expect(await shareUrl('https://screenpeak.app', 'ScreenPeak')).toBe('dismissed')
  })

  it('treats a thrown share sheet the same as a dismissal', async () => {
    setPlatform('ios')
    shareFn.mockRejectedValue(new Error('nope'))
    expect(await shareUrl('https://screenpeak.app', 'ScreenPeak')).toBe('dismissed')
  })
})

describe('shareUrl on the web', () => {
  const originalNavigator = globalThis.navigator

  beforeEach(() => { setPlatform('web') })
  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', { value: originalNavigator, configurable: true })
  })

  function stubNavigator(nav: Record<string, unknown>) {
    Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true })
  }

  it('uses the Web Share API when the browser has one', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    stubNavigator({ share })
    expect(await shareUrl('https://screenpeak.app', 'ScreenPeak')).toBe('shared')
    expect(share).toHaveBeenCalledWith({ url: 'https://screenpeak.app', title: 'ScreenPeak' })
  })

  it('treats a cancelled Web Share sheet as dismissed, without falling back to the clipboard', async () => {
    const share = vi.fn().mockRejectedValue(Object.assign(new Error('cancelled'), { name: 'AbortError' }))
    const writeText = vi.fn()
    stubNavigator({ share, clipboard: { writeText } })
    expect(await shareUrl('https://screenpeak.app', 'ScreenPeak')).toBe('dismissed')
    expect(writeText).not.toHaveBeenCalled()
  })

  it('copies to the clipboard when the browser has no Web Share API', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubNavigator({ clipboard: { writeText } })
    expect(await shareUrl('https://screenpeak.app', 'ScreenPeak')).toBe('copied')
    expect(writeText).toHaveBeenCalledWith('https://screenpeak.app')
  })

  it('gives up when the browser has neither', async () => {
    stubNavigator({})
    expect(await shareUrl('https://screenpeak.app', 'ScreenPeak')).toBe('unsupported')
  })

  it('gives up, rather than throwing, when the clipboard write is denied', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("Failed to execute 'writeText' on 'Clipboard': Write permission denied."))
    stubNavigator({ clipboard: { writeText } })
    expect(await shareUrl('https://screenpeak.app', 'ScreenPeak')).toBe('unsupported')
  })
})
