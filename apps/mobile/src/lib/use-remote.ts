import { useInfiniteQuery, useQuery, type QueryKey } from '@tanstack/react-query'

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

/**
 * `useRemote` for a list the API pages by `offset`, starting at 0. Only a failed
 * first page gates the screen; after that a failed refresh or next page keeps
 * what loaded.
 */
export function useRemotePages<T>(
  key: (viewer: string | null) => QueryKey,
  queryFn: (offset: number) => Promise<T>,
  nextOffset: (last: T, pages: T[]) => number | undefined,
  enabled = true,
) {
  const { ready, session } = useAuth()
  const configured = apiConfigured()
  const query = useInfiniteQuery({
    queryKey: key(session?.user.id ?? null),
    queryFn: ({ pageParam }) => queryFn(pageParam),
    initialPageParam: 0,
    getNextPageParam: nextOffset,
    enabled: enabled && ready && configured,
  })
  const gate = screenGate({
    ready,
    configured,
    loading: enabled && query.isLoading,
    error: enabled && !query.data ? query.error : null,
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
