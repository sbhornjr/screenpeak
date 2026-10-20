import { useLocalSearchParams } from 'expo-router'

import { UserLibrary } from '@/components/library-browser'
import { ScreenMessage } from '@/components/screen-state'

export default function UserLibraryRoute() {
  const params = useLocalSearchParams<{ username: string }>()
  const username = typeof params.username === 'string' ? params.username : ''
  if (!username) return <ScreenMessage title="Missing player" body="This link does not include a player." />
  return <UserLibrary username={username} />
}
