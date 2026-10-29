import type { GamePageData } from '@screenpeak/shared/api/games'
import { useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query'
import { useRef } from 'react'

import { actionFailure } from './failure'
import { isGamePageKey, scopes } from './query-keys'

type WriteGate<T> = { count: number, server: T | undefined, latest: T | undefined, ok: boolean }

/** A cache write: returns null on success, or the sentence to show. */
export type CachedCommit<T> = (
  request: () => Promise<unknown>,
  optimistic?: (data: T) => T,
  touchGames?: (data: GamePageData) => GamePageData,
) => Promise<string | null>

/**
 * Optimistic writes on one cache key.
 *
 * The server copy is taken before the first of any overlapping writes. A failure
 * puts it back, unless a refetch replaced the optimistic data while the request
 * ran (that newer page wins). When the last overlapping write succeeds, the
 * `invalidate` scopes refetch and the commit resolves after that refetch, so a
 * Saving… button stays until the server page is back. `background` resolves
 * first instead, for a caller that must not wait on a slow reload.
 */
export function useCachedWrite<T>(
  key: QueryKey,
  options: { viewerId: string | null, invalidate: readonly QueryKey[], background?: boolean },
): CachedCommit<T> {
  const queryClient = useQueryClient()
  const writes = useRef(new Map<string, WriteGate<T>>())

  return async function commit(request, optimistic, touchGames) {
    const id = JSON.stringify(key)
    let gate = writes.current.get(id)
    if (!gate) {
      const server = queryClient.getQueryData<T>(key)
      gate = { count: 0, server, latest: server, ok: false }
      writes.current.set(id, gate)
    }
    gate.count += 1
    let restoreGames: (() => void) | null = null
    try {
      await queryClient.cancelQueries({ queryKey: key, exact: true })
      const current = queryClient.getQueryData<T>(key)
      if (current !== undefined && optimistic) gate.latest = queryClient.setQueryData<T>(key, optimistic(current))
      if (touchGames) restoreGames = await patchViewerGames(queryClient, options.viewerId, touchGames)
      await request()
      gate.ok = true
      return null
    } catch (error) {
      const untouched = queryClient.getQueryData<T>(key) === gate.latest
      if (gate.server !== undefined && untouched) queryClient.setQueryData(key, gate.server)
      restoreGames?.()
      return actionFailure(error)
    } finally {
      gate.count -= 1
      if (gate.count === 0) {
        writes.current.delete(id)
        if (gate.ok) {
          const refetch = Promise.all(options.invalidate.map(queryKey => queryClient.invalidateQueries({ queryKey })))
          if (options.background) void refetch
          else await refetch
        }
      }
    }
  }
}

/**
 * Patch this viewer's cached game pages. Reviews and other viewers' pages stay put.
 * Returns a restore for a failed write.
 */
export async function patchViewerGames(
  client: QueryClient,
  viewerId: string | null,
  update: (data: GamePageData) => GamePageData,
): Promise<() => void> {
  if (!viewerId) return () => undefined
  const keys = client.getQueryCache().findAll({ queryKey: scopes.game })
    .map(cached => cached.queryKey)
    .filter(queryKey => isGamePageKey(queryKey, viewerId))
  await Promise.all(keys.map(queryKey => client.cancelQueries({ queryKey, exact: true })))
  const snapshots: { key: QueryKey, data: GamePageData | undefined }[] = []
  for (const queryKey of keys) {
    const data = client.getQueryData<GamePageData>(queryKey)
    snapshots.push({ key: queryKey, data })
    if (data) client.setQueryData(queryKey, update(data))
  }
  return () => {
    for (const shot of snapshots) client.setQueryData(shot.key, shot.data)
  }
}
