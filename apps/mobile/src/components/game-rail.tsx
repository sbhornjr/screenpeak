// A sideways row of game cards, so a section stays one row tall on a phone.
// Explore's Peak right now and the Loadout's Top and Bottom Scores use it.
import type { GameCardData } from '@screenpeak/shared/api/games'
import type { ReactNode } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'

import { gameHref } from '@/lib/routes'
import { space } from '@/theme'

import { GameCard } from './game-card'

export const RAIL_CARD_WIDTH = 148

/** The rail runs to the screen edge; `inset` is the page padding it reaches past. */
export function GameRail({ label, inset, children }: { label: string, inset: number, children: ReactNode }) {
  return (
    <ScrollView
      horizontal
      accessibilityLabel={label}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.rail, { paddingHorizontal: inset }]}
      style={{ marginHorizontal: -inset }}
    >
      {children}
    </ScrollView>
  )
}

/** One card in a rail, with an optional line above or below it. */
export function RailCard({ game, onOpen, above, below }: {
  game: GameCardData
  onOpen: (href: string) => void
  above?: ReactNode
  below?: ReactNode
}) {
  return (
    <View style={styles.item}>
      {above}
      <GameCard
        game={{ id: game.id, name: game.name, slug: game.slug, cover_image_url: game.cover_image_url, released: game.released }}
        developer={game.developer}
        spRating={game.avg_rating}
        userRating={game.user_rating}
        onPress={() => onOpen(gameHref(game.slug))}
      />
      {below}
    </View>
  )
}

const styles = StyleSheet.create({
  rail: { gap: space[3] },
  item: { width: RAIL_CARD_WIDTH, gap: space[1.5] },
})
