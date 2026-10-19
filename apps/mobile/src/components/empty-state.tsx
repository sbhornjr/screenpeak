// Port of apps/web/app/components/util/EmptyState.tsx
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Image } from 'expo-image';

import { colors, face, space, typeScale } from '@/theme';

import { Button } from './button';

function saveIcon(color: string, size: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** Centered empty slot: the save icon, a display title, and an optional action. */
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
      <Image
        source={{ uri: saveIcon(colors.muted, dense ? 28 : 40) }}
        style={dense ? styles.iconDense : styles.icon}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      <Text role="heading" accessibilityRole="header" accessibilityLevel={2} style={[styles.title, dense && styles.titleDense]}>{title}</Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: space[2] },
  full: { paddingVertical: space[24] },
  dense: { paddingVertical: space[10] },
  icon: { width: 40, height: 40, marginBottom: space[2] },
  iconDense: { width: 28, height: 28, marginBottom: space[2] },
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
