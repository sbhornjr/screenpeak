import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Eyebrow } from '@/components/eyebrow';
import { colors, face, space, tracking, trackingPx } from '@/theme';

// Placeholder until the real Home/feed screen (build-plan.md Phase 3).
export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <Eyebrow>ScreenPeak</Eyebrow>
        <Text style={styles.title}>Your feed lands here.</Text>
        <Text style={styles.body}>The mobile screens arrive once the /api/v1 layer is in place.</Text>
      </View>
    </SafeAreaView>
  );
}

const TITLE = 28;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: space[6], gap: space[3] },
  title: {
    fontFamily: face.display[600],
    fontSize: TITLE,
    lineHeight: 32,
    letterSpacing: trackingPx(tracking.display, TITLE),
    color: colors.text,
  },
  body: { fontFamily: face.body[400], fontSize: 16, lineHeight: 24, color: colors.muted },
});
