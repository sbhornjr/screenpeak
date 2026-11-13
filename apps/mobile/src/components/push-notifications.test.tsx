// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PushNotificationNavigation, PushNotificationRegistration } from './push-notifications'

const { session, registerForPushNotificationsAsync, registerPushToken, unregisterPushToken, go, useLastNotificationResponse } = vi.hoisted(() => ({
  session: { current: null as { user: { id: string } } | null },
  registerForPushNotificationsAsync: vi.fn(),
  registerPushToken: vi.fn(),
  unregisterPushToken: vi.fn(),
  go: vi.fn(),
  useLastNotificationResponse: vi.fn((): unknown => null),
}))

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ ready: true, session: session.current }),
}))

vi.mock('@/lib/api', () => ({
  api: { me: { registerPushToken, unregisterPushToken } },
}))

vi.mock('@/lib/push-notifications', () => ({ registerForPushNotificationsAsync }))

vi.mock('@/lib/go', () => ({ go }))

vi.mock('expo-notifications', () => ({ useLastNotificationResponse }))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  session.current = null
})

describe('PushNotificationRegistration', () => {
  it('registers this device on sign-in', async () => {
    registerForPushNotificationsAsync.mockResolvedValue({ token: 'ExponentPushToken[abc]', platform: 'ios' })
    registerPushToken.mockResolvedValue({ ok: true })
    const { rerender } = render(<PushNotificationRegistration />)

    session.current = { user: { id: 'viewer' } }
    await act(async () => {
      rerender(<PushNotificationRegistration />)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(registerPushToken).toHaveBeenCalledWith({ token: 'ExponentPushToken[abc]', platform: 'ios' })
  })

  it('does nothing when permission or the token request fails', async () => {
    registerForPushNotificationsAsync.mockResolvedValue(null)
    const { rerender } = render(<PushNotificationRegistration />)

    session.current = { user: { id: 'viewer' } }
    await act(async () => {
      rerender(<PushNotificationRegistration />)
      await Promise.resolve()
    })

    expect(registerPushToken).not.toHaveBeenCalled()
  })

  it('unregisters the token on sign-out', async () => {
    registerForPushNotificationsAsync.mockResolvedValue({ token: 'ExponentPushToken[abc]', platform: 'ios' })
    registerPushToken.mockResolvedValue({ ok: true })
    unregisterPushToken.mockResolvedValue({ ok: true })
    session.current = { user: { id: 'viewer' } }
    const { rerender } = render(<PushNotificationRegistration />)
    await act(async () => {
      rerender(<PushNotificationRegistration />)
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(registerPushToken).toHaveBeenCalledTimes(1)

    session.current = null
    await act(async () => {
      rerender(<PushNotificationRegistration />)
      await Promise.resolve()
    })

    expect(unregisterPushToken).toHaveBeenCalledWith({ token: 'ExponentPushToken[abc]' })
  })
})

describe('PushNotificationNavigation', () => {
  it('opens the url a tapped notification names', () => {
    useLastNotificationResponse.mockReturnValue({ notification: { request: { content: { data: { url: '/user/ada' } } } } })

    render(<PushNotificationNavigation />)

    expect(go).toHaveBeenCalledWith('/user/ada')
  })

  it('does nothing without a response', () => {
    useLastNotificationResponse.mockReturnValue(null)

    render(<PushNotificationNavigation />)

    expect(go).not.toHaveBeenCalled()
  })
})
