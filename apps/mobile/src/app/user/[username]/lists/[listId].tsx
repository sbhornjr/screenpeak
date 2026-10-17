import { useLocalSearchParams } from 'expo-router'

import { api } from '@/lib/api'
import { back, go } from '@/lib/go'
import { useRemote } from '@/lib/use-remote'

import { ListDetailScreen } from '@/components/list-detail-screen'
import { ScreenMessage } from '@/components/screen-state'

export default function ListDetailRoute() {
  const params = useLocalSearchParams<{ username: string, listId: string }>()
  const username = typeof params.username === 'string' ? params.username : ''
  const listId = typeof params.listId === 'string' ? params.listId : ''
  const remote = useRemote(
    ['list', username, listId],
    () => api.users.list(username, listId),
    username.length > 0 && listId.length > 0,
  )
  if (!username || !listId) return <ScreenMessage title="Missing list" body="This link does not include a list." />
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
    <ListDetailScreen
      name={data.list.name}
      description={data.list.description}
      games={data.games.map(game => ({ slug: game.slug, name: game.name }))}
      onOpen={go}
      onBack={back}
    />
  )
}
