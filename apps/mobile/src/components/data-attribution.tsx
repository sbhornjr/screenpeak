import { Linking, Pressable, StyleSheet, Text } from 'react-native';

import { colors, face, space } from '@/theme';

export const IGDB_ATTRIBUTION = 'Game data and images from IGDB';
export const IGDB_ATTRIBUTION_URL = 'https://www.igdb.com/';

/** Visible credit for the catalogue. Later settings work can move this to About. */
export function DataAttribution() {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={IGDB_ATTRIBUTION}
      onPress={() => {
        void Linking.openURL(IGDB_ATTRIBUTION_URL);
      }}
      style={styles.link}>
      <Text style={styles.text}>{IGDB_ATTRIBUTION}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  link: { paddingVertical: space[3], alignSelf: 'flex-start' },
  text: {
    fontFamily: face.body[400],
    fontSize: 14,
    lineHeight: 20,
    color: colors.accent,
    textDecorationLine: 'underline',
  },
});
