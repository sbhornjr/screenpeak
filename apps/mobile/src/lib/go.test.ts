import { beforeEach, describe, expect, it, vi } from 'vitest'

import { backOrHome } from './go'

const router = vi.hoisted(() => ({
  push: vi.fn(),
  back: vi.fn(),
  replace: vi.fn(),
  canGoBack: vi.fn(),
}))

vi.mock('expo-router', () => ({ router }))

beforeEach(() => {
  router.back.mockReset()
  router.replace.mockReset()
  router.canGoBack.mockReset()
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
})