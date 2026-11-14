// expo-haptics pulls in native-module setup Vitest can't run under Node, the
// same problem lucide-react-native has (see vitest.config.mts). `impactAsync`
// is a vi.fn() so a test can assert on it; tests that don't care just import
// the real `@/lib/haptics` through this stub without crashing.
import { vi } from 'vitest'

export enum ImpactFeedbackStyle {
  Light = 'light',
  Medium = 'medium',
  Heavy = 'heavy',
  Soft = 'soft',
  Rigid = 'rigid',
}

export enum NotificationFeedbackType {
  Success = 'success',
  Warning = 'warning',
  Error = 'error',
}

export const impactAsync = vi.fn(() => Promise.resolve())
export const notificationAsync = vi.fn(() => Promise.resolve())
