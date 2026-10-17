import type { GameCardData } from '@screenpeak/shared/api/games'
import { Pressable, Text } from 'react-native'

import { gameHref } from '@/lib/routes'

import { DataAttribution } from './data-attribution'
import { ScreenScroll, screenStyles } from './screen-scroll'

export function CatalogueScreen({
  filterLabel,
  games,
  total,
  page,
  totalPages,
  onOpen,
  onPage,
  onBack,
}: {
  filterLabel: string | null
  games: GameCardData[]
  total: number
  page: number
  totalPages: number
  onOpen: (href: string) => void
  onPage: (page: number) => void
  onBack: () => void
}) {
  return (
    <ScreenScroll title="Games" onBack={onBack}>
      {filterLabel ? <Text style={screenStyles.body}>{filterLabel}</Text> : null}
      <Text style={screenStyles.muted}>{total} games</Text>
      {games.length === 0 ? <Text style={screenStyles.muted}>No games match.</Text> : null}
      {games.map(game => (
        <Pressable key={game.id} accessibilityRole="link" accessibilityLabel={game.name} onPress={() => onOpen(gameHref(game.slug))} style={screenStyles.rowButton}>
          <Text style={screenStyles.rowText}>{game.name}</Text>
        </Pressable>
      ))}
      {page > 1 ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Previous page" onPress={() => onPage(page - 1)} style={screenStyles.rowButton}>
          <Text style={screenStyles.rowText}>Previous page</Text>
        </Pressable>
      ) : null}
      {page < totalPages ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Next page" onPress={() => onPage(page + 1)} style={screenStyles.rowButton}>
          <Text style={screenStyles.rowText}>Next page</Text>
        </Pressable>
      ) : null}
      <DataAttribution />
    </ScreenScroll>
  )
}
