import { Pressable, Text } from 'react-native'

import type { ProfileHubModel } from '@/lib/profile-hub'

import { ScreenScroll, screenStyles } from './screen-scroll'

function libraryCopy(library: NonNullable<ProfileHubModel['library']>): { label: string, text: string } {
  if (library.totalGames == null || library.completed == null) {
    return { label: 'Library', text: 'Library' }
  }
  return {
    label: `Library, ${library.totalGames} games, ${library.completed} completed`,
    text: `${library.totalGames} games · ${library.completed} completed`,
  }
}

/** Loadout, Lists, and the library preview render only when `model` includes them. */
export function ProfileHub({
  model,
  onOpen,
  onBack,
}: {
  model: ProfileHubModel
  onOpen: (href: string) => void
  onBack?: () => void
}) {
  const library = model.library ? libraryCopy(model.library) : null
  return (
    <ScreenScroll title={model.username} onBack={onBack}>
      <Text style={screenStyles.muted}>{model.followerCount} followers · {model.followingCount} following</Text>
      {model.bio ? <Text style={screenStyles.body}>{model.bio}</Text> : null}
      {model.loadoutHref ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Loadout" onPress={() => { if (model.loadoutHref) onOpen(model.loadoutHref) }} style={screenStyles.rowButton}>
          <Text style={screenStyles.rowText}>Loadout</Text>
        </Pressable>
      ) : null}
      <Pressable accessibilityRole="button" accessibilityLabel="Lists" onPress={() => onOpen(model.listsHref)} style={screenStyles.rowButton}>
        <Text style={screenStyles.rowText}>Lists</Text>
      </Pressable>
      {model.library && library ? (
        <Pressable accessibilityRole="button" accessibilityLabel={library.label} onPress={() => { if (model.library) onOpen(model.library.href) }} style={screenStyles.rowButton}>
          <Text style={screenStyles.rowText}>{library.text}</Text>
        </Pressable>
      ) : null}
    </ScreenScroll>
  )
}
