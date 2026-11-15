// Explore's search box: games, lists, or players. Each type is its own query,
// keyed by type, text, and viewer, so a late answer to an earlier type or text
// lands in that key's cache entry and is never drawn under the current one.
import type { GameSearchHit, ListSearchHit, UserSearchHit } from '@screenpeak/shared/api/search'

import { api } from '@/lib/api'
import { actionFailure } from '@/lib/failure'
import { queryKeys } from '@/lib/query-keys'
import { useRemote } from '@/lib/use-remote'

export const SEARCH_TYPES = ['games', 'lists', 'users'] as const
export type SearchType = (typeof SEARCH_TYPES)[number]

/** Hits tagged with the type they answer, so a screen can't draw one type's hits under another. */
export type SearchResults =
  | { type: 'games', hits: GameSearchHit[] }
  | { type: 'lists', hits: ListSearchHit[] }
  | { type: 'users', hits: UserSearchHit[] }

/** `?type=` from a deep link such as the empty feed's `/explore?type=users`. */
export function searchTypeParam(value: unknown): SearchType | null {
  const first = Array.isArray(value) ? value[0] : value
  return SEARCH_TYPES.find(type => type === first) ?? null
}

/** `query` null or empty runs nothing. Only the current type's query runs. */
export function useExploreSearch(type: SearchType, query: string | null) {
  const q = query ?? ''
  const on = q !== ''
  const games = useRemote(viewer => queryKeys.gameSearch(q, viewer), () => api.games.search(q), on && type === 'games')
  const lists = useRemote(viewer => queryKeys.listSearch(q, viewer), () => api.lists.search(q), on && type === 'lists')
  const users = useRemote(viewer => queryKeys.userSearch(q, viewer), () => api.users.search(q), on && type === 'users')

  const current = type === 'games' ? games.query : type === 'lists' ? lists.query : users.query
  let results: SearchResults | null = null
  if (on) {
    if (type === 'games' && games.query.data) results = { type, hits: games.query.data.games }
    if (type === 'lists' && lists.query.data) results = { type, hits: lists.query.data.lists }
    if (type === 'users' && users.query.data) results = { type, hits: users.query.data.users }
  }
  return {
    results,
    searching: on && current.isLoading,
    error: on && current.error ? actionFailure(current.error) : null,
  }
}
