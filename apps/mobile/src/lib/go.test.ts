import { beforeEach, describe, expect, it, vi } from 'vitest'

import { back, backOrHome, go } from './go'

const router = vi.hoisted(() => ({
  push: vi.fn(),
  navigate: vi.fn(),
  back: vi.fn(),
  replace: vi.fn(),
  dismissTo: vi.fn(),
  canGoBack: vi.fn(),
  canDismiss: vi.fn(),
}))

vi.mock('expo-router', () => ({ router }))

beforeEach(() => {
  router.back.mockReset()
  router.replace.mockReset()
  router.dismissTo.mockReset()
  router.push.mockReset()
  router.navigate.mockReset()
  router.canGoBack.mockReset()
  router.canDismiss.mockReset()
})

describe('backOrHome', () => {
  it('returns to the previous screen when one exists', () => {
    router.canGoBack.mockReturnValue(true)
    backOrHome()
    expect(router.back).toHaveBeenCalledOnce()
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('opens the feed when sign-in was opened directly', () => {
    router.canGoBack.mockReturnValue(false)
    backOrHome()
    expect(router.replace).toHaveBeenCalledWith('/')
    expect(router.back).not.toHaveBeenCalled()
  })

  it('sends a cold-opened detail screen home', () => {
    router.canGoBack.mockReturnValue(false)
    back()
    expect(router.replace).toHaveBeenCalledWith('/')
    expect(router.back).not.toHaveBeenCalled()
  })
})

describe('go', () => {
  it('switches to a tab when nothing is stacked above it', () => {
    router.canDismiss.mockReturnValue(false)
    go('/library')
    expect(router.navigate).toHaveBeenCalledWith('/library')
    expect(router.dismissTo).not.toHaveBeenCalled()
    expect(router.push).not.toHaveBeenCalled()
  })

  it('dismisses a detail screen when opening a tab', () => {
    router.canDismiss.mockReturnValue(true)
    go('/library')
    expect(router.dismissTo).toHaveBeenCalledWith('/library')
    expect(router.navigate).not.toHaveBeenCalled()
    expect(router.push).not.toHaveBeenCalled()
  })

  it('pushes a detail screen', () => {
    go('/games/hades')
    expect(router.push).toHaveBeenCalledWith('/games/hades')
    expect(router.dismissTo).not.toHaveBeenCalled()
    expect(router.navigate).not.toHaveBeenCalled()
  })
})