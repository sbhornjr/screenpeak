import type { GameCardData, GamePageData } from '@screenpeak/shared/api/games'
import type { ListCard, ListPageData, ListsPageData, ListsTab } from '@screenpeak/shared/api/lists'
import type { GameSearchHit } from '@screenpeak/shared/api/search'
import type { ListGameSync, ListWrite } from '@screenpeak/shared/api/writes'

import { withListMembership } from '@/lib/game-page'

export function listsHeading(owner: boolean, username: string): string {
  return owner ? 'Your Lists' : `${username}'s Lists`
}

export function listShowChoices(owner: boolean, username: string): { tab: ListsTab, label: string }[] {
  return [
    { tab: 'user', label: owner ? 'My lists' : `${username}'s lists` },
    { tab: 'liked', label: 'Liked lists' },
  ]
}

export function gamesLabel(count: number): string {
  return count === 1 ? '1 game' : `${count} games`
}

export function likesCountLabel(count: number): string {
  return count === 1 ? '1 like' : `${count} likes`
}

/** Screen-reader name for the like control. The list name stays on the card link. */
export function likeActionLabel(liked: boolean, count: number): string {
  return `${liked ? 'Unlike' : 'Like'} list, ${likesCountLabel(count)}`
}

/** The card and detail fields a list form writes. */
function formFields(fields: ListWrite) {
  return {
    name: fields.name.trim(),
    description: fields.description,
    is_public: fields.isPublic,
    is_pinned: fields.isPinned,
  }
}

/** The like count after a toggle. Repeating the current state changes nothing. */
function likedCount(count: number, was: boolean, liked: boolean): number {
  if (liked === was) return count
  return Math.max(0, count + (liked ? 1 : -1))
}

export function withNewList(page: ListsPageData, id: string, fields: ListWrite): ListsPageData {
  if (page.lists.some(list => list.id === id)) return page
  const card: ListCard = {
    id,
    ...formFields(fields),
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
    lists: page.lists.map(list => list.id === listId ? { ...list, ...formFields(fields) } : list),
  }
}

export function withDetailEdits(page: ListPageData, fields: ListWrite): ListPageData {
  return { ...page, list: { ...page.list, ...formFields(fields) } }
}

export function withListLike(page: ListsPageData, listId: string, liked: boolean): ListsPageData {
  return {
    ...page,
    lists: page.lists.map(list => list.id === listId
      ? { ...list, viewer_has_liked: liked, like_count: likedCount(list.like_count, list.viewer_has_liked, liked) }
      : list),
  }
}

export function withDetailLike(page: ListPageData, liked: boolean): ListPageData {
  return {
    ...page,
    like_count: likedCount(page.like_count, page.viewer?.has_liked ?? false, liked),
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

export function membershipPatch(listId: string, gameId: string, listed: boolean) {
  return (data: GamePageData) => data.game.id === gameId ? withListMembership(data, listId, listed) : data
}
