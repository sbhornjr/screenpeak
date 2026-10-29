import { StyleSheet } from 'react-native'

import { colors, tracking, trackingPx, typeScale } from '@screenpeak/shared/tokens'

import { face } from './fonts'

/** Text styles most screens share. A screen keeps its own only when it differs. */
export const text = StyleSheet.create({
  body: { fontFamily: face.body[400], fontSize: typeScale.base.size, lineHeight: typeScale.base.line, color: colors.text },
  /** Body copy that is secondary: hints, empty lines, counts in prose. */
  muted: { fontFamily: face.body[400], fontSize: typeScale.base.size, lineHeight: typeScale.base.line, color: colors.muted },
  /** A short status line under a form. */
  notice: { fontFamily: face.body[400], fontSize: typeScale.sm.size, lineHeight: typeScale.sm.line, color: colors.text },
  error: { fontFamily: face.body[400], fontSize: typeScale.sm.size, lineHeight: typeScale.sm.line, color: colors.bad },
  /** Mono secondary line: dates, counts, On/Off. */
  meta: { fontFamily: face.mono[400], fontSize: typeScale.sm.size, lineHeight: typeScale.sm.line, color: colors.muted },
  /** The smaller mono line on dense cards and the game page. */
  caption: { fontFamily: face.mono[400], fontSize: typeScale.xs.size, color: colors.muted },
  /** Tracked uppercase field label. */
  label: {
    fontFamily: face.mono[400],
    fontSize: typeScale.eyebrow.size,
    letterSpacing: trackingPx(tracking.wide, typeScale.eyebrow.size),
    textTransform: 'uppercase',
    color: colors.muted,
  },
})
