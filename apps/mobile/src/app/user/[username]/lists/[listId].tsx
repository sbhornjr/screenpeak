import { useLocalSearchParams } from 'expo-router'

import { ListDetail } from '@/components/lists-browser'
import { ScreenMessage } from '@/components/screen-state'

export default function ListDetailRoute() {
  const params = useLocalSearchParams<{ username: string, listId: string }>()
  const username = typeof params.username === 'string' ? params.username : ''
  const listId = typeof params.listId === 'string' ? params.listId : ''
  if (!username || !listId) return <ScreenMessage title="Missing list" body="This link does not include a list." />
  return <ListDetail username={username} listId={listId} />
}
