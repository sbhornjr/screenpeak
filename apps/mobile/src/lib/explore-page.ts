import type { ExploreListCard, ExplorePageData } from '@screenpeak/shared/api/explore'

import { likedCount } from './lists-page'

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

/** Above a recommended game, as on the website. */
export function completedLine(followers: number, avgFollowerRating: number | null): string {
  const people = `${plural(followers, 'follower', 'followers')} completed`
  return avgFollowerRating == null ? people : `${people} · ${avgFollowerRating}/10 avg`
}

/** Below a recommended game: it is already in your backlog or on your Wishlist. */
export function libraryLine(status: string | null | undefined): string | null {
  if (status === 'backlog') return 'In your backlog'
  if (status === 'wishlist') return 'On your wishlist'
  return null
}

export function likedByLine(count: number): string {
  return `${plural(count, 'user', 'users')} you follow liked this`
}

export function followedByLine(count: number): string {
  return `Followed by ${plural(count, 'user', 'users')} you follow`
}

function liked<T extends ExploreListCard>(list: T, listId: string, like: boolean): T {
  if (list.id !== listId) return list
  return { ...list, viewer_has_liked: like, like_count: likedCount(list.like_count, list.viewer_has_liked, like) }
}

/** A list can be trending and recommended at once; both cards change. */
export function withExploreListLike(data: ExplorePageData, listId: string, like: boolean): ExplorePageData {
  return {
    ...data,
    trending_lists: data.trending_lists.map(list => liked(list, listId, like)),
    recommendations: data.recommendations && {
      ...data.recommendations,
      lists: data.recommendations.lists.map(list => liked(list, listId, like)),
    },
  }
}
