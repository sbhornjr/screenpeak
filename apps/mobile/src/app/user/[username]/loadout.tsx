import { useLocalSearchParams } from 'expo-router'

import { api } from '@/lib/api'
import { back } from '@/lib/go'
import { useRemote } from '@/lib/use-remote'

import { LoadoutScreen } from '@/components/loadout-screen'
import { ScreenMessage } from '@/components/screen-state'

export default function LoadoutRoute() {
  const params = useLocalSearchParams<{ username: string }>()
  const username = typeof params.username === 'string' ? params.username : ''
  const remote = useRemote(['loadout', username], () => api.users.loadout(username), username.length > 0)
  if (!username) return <ScreenMessage title="Missing player" body="This link does not include a player." />
  if (remote.gate || !remote.query.data) {
    const gate = remote.gate ?? { title: 'Loading', body: '', retry: false }
    return (
      <ScreenMessage
        title={gate.title}
        body={gate.body}
        onRetry={gate.retry ? () => { void remote.query.refetch() } : undefined}
      />
    )
  }
  const data = remote.query.data
  return (
    <LoadoutScreen
      username={data.username}
      identity={data.identity}
      ratingCount={data.rating_count}
      avgRating={data.avg_rating}
      genres={data.genres}
      onBack={back}
    />
  )
}
