import type { ExploreRange } from '@screenpeak/shared/api/explore'
import type { LibraryQuery } from '@screenpeak/shared/api/library'
import type { ListsTab } from '@screenpeak/shared/api/lists'
import type { QueryClient, QueryKey } from '@tanstack/react-query'

import type { ReviewListQuery } from './game-page'

// Every query key the app uses. Each one ends with the viewer id, so a cache
// entry never serves another account. Writes invalidate by `scopes`, a prefix.
// The readers below are the only code that looks inside a key.

type Viewer = string | null

export type CatalogueFilter = {
  genre?: string
  platform?: string
  developer?: string
  publisher?: string
  esrb?: string
}

export const scopes = {
  game: ['game'],
  library: ['library'],
  lists: ['lists'],
  profile: ['profile'],
} as const

export const queryKeys = {
  feed: (viewer: Viewer) => ['feed', viewer] as const,
  me: (viewer: Viewer) => ['me', viewer] as const,
  explore: (range: ExploreRange, viewer: Viewer) => ['explore', range, viewer] as const,
  gameSearch: (query: string, viewer: Viewer) => ['game-search', query, viewer] as const,
  catalogue: (filter: CatalogueFilter, page: number, viewer: Viewer) => [
    'catalogue',
    filter.genre ?? '',
    filter.platform ?? '',
    filter.developer ?? '',
    filter.publisher ?? '',
    filter.esrb ?? '',
    page,
    viewer,
  ] as const,
  profile: (username: string, viewer: Viewer) => ['profile', username, viewer] as const,
  loadout: (username: string, viewer: Viewer) => ['loadout', username, viewer] as const,
  /** The game page. Exactly three parts: `isGamePageKey` relies on it. */
  game: (slug: string, viewer: Viewer) => ['game', slug, viewer] as const,
  gameReviews: (slug: string, query: ReviewListQuery, viewer: Viewer) =>
    ['game', slug, 'reviews', viewer, query.page, query.sort, query.order] as const,
  library: (username: string, query: LibraryQuery, viewer: Viewer) => [
    'library',
    username,
    query.status,
    query.is100 ? '100' : '',
    query.sort,
    query.order,
    query.q ?? '',
    query.genre ?? '',
    query.platform ?? '',
    query.developer ?? '',
    query.publisher ?? '',
    query.esrb ?? '',
    viewer,
  ] as const,
  /** Lists keys share the `lists` scope, so the game page's invalidation reloads them. */
  lists: (username: string, tab: ListsTab, viewer: Viewer) => ['lists', username, tab, viewer] as const,
  listDetail: (username: string, listId: string, viewer: Viewer) =>
    ['lists', username, 'detail', listId, viewer] as const,
}

/** Every cached page for one game: the page itself and its reviews. */
export const gameScope = (slug: string) => ['game', slug] as const

/** The prefix one player's library or lists share. `keepSameScope` and `latestCached` match on it. */
export const playerScope = (scope: 'library' | 'lists', username: string) => [scope, username] as const

export const listDetailScope = (username: string, listId: string) =>
  ['lists', username, 'detail', listId] as const

function startsWith(key: QueryKey, prefix: QueryKey): boolean {
  return prefix.every((part, index) => key[index] === part)
}

function viewerOf(key: QueryKey): unknown {
  return key.at(-1)
}

/** A cached game page (not its reviews) for this viewer. */
export function isGamePageKey(key: QueryKey, viewer: Viewer): boolean {
  return key.length === 3 && key[0] === 'game' && viewerOf(key) === viewer
}

export function isListDetailKey(key: QueryKey): boolean {
  return key[0] === 'lists' && key[2] === 'detail'
}

/**
 * `placeholderData` that keeps the previous page while the next one loads, but
 * only when it belongs to the same viewer and the same scope (one player, one list).
 */
export function keepSameScope(scope: QueryKey, viewer: Viewer) {
  return <T>(previous: T | undefined, previousQuery: { queryKey: QueryKey } | undefined): T | undefined => {
    const key = previousQuery?.queryKey
    if (!key || viewerOf(key) !== viewer || !startsWith(key, scope)) return undefined
    return previous
  }
}

/** The newest successful page in a scope for this viewer. A failed refetch shows it under the error. */
export function latestCached<T>(
  client: QueryClient,
  scope: QueryKey,
  viewer: Viewer,
  skip: (key: QueryKey) => boolean = () => false,
): T | undefined {
  let latest: T | undefined
  let updatedAt = -1
  for (const cached of client.getQueryCache().findAll({ queryKey: scope })) {
    if (viewerOf(cached.queryKey) !== viewer || skip(cached.queryKey)) continue
    if (cached.state.status !== 'success' || cached.state.dataUpdatedAt < updatedAt) continue
    updatedAt = cached.state.dataUpdatedAt
    latest = cached.state.data as T
  }
  return latest
}
