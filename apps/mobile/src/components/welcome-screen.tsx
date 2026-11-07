import type { GameCardData } from '@screenpeak/shared/api/games'
import { Text, useWindowDimensions } from 'react-native'

import { catalogueHref } from '@/lib/routes'
import { space, text } from '@/theme'

import { Button } from './button'
import { DataAttribution } from './data-attribution'
import { GameRail, RailCard } from './game-rail'
import { ScreenScroll } from './screen-scroll'
import { SectionHead } from './section-head'

export function WelcomeScreen({ onOpen, trendingGames = [] }: {
  onOpen: (href: string) => void
  /** This week's trending games, falling back to all time. Hidden while empty. */
  trendingGames?: GameCardData[]
}) {
  const { width } = useWindowDimensions()
  const inset = width <= 375 ? space[4] : space[6]
  return (
    <ScreenScroll title="Welcome">
      <Text style={text.body}>Sign up, log in, or browse the catalogue.</Text>
      <Button label="Sign up" onPress={() => onOpen('/sign-up')} />
      <Button label="Log in" variant="secondary" onPress={() => onOpen('/sign-in')} />
      <Button label="Browse" variant="secondary" onPress={() => onOpen(catalogueHref())} />
      {trendingGames.length > 0 ? (
        <>
          <SectionHead>Peak right now</SectionHead>
          <GameRail label="Peak right now" inset={inset}>
            {trendingGames.slice(0, 6).map(game => (
              <RailCard key={game.id} game={game} onOpen={onOpen} />
            ))}
          </GameRail>
        </>
      ) : null}
      <DataAttribution />
    </ScreenScroll>
  )
}
