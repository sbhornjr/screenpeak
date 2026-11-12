import { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'

import { subscribePlus1, type Plus1Chip } from '@/lib/plus1'
import { alpha, colors, face, space, typeScale } from '@/theme'

const DURATION = 1000
const EASING = Easing.bezier(0.2, 0.7, 0.3, 1)

/**
 * One floating chip. A single `progress` value (0 → 1, eased once) drives
 * every property, piecewise-interpolated at the same percentages as the
 * website's `sp-plus1` keyframes — pop in past 100% scale, settle, then float
 * up and fade. `prefers-reduced-motion`'s `sp-plus1-rm` keyframes are the
 * `reducedMotion` branch: stay fully visible, then cut opacity at the end.
 */
function Chip({ text, reducedMotion, onDone }: { text: string, reducedMotion: boolean, onDone: () => void }) {
  const progress = useSharedValue(0)

  useEffect(() => {
    progress.value = withTiming(1, { duration: DURATION, easing: EASING })
    const timer = setTimeout(onDone, DURATION)
    return () => clearTimeout(timer)
    // Runs once per chip; onDone and progress are stable for its lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const style = useAnimatedStyle(() => (reducedMotion
    ? { opacity: interpolate(progress.value, [0, 0.8, 1], [1, 1, 0]) }
    : {
      opacity: interpolate(progress.value, [0, 0.16, 1], [0, 1, 0]),
      transform: [
        { translateY: interpolate(progress.value, [0, 0.16, 0.3, 1], [10, 0, -2, -34]) },
        { scale: interpolate(progress.value, [0, 0.16, 0.3, 1], [0.85, 1.05, 1, 1]) },
      ],
    }
  ))

  return <Animated.Text style={[styles.chip, style]}>{text}</Animated.Text>
}

/**
 * The +1 tic — ScreenPeak's signature interaction, ported from the website's
 * `Plus1Layer`/`sp-plus1`. Mounted once in the root layout; fire from
 * anywhere with `plus1()` (`@/lib/plus1`), e.g. `plus1('SAVED')`.
 */
export function Plus1Layer() {
  const [chips, setChips] = useState<Plus1Chip[]>([])
  const reducedMotion = useReducedMotion()

  useEffect(() => subscribePlus1(chip => setChips(current => [...current, chip])), [])

  function remove(id: number) {
    setChips(current => current.filter(chip => chip.id !== id))
  }

  if (chips.length === 0) return null

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.layer]}>
      {chips.map(chip => (
        <Chip key={chip.id} text={chip.text} reducedMotion={reducedMotion} onDone={() => remove(chip.id)} />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  layer: {
    top: '14%',
    alignItems: 'center',
    gap: space[1.5],
  },
  chip: {
    fontFamily: face.mono[600],
    fontSize: typeScale.lg.size,
    lineHeight: typeScale.lg.line,
    letterSpacing: 1,
    color: colors.accent,
    textShadowColor: alpha(colors.accent, 0.6),
    textShadowRadius: 16,
    textShadowOffset: { width: 0, height: 1 },
  },
})
