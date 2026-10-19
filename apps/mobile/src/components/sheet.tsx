// The website Modal, presented as a bottom sheet.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { findNodeHandle, Keyboard, Pressable, Modal, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, face, overlays, radius, space, typeScale } from '@/theme';

import { Button } from './button';

type FocusedField = {
  scrollIntoView?: (options: { block?: 'center' | 'nearest' }) => void;
  measureLayout?: (
    relative: number,
    onSuccess: (x: number, y: number, width: number, height: number) => void,
    onFail: () => void,
  ) => void;
};

/** Keep the field being typed in view when the keyboard opens or the window gets shorter. */
function revealFocusedField(scroll: ScrollView | null) {
  const input = TextInput.State?.currentlyFocusedInput?.() as FocusedField | null;
  if (!input || !scroll) return;
  if (typeof input.scrollIntoView === 'function') {
    input.scrollIntoView({ block: 'center' });
    return;
  }
  const relative = findNodeHandle(scroll);
  if (relative == null || typeof input.measureLayout !== 'function') return;
  input.measureLayout(
    relative,
    (_x, y) => scroll.scrollTo({ y: Math.max(0, y - 24), animated: false }),
    () => undefined,
  );
}

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
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => revealFocusedField(scrollRef.current));
    return () => cancelAnimationFrame(frame);
  }, [height, keyboardHeight]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.fill}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          focusable={false}
          tabIndex={-1}
          onPress={onClose}
          style={styles.backdrop}
        />
        <View
          role="dialog"
          accessibilityLabel={title}
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {
              maxHeight: Math.round(height * 0.9),
              paddingBottom: space[4] + keyboardHeight + insets.bottom,
            },
          ]}
        >
          <View style={styles.header}>
            <Text role="heading" accessibilityRole="header" accessibilityLevel={2} style={styles.title}>{title}</Text>
            <Button label="Close" variant="ghost" onPress={onClose} />
          </View>
          <ScrollView
            ref={scrollRef}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
            style={styles.scroll}
            contentContainerStyle={styles.body}
          >
            {children}
          </ScrollView>
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
  scroll: { flexShrink: 1 },
  body: { gap: space[3] },
});
