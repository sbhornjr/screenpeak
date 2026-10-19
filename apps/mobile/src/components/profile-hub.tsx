import { Text, View } from 'react-native'

import type { ProfileHubModel } from '@/lib/profile-hub'
import { space } from '@/theme'

import { Avatar } from './avatar'
import { ScreenScroll, screenStyles, PanelRow } from './screen-scroll'

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
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[4] }}>
        <Avatar alt={model.username} src={model.avatarUrl} size="lg" />
        <Text style={screenStyles.muted}>{model.followerCount} followers · {model.followingCount} following</Text>
      </View>
      {model.bio ? <Text style={screenStyles.body}>{model.bio}</Text> : null}
      {model.loadoutHref ? (
        <PanelRow accessibilityRole="button" accessibilityLabel="Loadout" onPress={() => { if (model.loadoutHref) onOpen(model.loadoutHref) }}>
          <Text style={screenStyles.body}>Loadout</Text>
        </PanelRow>
      ) : null}
      <PanelRow accessibilityRole="button" accessibilityLabel="Lists" onPress={() => onOpen(model.listsHref)}>
        <Text style={screenStyles.body}>Lists</Text>
      </PanelRow>
      {model.library && library ? (
        <PanelRow accessibilityRole="button" accessibilityLabel={library.label} onPress={() => { if (model.library) onOpen(model.library.href) }}>
          <Text style={screenStyles.body}>{library.text}</Text>
        </PanelRow>
      ) : null}
    </ScreenScroll>
  )
}
