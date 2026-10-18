import { useLocalSearchParams } from 'expo-router'

import { api } from '@/lib/api'
import { back, go } from '@/lib/go'
import { useRemote } from '@/lib/use-remote'

import { ListsScreen } from '@/components/lists-screen'
import { ScreenMessage } from '@/components/screen-state'

export default function UserListsRoute() {
  const params = useLocalSearchParams<{ username: string }>()
  const username = typeof params.username === 'string' ? params.username : ''
  const remote = useRemote(['lists', username], () => api.users.lists(username), username.length > 0)
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
  return <ListsScreen username={username} lists={remote.query.data.lists} onOpen={go} onBack={back} />
}
