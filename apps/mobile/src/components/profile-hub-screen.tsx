import type { ProfilePageData } from '@screenpeak/shared/api/profile'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useCachedWrite } from '@/lib/cached-write'
import { back, go } from '@/lib/go'
import { profileHubModel, withFollowing } from '@/lib/profile-hub'
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
  const remote = useRemote(
    viewer => queryKeys.profile(username, viewer),
    () => api.users.get(username),
    username.length > 0,
    profileHubModel,
  )
  const viewerId = remote.session?.user.id ?? null
  const commit = useCachedWrite<ProfilePageData>(queryKeys.profile(username, viewerId), {
    viewerId,
    invalidate: [scopes.profile],
  })
  const queryClient = useQueryClient()
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
        page => withFollowing(page, following),
      )
      // The follow changes whose activity the feed shows. Every loaded feed
      // page refetches, so the button does not wait for it.
      if (!note) void queryClient.invalidateQueries({ queryKey: scopes.feed })
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
