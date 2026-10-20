import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { actionFailure } from '@/lib/game-page'
import { back, go } from '@/lib/go'
import { loadProfileHub, withFollowing, type ProfileHubModel } from '@/lib/profile-hub'
import { useRemote } from '@/lib/use-remote'

import { ProfileHub, ProfileHubSkeleton } from './profile-hub'
import { ScreenMessage } from './screen-state'

export function ProfileHubScreen({ username, showBack }: { username: string, showBack?: boolean }) {
  const { session } = useAuth()
  const viewerId = session?.user.id ?? ''
  return <ProfileFollowSession key={`${username}:${viewerId}`} username={username} showBack={showBack} />
}

function ProfileFollowSession({ username, showBack }: { username: string, showBack?: boolean }) {
  const queryClient = useQueryClient()
  const remote = useRemote(['profile', username], () => loadProfileHub(api, username), username.length > 0)
  const [followNote, setFollowNote] = useState<string | null>(null)
  const [followBusy, setFollowBusy] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const pending = useRef(false)
  const alive = useRef(true)
  const viewerId = remote.session?.user.id ?? null
  const profileKey = ['profile', username, viewerId] as const

  useEffect(() => () => { alive.current = false }, [])

  async function changeFollow(following: boolean) {
    const current = remote.query.data
    if (!current || current.following == null || pending.current) return
    pending.current = true
    setFollowBusy(true)
    setFollowNote(null)
    await queryClient.cancelQueries({ queryKey: profileKey })
    const previous = queryClient.getQueryData<ProfileHubModel>(profileKey)
    queryClient.setQueryData<ProfileHubModel>(profileKey, (row) =>
      row ? withFollowing(row, following) : row)
    try {
      if (following) await api.users.follow(current.userId)
      else await api.users.unfollow(current.userId)
      if (!alive.current) return
      await queryClient.invalidateQueries({ queryKey: ['profile'] })
    } catch (error) {
      if (!alive.current) return
      queryClient.setQueryData(profileKey, previous)
      setFollowNote(actionFailure(error))
    } finally {
      if (!alive.current) return
      pending.current = false
      setFollowBusy(false)
    }
  }

  async function refresh() {
    setRefreshing(true)
    try {
      await remote.query.refetch()
    } finally {
      setRefreshing(false)
    }
  }

  if (remote.gate?.title === 'API URL missing') {
    return <ScreenMessage title={remote.gate.title} body={remote.gate.body} />
  }
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
      onFollow={model.following == null ? undefined : () => { void changeFollow(true) }}
      onUnfollow={model.following == null ? undefined : () => { void changeFollow(false) }}
      followBusy={followBusy}
      followNote={followNote}
      refreshing={refreshing}
      onRefresh={() => { void refresh() }}
    />
  )
}
