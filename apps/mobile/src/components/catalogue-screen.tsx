import type { GameCardData } from '@screenpeak/shared/api/games'
import { Text } from 'react-native'

import { gameHref } from '@/lib/routes'
import { text } from '@/theme'

import { Button } from './button'
import { DataAttribution } from './data-attribution'
import { EmptyState } from './empty-state'
import { ScreenScroll, PanelRow } from './screen-scroll'

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
      {filterLabel ? <Text style={text.body}>{filterLabel}</Text> : null}
      <Text style={text.muted}>{total} games</Text>
      {games.length === 0 ? <EmptyState dense title="No games match." /> : null}
      {games.map(game => (
        <PanelRow key={game.id} accessibilityRole="link" accessibilityLabel={game.name} onPress={() => onOpen(gameHref(game.slug))}>
          <Text style={text.body}>{game.name}</Text>
        </PanelRow>
      ))}
      {page > 1 ? <Button label="Previous page" variant="secondary" onPress={() => onPage(page - 1)} /> : null}
      {page < totalPages ? <Button label="Next page" variant="secondary" onPress={() => onPage(page + 1)} /> : null}
      <DataAttribution />
    </ScreenScroll>
  )
}
