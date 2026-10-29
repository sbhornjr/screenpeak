import { useQuery, type QueryKey } from '@tanstack/react-query'

import { apiConfigured } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { screenGate } from '@/components/screen-state'

/**
 * `key` gets the viewer id, so every key is built by `queryKeys` with the viewer last.
 * The cache keeps the API payload; `select` shapes it for this screen.
 */
export function useRemote<T, R = T>(
  key: (viewer: string | null) => QueryKey,
  queryFn: () => Promise<T>,
  enabled = true,
  select?: (data: T) => R,
) {
  const { ready, session } = useAuth()
  const configured = apiConfigured()
  const query = useQuery({
    queryKey: key(session?.user.id ?? null),
    queryFn,
    select,
    enabled: enabled && ready && configured,
  })
  const gate = screenGate({
    ready,
    configured,
    loading: enabled && query.isLoading,
    error: enabled ? query.error : null,
  })
  return {
    query,
    gate,
    ready,
    configured,
    session,
    signedIn: session != null,
  }
}
