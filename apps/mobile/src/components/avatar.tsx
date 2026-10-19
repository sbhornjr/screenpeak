// Port of apps/web/app/components/user/Avatar.tsx
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { avatarTint, colors, face, typeScale } from '@/theme';

type AvatarSize = 'sm' | 'md' | 'lg';

const PX: Record<AvatarSize, number> = { sm: 32, md: 56, lg: 80 };
const LETTER: Record<AvatarSize, number> = {
  sm: typeScale.sm.size,
  md: typeScale.lg.size,
  lg: typeScale['2xl'].size,
};

/** Round photo, or the first letter on the shared tint when there is no photo. */
export function Avatar({ src, alt, size = 'md' }: { src?: string | null; alt: string; size?: AvatarSize }) {
  const px = PX[size];
  const initial = (alt.trim()[0] || '?').toUpperCase();
  return (
    <View
      accessibilityRole={src ? undefined : 'image'}
      accessibilityLabel={src ? undefined : alt}
      role={src ? undefined : 'img'}
      style={[styles.disc, { width: px, height: px, borderRadius: px / 2, borderWidth: src ? 0 : 1 }]}
    >
      {src ? (
        <Image
          source={src}
          style={{ width: px, height: px }}
          contentFit="cover"
          accessibilityLabel={alt}
        />
      ) : (
        <View style={[styles.fallback, { width: px, height: px, borderRadius: px / 2, backgroundColor: avatarTint(alt || '?') }]}>
          <Text style={[styles.letter, { fontSize: LETTER[size] }]}>{initial}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  disc: { overflow: 'hidden', borderColor: colors.border, flexShrink: 0 },
  fallback: { alignItems: 'center', justifyContent: 'center' },
  letter: { fontFamily: face.display[700], color: colors.text },
});
