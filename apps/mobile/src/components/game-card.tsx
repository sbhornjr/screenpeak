// Catalog card — port of apps/web/app/components/game/GameCard.tsx (the web's
// advancedStats row is not ported yet). Web hover → native pressed state.
import type { LibraryStatus } from '@screenpeak/shared/constants'
import { releaseYear } from '@screenpeak/shared/dates'
import type { Game } from '@screenpeak/shared/types'
import { Image } from 'expo-image'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { igdbImageUri } from '@/lib/catalog-image'
import { Seal } from './seal'
import { StatusTag } from './status-tag'

import { alpha, colors, face, overlays, radius, space, tracking, trackingPx, typeScale } from '@/theme'

export type GameCardProps = {
  game: Game;
  developer?: string | null;
  /** ScreenPeak community score (/10). Absent when nobody has rated the game. */
  spRating?: number | null;
  /** The viewer's own score (/10) */
  userRating?: number | null;
  libraryStatus?: LibraryStatus | null;
  onPress?: () => void;
}

// Shorter than the game page's full status words — there's only card-badge room.
const CARD_STATUS_LABEL: Record<LibraryStatus, string> = {
  playing: 'Playing',
  completed: 'Done',
  backlog: 'Backlog',
  abandoned: 'Dropped',
}

export function GameCard({ game, developer, spRating, userRating, libraryStatus, onPress }: GameCardProps) {
  const year = releaseYear(game.released)
  const cover = igdbImageUri(game.cover_image_url)

  return (
    <Pressable accessibilityRole="link" accessibilityLabel={game.name} onPress={onPress}>
      {({ pressed }) => (
        <View style={[styles.card, pressed && styles.cardPressed]}>
          <View style={styles.cover}>
            {cover ? (
              <Image source={cover} recyclingKey={game.id} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
            ) : (
              <View style={styles.noCover}>
                <Text style={styles.noCoverText}>No Cover</Text>
              </View>
            )}

            {spRating ? <Seal label="SP" score={spRating} side="right" /> : null}
            {userRating ? <Seal label="You" score={userRating} side="left" /> : null}

            {libraryStatus && (
              <StatusTag label={CARD_STATUS_LABEL[libraryStatus]} status={libraryStatus} size="sm" style={styles.status} />
            )}
          </View>

          <View style={styles.label}>
            <Text numberOfLines={1} style={[styles.title, pressed && styles.titlePressed]}>
              {game.name}
            </Text>
            <View style={styles.metaRow}>
              <Text numberOfLines={1} style={styles.developer}>
                {developer ?? ' '}
              </Text>
              {year && <Text style={styles.year}>{year}</Text>}
            </View>
          </View>
        </View>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.base,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: alpha(colors.muted, 0.3),
    backgroundColor: colors.surface,
  },
  cardPressed: { borderColor: alpha(colors.accent, 0.6) },
  // 3:4. IGDB cover_big is 264×374, so cover crops a little of the height.
  cover: { aspectRatio: 3 / 4, width: '100%', backgroundColor: colors.surfaceLight },
  noCover: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  noCoverText: {
    fontFamily: face.mono[400],
    fontSize: typeScale.eyebrow.size,
    letterSpacing: trackingPx(tracking.wide, typeScale.eyebrow.size),
    textTransform: 'uppercase',
    color: colors.muted,
  },
  status: {
    position: 'absolute',
    bottom: space[2],
    left: space[2],
    backgroundColor: overlays.statusFill,
  },
  label: { paddingHorizontal: space[3], paddingTop: space[2.5], paddingBottom: space[3] },
  title: { fontFamily: face.display[500], fontSize: 15, lineHeight: 19, color: colors.text },
  titlePressed: { color: colors.accent },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: space[2],
    marginTop: space[1.5],
    paddingTop: space[1.5],
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  developer: { flexShrink: 1, fontFamily: face.body[400], fontSize: 12, color: colors.muted },
  year: { fontFamily: face.mono[400], fontSize: 12, color: colors.muted },
})
