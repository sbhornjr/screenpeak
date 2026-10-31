import { useInfiniteQuery, useQuery, type InfiniteData, type QueryKey } from '@tanstack/react-query'

import { apiConfigured } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { screenGate } from '@/components/screen-state'

type Placeholder<T> = (viewer: string | null) => (
  previous: T | undefined,
  previousQuery: { queryKey: QueryKey } | undefined,
) => T | undefined

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
 * `useRemote` for a list the API pages by a number: an offset from 0 (the feed)
 * or a page from 1 (the catalogue). Only a failed first page gates the screen;
 * after that a failed refresh or next page keeps what loaded. `placeholderData`
 * keeps an earlier query's pages on screen while a new one loads.
 */
export function useRemotePages<T>(
  key: (viewer: string | null) => QueryKey,
  queryFn: (pageParam: number) => Promise<T>,
  nextPageParam: (last: T, pages: T[]) => number | undefined,
  options: {
    enabled?: boolean
    firstPageParam?: number
    placeholderData?: Placeholder<InfiniteData<T, number>>
  } = {},
) {
  const { enabled = true, firstPageParam = 0, placeholderData } = options
  const { ready, session } = useAuth()
  const configured = apiConfigured()
  const viewer = session?.user.id ?? null
  const query = useInfiniteQuery({
    queryKey: key(viewer),
    queryFn: ({ pageParam }) => queryFn(pageParam),
    initialPageParam: firstPageParam,
    getNextPageParam: nextPageParam,
    placeholderData: placeholderData?.(viewer),
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
