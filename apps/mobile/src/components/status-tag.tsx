import type { LibraryStatus } from '@screenpeak/shared/constants'
import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native'

import { alpha, colors, face, radius, space, tracking, trackingPx, typeScale } from '@/theme'

type StatusMeta = { color: string, border: string, strike: boolean }

// Library status is neutral chrome, never a rating hue — same table the web uses.
const STATUS_META: Record<LibraryStatus, StatusMeta> = {
  playing: { color: colors.accent, border: alpha(colors.accent, 0.5), strike: false },
  completed: { color: colors.text, border: colors.border, strike: false },
  backlog: { color: colors.muted, border: colors.border, strike: false },
  abandoned: { color: colors.muted, border: colors.border, strike: true },
}

export function statusMeta(status: LibraryStatus): StatusMeta {
  return STATUS_META[status]
}

/**
 * One visual for a library status — mono, uppercase, bordered in the
 * status's color — whether it sits inline on the game page (`size="md"`) or
 * floats over cover art on a GameCard (`size="sm"`, with a `style` override
 * for the absolute position and overlay fill it needs there).
 */
export function StatusTag({ label, status, size = 'md', style }: {
  label: string
  status: LibraryStatus
  size?: 'sm' | 'md'
  style?: StyleProp<TextStyle>
}) {
  const meta = statusMeta(status)
  return (
    <Text
      style={[
        styles.base,
        size === 'sm' ? styles.sm : styles.md,
        { color: meta.color, borderColor: meta.border },
        meta.strike && styles.strike,
        style,
      ]}
    >
      {label}
    </Text>
  )
}

const styles = StyleSheet.create({
  base: {
    alignSelf: 'flex-start',
    overflow: 'hidden',
    borderRadius: radius.seal,
    borderWidth: 1,
    fontFamily: face.mono[600],
    textTransform: 'uppercase',
  },
  sm: {
    paddingHorizontal: space[1.5],
    paddingVertical: space[0.5],
    fontSize: 9,
    letterSpacing: trackingPx(tracking.wider, 9),
  },
  md: {
    paddingHorizontal: space[3],
    paddingVertical: space[1],
    fontSize: typeScale.xs.size,
    letterSpacing: trackingPx(tracking.wide, typeScale.xs.size),
  },
  strike: { textDecorationLine: 'line-through' },
})
