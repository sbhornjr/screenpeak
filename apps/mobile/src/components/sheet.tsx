// The website Modal, presented as a bottom sheet.
import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { Keyboard, Platform, Pressable, Modal, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View, type HostInstance, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, face, overlays, radius, space, typeScale } from '@/theme';

import { Button } from './button';

type FocusedField = HostInstance & {
  scrollIntoView?: (options: { block?: 'center' | 'nearest' }) => void;
};

type SheetDismiss = (then?: () => void) => void;

const SheetDismissContext = createContext<SheetDismiss | null>(null);

/** Close this sheet, then run `then` after it has left the screen. */
export function useSheetDismiss(): SheetDismiss {
  const dismiss = useContext(SheetDismissContext);
  if (!dismiss) throw new Error('useSheetDismiss must be used inside a Sheet');
  return dismiss;
}

/**
 * Keep the field being typed in view when the keyboard opens or the window gets shorter.
 * Native measurement goes through the scroll view's inner host. Passing findNodeHandle's
 * number into measureLayout warns: "ref.measureLayout must be called with a ref to a native component".
 */
function revealFocusedField(scroll: ScrollViewInstance | null) {
  const input = TextInput.State?.currentlyFocusedInput?.() as FocusedField | null;
  if (!input || !scroll) return;
  if (typeof input.scrollIntoView === 'function') {
    input.scrollIntoView({ block: 'center' });
    return;
  }
  scroll.scrollResponderScrollNativeHandleToKeyboard(input, 80, true);
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
  const scrollRef = useRef<ScrollViewInstance>(null);
  const pending = useRef<(() => void) | null>(null);
  const native = Platform.OS === 'ios' || Platform.OS === 'android';

  function runPending() {
    const then = pending.current;
    if (!then) return;
    pending.current = null;
    then();
  }

  useEffect(() => {
    // iOS and web call onDismiss after the modal is gone. Android does not.
    if (visible || !pending.current || Platform.OS !== 'android') return;
    const frame = requestAnimationFrame(runPending);
    return () => cancelAnimationFrame(frame);
  }, [visible]);

  function dismiss(then?: () => void) {
    if (then) pending.current = then;
    onClose();
  }

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => {
      requestAnimationFrame(() => revealFocusedField(scrollRef.current));
    });
    return () => show.remove();
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => revealFocusedField(scrollRef.current));
    return () => cancelAnimationFrame(frame);
  }, [height]);

  return (
    <Modal visible={visible} transparent animationType="slide" onDismiss={runPending} onRequestClose={onClose}>
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
              paddingBottom: space[4] + insets.bottom,
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
            automaticallyAdjustKeyboardInsets={native}
            style={styles.scroll}
            contentContainerStyle={styles.body}
          >
            <SheetDismissContext.Provider value={dismiss}>
              {children}
            </SheetDismissContext.Provider>
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
