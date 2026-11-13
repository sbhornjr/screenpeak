import { beforeEach, describe, expect, it, vi } from 'vitest'

import { registerForPushNotificationsAsync } from './push-notifications'

const { platform, getPermissionsAsync, requestPermissionsAsync, getExpoPushTokenAsync, setNotificationChannelAsync, setNotificationHandler } = vi.hoisted(() => ({
  platform: { OS: 'ios' as string },
  getPermissionsAsync: vi.fn(),
  requestPermissionsAsync: vi.fn(),
  getExpoPushTokenAsync: vi.fn(),
  setNotificationChannelAsync: vi.fn(),
  setNotificationHandler: vi.fn(),
}))

const constants = vi.hoisted(() => ({
  expoConfig: { extra: {} as Record<string, unknown> } as { extra: Record<string, unknown> } | undefined,
  easConfig: undefined as { projectId?: string } | undefined,
}))

vi.mock('react-native', () => ({ Platform: platform }))

vi.mock('expo-notifications', () => ({
  setNotificationHandler,
  getPermissionsAsync,
  requestPermissionsAsync,
  getExpoPushTokenAsync,
  setNotificationChannelAsync,
  AndroidImportance: { MAX: 5 },
}))

vi.mock('expo-constants', () => ({
  default: {
    get expoConfig() { return constants.expoConfig },
    get easConfig() { return constants.easConfig },
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  platform.OS = 'ios'
  constants.expoConfig = { extra: { eas: { projectId: 'project-123' } } }
  constants.easConfig = undefined
})

describe('registerForPushNotificationsAsync', () => {
  it('skips entirely on web', async () => {
    platform.OS = 'web'
    expect(await registerForPushNotificationsAsync()).toBeNull()
    expect(getPermissionsAsync).not.toHaveBeenCalled()
  })

  it('requests permission only when not already granted, and returns the token', async () => {
    getPermissionsAsync.mockResolvedValue({ status: 'undetermined' })
    requestPermissionsAsync.mockResolvedValue({ status: 'granted' })
    getExpoPushTokenAsync.mockResolvedValue({ data: 'ExponentPushToken[abc]' })

    const result = await registerForPushNotificationsAsync()

    expect(requestPermissionsAsync).toHaveBeenCalledTimes(1)
    expect(getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: 'project-123' })
    expect(result).toEqual({ token: 'ExponentPushToken[abc]', platform: 'ios' })
  })

  it('does not re-prompt when permission is already granted', async () => {
    getPermissionsAsync.mockResolvedValue({ status: 'granted' })
    getExpoPushTokenAsync.mockResolvedValue({ data: 'ExponentPushToken[abc]' })

    await registerForPushNotificationsAsync()

    expect(requestPermissionsAsync).not.toHaveBeenCalled()
  })

  it('returns null when permission is refused', async () => {
    getPermissionsAsync.mockResolvedValue({ status: 'undetermined' })
    requestPermissionsAsync.mockResolvedValue({ status: 'denied' })

    expect(await registerForPushNotificationsAsync()).toBeNull()
    expect(getExpoPushTokenAsync).not.toHaveBeenCalled()
  })

  it('returns null when no EAS project id is configured', async () => {
    getPermissionsAsync.mockResolvedValue({ status: 'granted' })
    constants.expoConfig = { extra: {} }

    expect(await registerForPushNotificationsAsync()).toBeNull()
    expect(getExpoPushTokenAsync).not.toHaveBeenCalled()
  })

  it('falls back to Constants.easConfig.projectId when extra.eas is missing', async () => {
    getPermissionsAsync.mockResolvedValue({ status: 'granted' })
    constants.expoConfig = { extra: {} }
    constants.easConfig = { projectId: 'fallback-id' }
    getExpoPushTokenAsync.mockResolvedValue({ data: 'ExponentPushToken[abc]' })

    await registerForPushNotificationsAsync()

    expect(getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: 'fallback-id' })
  })

  it('returns null, rather than throwing, when the token request fails', async () => {
    getPermissionsAsync.mockResolvedValue({ status: 'granted' })
    getExpoPushTokenAsync.mockRejectedValue(new Error('offline'))

    await expect(registerForPushNotificationsAsync()).resolves.toBeNull()
  })

  it('creates the default Android channel before requesting permission', async () => {
    platform.OS = 'android'
    getPermissionsAsync.mockResolvedValue({ status: 'granted' })
    getExpoPushTokenAsync.mockResolvedValue({ data: 'ExponentPushToken[abc]' })

    const result = await registerForPushNotificationsAsync()

    expect(setNotificationChannelAsync).toHaveBeenCalledWith('default', { name: 'Default', importance: 5 })
    expect(result).toEqual({ token: 'ExponentPushToken[abc]', platform: 'android' })
  })
})
