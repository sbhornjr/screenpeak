import type { FeedItem } from '@screenpeak/shared/types'
import { Text } from 'react-native'

import { gameHref, listHref, profileHref } from '@/lib/routes'
import { text } from '@/theme'

import { EmptyState } from './empty-state'
import { PanelRow, ScreenScroll} from './screen-scroll'
import { WelcomeScreen } from './welcome-screen'

export function feedActivityText(item: FeedItem): string {
  const who = item.actor_username
  switch (item.activity_type) {
    case 'library_add':
      return `${who} added ${item.game_name} to their ${item.library_status === 'playing' ? 'currently playing' : item.library_status}`
    case 'review':
      return `${who} reviewed ${item.game_name}`
    case 'rating':
      return `${who} rated ${item.game_name} a ${item.rating}/10`
    case 'list_created':
      return `${who} created the list "${item.list_name}"`
    case 'list_liked':
      return `${who} liked "${item.list_name}" by ${item.list_owner_username}`
    case 'library_add_batch':
      return `${who} added ${item.library_game_count} games to their library`
    default:
      return who
  }
}

function feedHref(item: FeedItem): string {
  if ((item.activity_type === 'list_created' || item.activity_type === 'list_liked') && item.list_id && item.list_owner_username) {
    return listHref(item.list_owner_username, item.list_id)
  }
  if (item.game_slug) return gameHref(item.game_slug)
  return profileHref(item.actor_username)
}

export function FeedScreen({
  signedIn,
  items,
  onOpen,
}: {
  signedIn: boolean
  items: FeedItem[]
  onOpen: (href: string) => void
}) {
  if (!signedIn) return <WelcomeScreen onOpen={onOpen} />
  return (
    <ScreenScroll title="Feed">
      {items.length === 0 ? <EmptyState dense title="Nothing in your feed yet." /> : null}
      {items.map((item, index) => {
        const label = feedActivityText(item)
        return (
          <PanelRow
            key={`${item.activity_type}-${item.actor_id}-${item.created_at}-${index}`}
            accessibilityRole="link"
            accessibilityLabel={label}
            onPress={() => onOpen(feedHref(item))}
          >
            <Text style={text.body}>{label}</Text>
          </PanelRow>
        )
      })}
    </ScreenScroll>
  )
}
