// The website Modal, presented as a bottom sheet.
import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, face, overlays, radius, space, typeScale } from '@/theme';

import { Button } from './button';

export function Sheet({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.fill}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          onPress={onClose}
          style={styles.backdrop}
        />
        <View
          role="dialog"
          accessibilityLabel={title}
          accessibilityViewIsModal
          style={styles.sheet}
        >
          <View style={styles.header}>
            <Text role="heading" style={styles.title}>{title}</Text>
            <Button label="Close" variant="ghost" onPress={onClose} />
          </View>
          <View style={styles.body}>{children}</View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: overlays.backdrop },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.base,
    borderTopRightRadius: radius.base,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space[4],
    paddingTop: space[4],
    paddingBottom: space[8],
    gap: space[3],
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3] },
  title: {
    flex: 1,
    fontFamily: face.display[600],
    fontSize: typeScale.xl.size,
    lineHeight: typeScale.xl.line,
    color: colors.text,
  },
  body: { gap: space[3] },
});
