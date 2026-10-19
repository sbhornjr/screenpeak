import { Text } from 'react-native'

import { gameHref } from '@/lib/routes'

import { EmptyState } from './empty-state'
import { ScreenScroll, screenStyles, PanelRow } from './screen-scroll'

export function ListDetailScreen({
  name,
  description,
  games,
  onOpen,
  onBack,
}: {
  name: string
  description: string
  games: { slug: string, name: string }[]
  onOpen: (href: string) => void
  onBack?: () => void
}) {
  return (
    <ScreenScroll title={name} onBack={onBack}>
      {description ? <Text style={screenStyles.body}>{description}</Text> : null}
      {games.length === 0 ? <EmptyState dense title="No games in this list." /> : null}
      {games.map(game => (
        <PanelRow key={game.slug} accessibilityRole="link" accessibilityLabel={game.name} onPress={() => onOpen(gameHref(game.slug))}>
          <Text style={screenStyles.body}>{game.name}</Text>
        </PanelRow>
      ))}
    </ScreenScroll>
  )
}
