import { api } from '@/lib/api'
import { back, go } from '@/lib/go'
import { loadProfileHub } from '@/lib/profile-hub'
import { useRemote } from '@/lib/use-remote'

import { ProfileHub } from './profile-hub'
import { ScreenMessage } from './screen-state'

export function ProfileHubScreen({ username, showBack }: { username: string, showBack?: boolean }) {
  const remote = useRemote(['profile', username], () => loadProfileHub(api, username), username.length > 0)
  if (remote.gate) {
    return (
      <ScreenMessage
        title={remote.gate.title}
        body={remote.gate.body}
        onRetry={remote.gate.retry ? () => { void remote.query.refetch() } : undefined}
      />
    )
  }
  if (!remote.query.data) return <ScreenMessage title="Loading" />
  return <ProfileHub model={remote.query.data} onOpen={go} onBack={showBack ? back : undefined} />
}
