import type { LibraryGameCard } from '@screenpeak/shared/api/library'
import { Text } from 'react-native'

import { gameHref } from '@/lib/routes'

import { EmptyState } from './empty-state'
import { ScreenScroll, screenStyles, PanelRow, SignupButtons } from './screen-scroll'

function statusLabel(status: string | null): string | null {
  if (status === 'playing') return 'Playing'
  if (status === 'completed') return 'Completed'
  if (status === 'backlog') return 'Backlog'
  if (status === 'abandoned') return 'Abandoned'
  if (!status) return null
  return status
}

export function LibraryScreen({
  locked,
  games,
  onOpen,
  onBack,
}: {
  locked: boolean
  games: LibraryGameCard[]
  onOpen: (href: string) => void
  onBack?: () => void
}) {
  if (locked) {
    return (
      <ScreenScroll title="Library" onBack={onBack}>
        <EmptyState dense title="Sign up to see your library." />
        <SignupButtons onOpen={onOpen} />
      </ScreenScroll>
    )
  }
  return (
    <ScreenScroll title="Library" onBack={onBack}>
      {games.length === 0 ? <EmptyState dense title="Nothing in this library yet." /> : null}
      {games.map(game => {
        const status = statusLabel(game.library_status)
        return (
          <PanelRow
            key={game.id}
            accessibilityRole="link"
            accessibilityLabel={game.name}
            onPress={() => onOpen(gameHref(game.slug))}
          >
            <Text style={screenStyles.body}>{game.name}</Text>
            {status ? <Text style={screenStyles.detail}>{status}</Text> : null}
          </PanelRow>
        )
      })}
    </ScreenScroll>
  )
}
