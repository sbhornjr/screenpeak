import { beforeEach, describe, expect, it, vi } from 'vitest'

import { back, go } from './go'

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

describe('back', () => {
  it('returns to the previous screen when one exists', () => {
    router.canGoBack.mockReturnValue(true)
    back()
    expect(router.back).toHaveBeenCalledOnce()
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('sends a cold-opened screen home', () => {
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