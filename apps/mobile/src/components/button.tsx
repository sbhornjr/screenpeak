import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { colors, face, hitTarget, radius, space, typeScale } from '@/theme';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

/** Website button: 3px corners, display semibold, at least a 44pt hit target. */
export function Button({
  label,
  onPress,
  disabled = false,
  variant = 'primary',
  accessibilityLabel,
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: ButtonVariant;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const name = accessibilityLabel ?? label;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={disabled ? undefined : onPress}
      style={[styles.base, styles[variant], disabled && styles.disabled, style]}
    >
      <Text style={[styles.label, variant === 'primary' ? styles.onAccent : variant === 'ghost' ? styles.ghostLabel : styles.secondaryLabel]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: hitTarget,
    minWidth: hitTarget,
    borderRadius: radius.base,
    paddingHorizontal: space[4],
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: colors.accent },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ghost: {
    alignSelf: 'flex-start',
    backgroundColor: 'transparent',
    paddingHorizontal: space[2],
  },
  disabled: { opacity: 0.6 },
  label: {
    fontFamily: face.display[600],
    fontSize: typeScale.sm.size,
    lineHeight: typeScale.sm.line,
  },
  onAccent: { color: colors.bg },
  secondaryLabel: { color: colors.text },
  ghostLabel: { color: colors.accent },
});
