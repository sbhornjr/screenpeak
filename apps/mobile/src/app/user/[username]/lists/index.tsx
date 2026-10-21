import { useLocalSearchParams } from 'expo-router'

import { UserLists } from '@/components/lists-browser'
import { ScreenMessage } from '@/components/screen-state'

export default function UserListsRoute() {
  const params = useLocalSearchParams<{ username: string }>()
  const username = typeof params.username === 'string' ? params.username : ''
  if (!username) return <ScreenMessage title="Missing player" body="This link does not include a player." />
  return <UserLists username={username} />
}
