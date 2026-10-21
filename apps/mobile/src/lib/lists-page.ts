import type { GameCardData, GamePageData } from '@screenpeak/shared/api/games'
import type { ListCard, ListPageData, ListsPageData, ListsTab } from '@screenpeak/shared/api/lists'
import type { GameSearchHit } from '@screenpeak/shared/api/search'
import type { ListGameSync, ListWrite } from '@screenpeak/shared/api/writes'
import type { QueryClient } from '@tanstack/react-query'

import { parseDbTimestamp, withListMembership } from '@/lib/game-page'

/** The game page invalidates `['lists']`. Detail uses that prefix so it reloads too. */
export function listsQueryKey(username: string, tab: ListsTab, viewerId: string | null) {
  return ['lists', username, tab, viewerId] as const
}

export function listDetailQueryKey(username: string, listId: string, viewerId: string | null) {
  return ['lists', username, 'detail', listId, viewerId] as const
}

/** Keep the previous page while the next one loads, and only for this viewer. */
export function sameViewerPlaceholder<T>(
  previous: T | undefined,
  previousQuery: { queryKey: readonly unknown[] } | undefined,
  viewerId: string | null,
): T | undefined {
  if (previousQuery?.queryKey.at(-1) !== viewerId) return undefined
  return previous
}

export function listsHeading(owner: boolean, username: string): string {
  return owner ? 'Your Lists' : `${username}'s Lists`
}

export function listShowChoices(owner: boolean, username: string): { tab: ListsTab, label: string }[] {
  return [
    { tab: 'user', label: owner ? 'My lists' : `${username}'s lists` },
    { tab: 'liked', label: 'Liked lists' },
  ]
}

export function updatedLabel(value: string): string {
  if (!value) return ''
  const date = parseDbTimestamp(value)
  if (!Number.isFinite(date.getTime())) return ''
  return `Updated ${date.getUTCMonth() + 1}/${date.getUTCDate()}/${date.getUTCFullYear()}`
}

export function gamesLabel(count: number): string {
  return count === 1 ? '1 game' : `${count} games`
}

export function likeLabel(liked: boolean, count: number): string {
  if (liked) return count > 0 ? `Liked · ${count}` : 'Liked'
  return count > 0 ? `Like · ${count}` : 'Like'
}

export function withNewList(page: ListsPageData, id: string, fields: ListWrite): ListsPageData {
  if (page.lists.some(list => list.id === id)) return page
  const card: ListCard = {
    id,
    name: fields.name.trim(),
    description: fields.description,
    is_public: fields.isPublic,
    is_pinned: fields.isPinned,
    is_default: false,
    last_activity: '',
    game_count: 0,
    owner_username: page.profile.username,
    owner_id: page.profile.id,
    covers: [],
    like_count: 0,
    viewer_has_liked: false,
  }
  return { ...page, lists: [card, ...page.lists] }
}

export function withListEdits(page: ListsPageData, listId: string, fields: ListWrite): ListsPageData {
  return {
    ...page,
    lists: page.lists.map(list => list.id === listId ? {
      ...list,
      name: fields.name.trim(),
      description: fields.description,
      is_public: fields.isPublic,
      is_pinned: fields.isPinned,
    } : list),
  }
}

export function withDetailEdits(page: ListPageData, fields: ListWrite): ListPageData {
  return {
    ...page,
    list: {
      ...page.list,
      name: fields.name.trim(),
      description: fields.description,
      is_public: fields.isPublic,
      is_pinned: fields.isPinned,
    },
  }
}

export function withListLike(page: ListsPageData, listId: string, liked: boolean): ListsPageData {
  return {
    ...page,
    lists: page.lists.map(list => {
      if (list.id !== listId) return list
      const delta = liked === list.viewer_has_liked ? 0 : liked ? 1 : -1
      return { ...list, viewer_has_liked: liked, like_count: Math.max(0, list.like_count + delta) }
    }),
  }
}

export function withDetailLike(page: ListPageData, liked: boolean): ListPageData {
  const current = page.viewer?.has_liked ?? false
  const delta = liked === current ? 0 : liked ? 1 : -1
  return {
    ...page,
    like_count: Math.max(0, page.like_count + delta),
    viewer: page.viewer ? { ...page.viewer, has_liked: liked } : page.viewer,
  }
}

export function withListPin(page: ListsPageData, listId: string, pinned: boolean): ListsPageData {
  return {
    ...page,
    lists: page.lists.map(list => list.id === listId ? { ...list, is_pinned: pinned } : list),
  }
}

export function withDetailPin(page: ListPageData, pinned: boolean): ListPageData {
  return { ...page, list: { ...page.list, is_pinned: pinned } }
}

export function withoutList(page: ListsPageData, listId: string): ListsPageData {
  return { ...page, lists: page.lists.filter(list => list.id !== listId) }
}

export function withoutListGame(page: ListPageData, gameId: string): ListPageData {
  const games = page.games.filter(game => game.id !== gameId)
  return { ...page, games, list: { ...page.list, game_count: games.length } }
}

export function cardFromHit(hit: GameSearchHit): GameCardData {
  return {
    id: hit.id,
    name: hit.name,
    slug: hit.slug,
    cover_image_url: hit.cover_image_url,
    released: hit.released,
    developer: null,
    avg_rating: hit.avg_rating,
    user_rating: null,
  }
}

export function withSyncedGames(page: ListPageData, sync: ListGameSync, added: GameSearchHit[]): ListPageData {
  const remove = new Set(sync.toRemove.map(game => game.id))
  const games = page.games.filter(game => !remove.has(game.id))
  const have = new Set(games.map(game => game.id))
  for (const hit of added) {
    if (have.has(hit.id)) continue
    games.push(cardFromHit(hit))
    have.add(hit.id)
  }
  return { ...page, games, list: { ...page.list, game_count: games.length } }
}

export function withoutViewerList(data: GamePageData, listId: string): GamePageData {
  if (!data.viewer) return data
  return {
    ...data,
    viewer: {
      ...data.viewer,
      lists: data.viewer.lists.filter(list => list.id !== listId),
      listIdsGameIsIn: data.viewer.listIdsGameIsIn.filter(id => id !== listId),
    },
  }
}

export function withViewerListOption(data: GamePageData, option: { id: string, name: string, game_count: number }): GamePageData {
  if (!data.viewer || data.viewer.lists.some(list => list.id === option.id)) return data
  return { ...data, viewer: { ...data.viewer, lists: [...data.viewer.lists, option] } }
}

/**
 * Patch game pages for this viewer only. A review query is longer than three
 * parts, and another viewer's key ends with their id, so both stay put.
 * Returns a restore for a failed write.
 */
export function patchViewerGames(
  client: QueryClient,
  viewerId: string | null,
  update: (data: GamePageData) => GamePageData,
): () => void {
  if (!viewerId) return () => undefined
  const snapshots: { key: readonly unknown[], data: unknown }[] = []
  for (const cached of client.getQueryCache().findAll({ queryKey: ['game'] })) {
    if (cached.queryKey.length !== 3 || cached.queryKey[2] !== viewerId) continue
    snapshots.push({ key: cached.queryKey, data: cached.state.data })
    const data = cached.state.data as GamePageData | undefined
    if (data) client.setQueryData(cached.queryKey, update(data))
  }
  return () => {
    for (const shot of snapshots) client.setQueryData(shot.key, shot.data)
  }
}

export function membershipPatch(listId: string, gameId: string, listed: boolean) {
  return (data: GamePageData) => data.game.id === gameId ? withListMembership(data, listId, listed) : data
}
