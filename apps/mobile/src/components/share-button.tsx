import { Share2 } from 'lucide-react-native'
import { useState } from 'react'
import { Pressable, StyleSheet, Text } from 'react-native'

import { shareUrl } from '@/lib/share'
import { colors, face, hitTarget, typeScale } from '@/theme'

const ICON = 20
const COPIED_MS = 2000

/**
 * Sits in `AppHeader`'s trailing slot. On web there is no native share sheet,
 * so a clipboard copy swaps the icon for "Copied" briefly — the only outcome
 * that needs its own feedback, since a real share sheet already confirms itself.
 */
export function ShareButton({ url, title, label }: { url: string, title: string, label: string }) {
  const [copied, setCopied] = useState(false)

  async function press() {
    const outcome = await shareUrl(url, title)
    if (outcome !== 'copied') return
    setCopied(true)
    setTimeout(() => setCopied(false), COPIED_MS)
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={copied ? 'Link copied' : label}
      onPress={() => { void press() }}
      style={styles.hit}
    >
      {copied ? <Text style={styles.copied}>Copied</Text> : <Share2 size={ICON} color={colors.accent} />}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  hit: {
    alignSelf: 'flex-end',
    minWidth: hitTarget,
    minHeight: hitTarget,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  copied: {
    fontFamily: face.display[600],
    fontSize: typeScale.sm.size,
    lineHeight: typeScale.sm.line,
    color: colors.accent,
  },
})
