import type { ListCard } from '@screenpeak/shared/api/lists'
import { Pressable, Text } from 'react-native'

import { listHref } from '@/lib/routes'

import { ScreenScroll, screenStyles } from './screen-scroll'

export function ListsScreen({
  username,
  lists,
  onOpen,
  onBack,
}: {
  username: string
  lists: Pick<ListCard, 'id' | 'name' | 'game_count'>[]
  onOpen: (href: string) => void
  onBack?: () => void
}) {
  return (
    <ScreenScroll title="Lists" onBack={onBack}>
      {lists.length === 0 ? <Text style={screenStyles.muted}>No lists yet.</Text> : null}
      {lists.map(list => (
        <Pressable key={list.id} accessibilityRole="link" accessibilityLabel={list.name} onPress={() => onOpen(listHref(username, list.id))} style={screenStyles.rowButton}>
          <Text style={screenStyles.rowText}>{list.name}</Text>
          <Text style={screenStyles.detail}>{list.game_count} games</Text>
        </Pressable>
      ))}
    </ScreenScroll>
  )
}
