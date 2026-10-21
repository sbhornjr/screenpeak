import type { GameCardData, GamePageData } from '@screenpeak/shared/api/games'
import type { ListCard, ListPageData, ListsPageData, ListsTab } from '@screenpeak/shared/api/lists'
import type { GameSearchHit } from '@screenpeak/shared/api/search'
import type { ListGameSync, ListWrite } from '@screenpeak/shared/api/writes'
import type { QueryClient } from '@tanstack/react-query'

import { withListMembership } from '@/lib/game-page'
import { calendarLabel } from '@/lib/profile-hub'

/** The game page invalidates `['lists']`. Detail uses that prefix so it reloads too. */
export function listsQueryKey(username: string, tab: ListsTab, viewerId: string | null) {
  return ['lists', username, tab, viewerId] as const
}

export function listDetailQueryKey(username: string, listId: string, viewerId: string | null) {
  return ['lists', username, 'detail', listId, viewerId] as const
}

/**
 * Keep the previous page while the next one loads, for this viewer, this
 * username, and (on a detail key) this list. A viewer id alone is shared
 * across every profile that player opens.
 */
export function sameViewerPlaceholder<T>(
  previous: T | undefined,
  previousQuery: { queryKey: readonly unknown[] } | undefined,
  viewerId: string | null,
  username: string,
  listId?: string,
): T | undefined {
  const key = previousQuery?.queryKey
  if (!key || key.at(-1) !== viewerId) return undefined
  if (key[1] !== username) return undefined
  if (listId != null && key[3] !== listId) return undefined
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
  const day = calendarLabel(value)
  return day ? `Updated ${day}` : ''
}

export function gamesLabel(count: number): string {
  return count === 1 ? '1 game' : `${count} games`
}

export function likeLabel(liked: boolean, count: number): string {
  if (liked) return count > 0 ? `Liked · ${count}` : 'Liked'
  return count > 0 ? `Like · ${count}` : 'Like'
}

export function likeActionLabel(liked: boolean, name: string, count: number): string {
  const verb = liked ? 'Unlike' : 'Like'
  const likes = count === 1 ? '1 like' : `${count} likes`
  return `${verb} ${name}, ${likes}`
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
  const defaults = page.lists.filter(list => list.is_default)
  const rest = page.lists.filter(list => !list.is_default)
  return { ...page, lists: [...defaults, card, ...rest] }
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
export async function patchViewerGames(
  client: QueryClient,
  viewerId: string | null,
  update: (data: GamePageData) => GamePageData,
): Promise<() => void> {
  if (!viewerId) return () => undefined
  const keys = client.getQueryCache().findAll({ queryKey: ['game'] })
    .map(cached => cached.queryKey)
    .filter(queryKey => queryKey.length === 3 && queryKey[2] === viewerId)
  await Promise.all(keys.map(queryKey => client.cancelQueries({ queryKey, exact: true })))
  const snapshots: { key: readonly unknown[], data: GamePageData | undefined }[] = []
  for (const queryKey of keys) {
    const data = client.getQueryData<GamePageData>(queryKey)
    snapshots.push({ key: queryKey, data })
    if (data) client.setQueryData(queryKey, update(data))
  }
  return () => {
    for (const shot of snapshots) client.setQueryData(shot.key, shot.data)
  }
}

export function membershipPatch(listId: string, gameId: string, listed: boolean) {
  return (data: GamePageData) => data.game.id === gameId ? withListMembership(data, listId, listed) : data
}
