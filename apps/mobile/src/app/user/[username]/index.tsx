import { useLocalSearchParams } from 'expo-router'

import { ProfileHubScreen } from '@/components/profile-hub-screen'
import { ScreenMessage } from '@/components/screen-state'

export default function UserProfileRoute() {
  const params = useLocalSearchParams<{ username: string }>()
  const username = typeof params.username === 'string' ? params.username : ''
  if (!username) return <ScreenMessage title="Missing player" body="This link does not include a player." />
  return <ProfileHubScreen username={username} showBack />
}
