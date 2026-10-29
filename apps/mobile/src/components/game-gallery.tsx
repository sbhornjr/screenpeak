import { Image } from 'expo-image'
import { useState } from 'react'
import { Modal, Pressable, StyleSheet, View } from 'react-native'

import { colors, radius, space } from '@/theme'

import { Button } from './button'
import { SectionHead } from './section-head'

function ShotSteps({ onStep }: { onStep: (delta: number) => void }) {
  return (
    <>
      <Button label="Previous" accessibilityLabel="Previous screenshot" variant="secondary" onPress={() => onStep(-1)} />
      <Button label="Next" accessibilityLabel="Next screenshot" variant="secondary" onPress={() => onStep(1)} />
    </>
  )
}

/** One screenshot at a time. Tapping it opens the same frame full screen. */
export function GameGallery({ shots }: { shots: string[] }) {
  const [index, setIndex] = useState(0)
  const [open, setOpen] = useState(false)
  if (shots.length === 0) return null
  const number = Math.min(index, shots.length - 1)
  const frame = shots[number]
  const stepper = shots.length > 1
    ? <ShotSteps onStep={delta => setIndex(current => (current + delta + shots.length) % shots.length)} />
    : null

  return (
    <>
      <SectionHead>Gallery</SectionHead>
      <View style={styles.frame}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Screenshot ${number + 1} of ${shots.length}`}
          onPress={() => setOpen(true)}
          style={styles.hit}
        >
          <Image key={frame} source={frame} style={styles.shot} contentFit="cover" accessible={false} />
        </Pressable>
        {stepper ? <View style={styles.nav}>{stepper}</View> : null}
      </View>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.viewer}>
          <Image source={frame} style={styles.viewerImage} contentFit="contain" accessible={false} />
          <View style={styles.nav}>
            {stepper}
            <Button label="Close screenshot" variant="secondary" onPress={() => setOpen(false)} />
          </View>
        </View>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  frame: { gap: space[2] },
  hit: { width: '100%' },
  shot: { width: '100%', aspectRatio: 16 / 9, borderRadius: radius.base, backgroundColor: colors.surfaceLight },
  nav: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], justifyContent: 'center' },
  viewer: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    padding: space[4],
    gap: space[4],
  },
  viewerImage: { width: '100%', flex: 1 },
})
