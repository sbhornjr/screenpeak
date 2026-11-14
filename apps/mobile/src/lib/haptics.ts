import * as Haptics from 'expo-haptics'

/**
 * A light tap, for a frequent, low-stakes interaction: rate, like, follow.
 * Fire-and-forget — a haptic that fails (no haptics hardware, web, a denied
 * permission) is not a reason to fail the action it rides along with.
 */
export function tapHaptic(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined)
}
