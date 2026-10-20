import { useLocalSearchParams } from 'expo-router'

import { back } from '@/lib/go'

import { EmptyState } from '@/components/empty-state'
import { ScreenScroll } from '@/components/screen-scroll'
import { ScreenMessage } from '@/components/screen-state'

/** The full ratings list is a later screen. The profile keeps the recent reviews. */
export default function RatingsRoute() {
  const params = useLocalSearchParams<{ username: string }>()
  const username = typeof params.username === 'string' ? params.username : ''
  if (!username) return <ScreenMessage title="Missing player" body="This link does not include a player." />
  return (
    <ScreenScroll title="Ratings" onBack={back}>
      <EmptyState
        dense
        title="The full ratings page is not on this screen yet."
        description={`${username}'s recent reviews stay on the profile.`}
      />
    </ScreenScroll>
  )
}
