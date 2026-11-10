import { Pressable, StyleSheet, Text } from 'react-native'

import { colors, hitTarget, radius, space, text } from '@/theme'

/** A full-width on/off row. The accent border marks it on. */
export function SwitchRow({ label, accessibilityLabel, value, onChange, states = ['Off', 'On'], disabled = false }: {
  label: string
  accessibilityLabel: string
  value: boolean
  onChange: (next: boolean) => void
  /** What the row says when off, then on. */
  states?: [string, string]
  disabled?: boolean
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={[styles.row, value && styles.on]}
    >
      <Text style={text.body}>{label}</Text>
      <Text style={text.meta}>{value ? states[1] : states[0]}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    minHeight: hitTarget,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.base,
    paddingHorizontal: space[3],
    paddingVertical: space[3],
    gap: space[1],
    backgroundColor: colors.surface,
  },
  on: { borderColor: colors.accent },
})
