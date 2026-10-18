// Port of apps/web/app/components/util/EmptyState.tsx
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, face, radius, space, typeScale } from '@/theme';

import { Button } from './button';

/** Centered empty slot: a dashed mark, a display title, and an optional action. */
export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  dense = false,
}: {
  title: string;
  description?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  dense?: boolean;
}) {
  return (
    <View style={[styles.wrap, dense ? styles.dense : styles.full]}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.mark, dense && styles.markDense]}
      />
      <Text role="heading" style={[styles.title, dense && styles.titleDense]}>{title}</Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: space[2] },
  full: { paddingVertical: space[12] },
  dense: { paddingVertical: space[6] },
  mark: {
    width: 40,
    height: 40,
    marginBottom: space[2],
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderBright,
    borderRadius: radius.base,
  },
  markDense: { width: 28, height: 28 },
  title: {
    fontFamily: face.display[600],
    fontSize: typeScale.xl.size,
    lineHeight: typeScale.xl.line,
    color: colors.text,
    textAlign: 'center',
  },
  titleDense: { fontSize: typeScale.lg.size, lineHeight: typeScale.lg.line },
  description: {
    fontFamily: face.body[400],
    fontSize: typeScale.sm.size,
    lineHeight: typeScale.sm.line,
    color: colors.muted,
    textAlign: 'center',
  },
});
