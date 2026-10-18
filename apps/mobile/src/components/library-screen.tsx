import type { LibraryGameCard } from '@screenpeak/shared/api/library'
import { Pressable, Text } from 'react-native'

import { gameHref } from '@/lib/routes'

import { ScreenScroll, screenStyles, SignupButtons } from './screen-scroll'

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
        <Text style={screenStyles.muted}>Sign up to see your library.</Text>
        <SignupButtons onOpen={onOpen} />
      </ScreenScroll>
    )
  }
  return (
    <ScreenScroll title="Library" onBack={onBack}>
      {games.length === 0 ? <Text style={screenStyles.muted}>Nothing in this library yet.</Text> : null}
      {games.map(game => {
        const status = statusLabel(game.library_status)
        return (
          <Pressable
            key={game.id}
            accessibilityRole="link"
            accessibilityLabel={game.name}
            onPress={() => onOpen(gameHref(game.slug))}
            style={screenStyles.rowButton}
          >
            <Text style={screenStyles.rowText}>{game.name}</Text>
            {status ? <Text style={screenStyles.detail}>{status}</Text> : null}
          </Pressable>
        )
      })}
    </ScreenScroll>
  )
}
