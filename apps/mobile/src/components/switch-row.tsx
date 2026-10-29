import { Pressable, StyleSheet, Text } from 'react-native'

import { colors, hitTarget, radius, space, text } from '@/theme'

/** A full-width on/off row. The accent border marks it on. */
export function SwitchRow({ label, accessibilityLabel, value, onChange }: {
  label: string
  accessibilityLabel: string
  value: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={[styles.row, value && styles.on]}
    >
      <Text style={text.body}>{label}</Text>
      <Text style={text.meta}>{value ? 'On' : 'Off'}</Text>
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
