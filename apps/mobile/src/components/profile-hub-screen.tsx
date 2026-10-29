import { useState } from 'react'

import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useCachedWrite } from '@/lib/cached-write'
import { back, go } from '@/lib/go'
import { loadProfileHub, withFollowing, type ProfileHubModel } from '@/lib/profile-hub'
import { queryKeys, scopes } from '@/lib/query-keys'
import { useSingleFlight } from '@/lib/single-flight'
import { useRefresh } from '@/lib/use-refresh'
import { useRemote } from '@/lib/use-remote'

import { ProfileHub, ProfileHubSkeleton } from './profile-hub'
import { API_MISSING, ScreenMessage } from './screen-state'

export function ProfileHubScreen({ username, showBack }: { username: string, showBack?: boolean }) {
  const { session } = useAuth()
  const viewerId = session?.user.id ?? ''
  return <ProfileFollowSession key={`${username}:${viewerId}`} username={username} showBack={showBack} />
}

function ProfileFollowSession({ username, showBack }: { username: string, showBack?: boolean }) {
  const remote = useRemote(viewer => queryKeys.profile(username, viewer), () => loadProfileHub(api, username), username.length > 0)
  const viewerId = remote.session?.user.id ?? null
  const commit = useCachedWrite<ProfileHubModel>(queryKeys.profile(username, viewerId), {
    viewerId,
    invalidate: [scopes.profile],
  })
  const flight = useSingleFlight()
  const { refreshing, refresh } = useRefresh(remote.query.refetch)
  const [followNote, setFollowNote] = useState<string | null>(null)
  const [followBusy, setFollowBusy] = useState(false)

  function changeFollow(following: boolean) {
    const current = remote.query.data
    if (!current || current.following == null) return
    void flight(async () => {
      setFollowBusy(true)
      setFollowNote(null)
      const note = await commit(
        () => following ? api.users.follow(current.userId) : api.users.unfollow(current.userId),
        row => withFollowing(row, following),
      )
      setFollowNote(note)
      setFollowBusy(false)
    })
  }

  if (!remote.configured) return <ScreenMessage {...API_MISSING} />
  if (remote.gate?.retry) {
    return (
      <ScreenMessage
        title={remote.gate.title}
        body={remote.gate.body}
        onRetry={() => { void remote.query.refetch() }}
      />
    )
  }
  if (remote.gate || !remote.query.data) return <ProfileHubSkeleton />
  const model = remote.query.data
  return (
    <ProfileHub
      model={model}
      onOpen={go}
      onBack={showBack ? back : undefined}
      onFollow={model.following == null ? undefined : () => changeFollow(true)}
      onUnfollow={model.following == null ? undefined : () => changeFollow(false)}
      followBusy={followBusy}
      followNote={followNote}
      refreshing={refreshing}
      onRefresh={refresh}
    />
  )
}
