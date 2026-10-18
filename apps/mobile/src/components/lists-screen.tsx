import type { ListCard } from '@screenpeak/shared/api/lists'
import { Text } from 'react-native'

import { listHref } from '@/lib/routes'

import { EmptyState } from './empty-state'
import { ScreenScroll, screenStyles, PanelRow } from './screen-scroll'

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
      {lists.length === 0 ? <EmptyState dense title="No lists yet." /> : null}
      {lists.map(list => (
        <PanelRow key={list.id} accessibilityRole="link" accessibilityLabel={list.name} onPress={() => onOpen(listHref(username, list.id))}>
          <Text style={screenStyles.body}>{list.name}</Text>
          <Text style={screenStyles.detail}>{list.game_count} games</Text>
        </PanelRow>
      ))}
    </ScreenScroll>
  )
}
