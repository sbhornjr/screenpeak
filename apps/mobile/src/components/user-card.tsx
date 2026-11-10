// Port of apps/web/app/components/user/UserCard.tsx
import type { ExploreUserCard } from '@screenpeak/shared/api/explore'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { memberSinceLabel } from '@/lib/profile-hub'
import { alpha, colors, face, radius, space, typeScale } from '@/theme'

import { Avatar } from './avatar'

/** A player: avatar, name, title, member since, follow counts, and games and average. Opens the profile. */
export function UserCard({ user, onPress }: { user: ExploreUserCard, onPress: () => void }) {
  const title = user.selected_title ?? 'Title-less Noob'
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={`${user.username}, ${title}`} onPress={onPress}>
      {({ pressed }) => (
        <View style={[styles.card, pressed && styles.pressed]}>
          <Avatar src={user.avatar_url} alt={user.username} size="md" />
          <View style={styles.body}>
            <Text numberOfLines={1} style={[styles.name, pressed && styles.namePressed]}>{user.username}</Text>
            <Text numberOfLines={1} style={styles.title}>{title}</Text>
            {memberSinceLabel(user.created_at) ? <Text style={styles.meta}>{memberSinceLabel(user.created_at)}</Text> : null}
            <Text style={styles.meta}>{`${user.follower_count} followers · ${user.following_count} following`}</Text>
          </View>
          <View style={styles.stats}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{user.game_count}</Text>
              <Text style={styles.meta}>Games</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{user.avg_rating ?? '—'}</Text>
              <Text style={styles.meta}>Avg</Text>
            </View>
          </View>
        </View>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    padding: space[3],
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.base,
    backgroundColor: colors.surface,
  },
  pressed: { borderColor: alpha(colors.accent, 0.5) },
  body: { flex: 1, minWidth: 0, gap: space[0.5] },
  name: { fontFamily: face.display[700], fontSize: typeScale.base.size, lineHeight: typeScale.base.line, color: colors.text },
  namePressed: { color: colors.accent },
  title: { fontFamily: face.display[600], fontSize: typeScale.xs.size, lineHeight: typeScale.xs.line, color: colors.accent },
  meta: { fontFamily: face.body[400], fontSize: typeScale.xs.size, lineHeight: typeScale.xs.line, color: colors.muted },
  stats: { flexDirection: 'row', gap: space[3], flexShrink: 0 },
  stat: { alignItems: 'center' },
  statValue: { fontFamily: face.mono[400], fontSize: typeScale.lg.size, lineHeight: typeScale.lg.line, color: colors.accent },
})
