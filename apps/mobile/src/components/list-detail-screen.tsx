import { Pressable, Text } from 'react-native'

import { gameHref } from '@/lib/routes'

import { ScreenScroll, screenStyles } from './screen-scroll'

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
      {games.length === 0 ? <Text style={screenStyles.muted}>No games in this list.</Text> : null}
      {games.map(game => (
        <Pressable key={game.slug} accessibilityRole="link" accessibilityLabel={game.name} onPress={() => onOpen(gameHref(game.slug))} style={screenStyles.rowButton}>
          <Text style={screenStyles.rowText}>{game.name}</Text>
        </Pressable>
      ))}
    </ScreenScroll>
  )
}
