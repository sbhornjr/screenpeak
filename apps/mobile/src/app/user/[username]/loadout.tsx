import type { LoadoutPageData } from '@screenpeak/shared/api/loadout'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams } from 'expo-router'

import { api, apiConfigured } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useCachedWrite } from '@/lib/cached-write'
import { actionFailure } from '@/lib/failure'
import { back, go } from '@/lib/go'
import { withReadout } from '@/lib/loadout-page'
import { queryKeys, scopes } from '@/lib/query-keys'
import { useRefresh } from '@/lib/use-refresh'

import { LoadoutScreen, LoadoutSkeleton } from '@/components/loadout-screen'
import { RemoteGate, ScreenMessage, screenGate } from '@/components/screen-state'

// The profile shows the saved bio copy of the Read-out.
const PROFILE_SCOPES = [scopes.profile]

export default function LoadoutRoute() {
  const params = useLocalSearchParams<{ username: string }>()
  const username = typeof params.username === 'string' ? params.username : ''
  const queryClient = useQueryClient()
  const { ready, session } = useAuth()
  const configured = apiConfigured()
  const viewerId = session?.user.id ?? null
  const key = queryKeys.loadout(username, viewerId)
  const loadout = useQuery({
    queryKey: key,
    queryFn: () => api.users.loadout(username),
    enabled: username.length > 0 && ready && configured,
  })
  const commit = useCachedWrite<LoadoutPageData>(key, { viewerId, invalidate: PROFILE_SCOPES })
  const { refreshing, refresh } = useRefresh(loadout.refetch)

  if (!username) return <ScreenMessage title="Missing player" body="This link does not include a player." />
  const data = loadout.data
  if (!data) {
    const gate = screenGate({ ready, configured, loading: loadout.isLoading, error: loadout.error })
    if (gate && gate.title !== 'Loading') return <RemoteGate gate={gate} onRetry={() => { void loadout.refetch() }} />
    return <LoadoutSkeleton onBack={back} />
  }

  const owner = data.viewer?.is_owner ?? false
  return (
    <LoadoutScreen
      data={data}
      onOpen={go}
      onBack={back}
      onGenerate={owner ? async () => {
        try {
          const { identity } = await api.me.generateLoadout()
          queryClient.setQueryData<LoadoutPageData>(key, current => current ? withReadout(current, identity) : current)
          void queryClient.invalidateQueries({ queryKey: scopes.profile })
          return null
        } catch (error) {
          return actionFailure(error)
        }
      } : undefined}
      onSaveBio={owner ? async () => {
        try {
          await api.me.patch({ loadoutBio: data.identity })
          void queryClient.invalidateQueries({ queryKey: scopes.profile })
          return null
        } catch (error) {
          return actionFailure(error)
        }
      } : undefined}
      onClear={owner ? () => commit(() => api.me.clearLoadout(), current => withReadout(current, '')) : undefined}
      refreshing={refreshing}
      onRefresh={refresh}
      refreshError={loadout.isRefetchError ? actionFailure(loadout.error) : null}
      onRetry={() => { void loadout.refetch() }}
    />
  )
}
