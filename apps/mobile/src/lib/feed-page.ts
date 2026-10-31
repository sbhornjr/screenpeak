import type { FeedPageData } from '@screenpeak/shared/api/feed'
import { FEED_PAGE_SIZE } from '@screenpeak/shared/constants'
import type { FeedItem } from '@screenpeak/shared/types'

/** The server sorts by these, and no two rows share them (migration 0011). */
export function feedItemKey(item: FeedItem): string {
  return [item.created_at, item.actor_id, item.activity_type, item.game_id ?? '', item.list_id ?? ''].join('|')
}

/** `getNextPageParam`: the offset after every row loaded so far, or nothing after a short page. */
export function nextFeedOffset(last: FeedPageData, pages: FeedPageData[]): number | undefined {
  if (last.items.length < FEED_PAGE_SIZE) return undefined
  return pages.reduce((count, page) => count + page.items.length, 0)
}

/**
 * Every loaded row, in order. Offsets shift when friends post between page
 * loads, so a row can come back on the next page; it is shown once.
 */
export function feedItems(pages: FeedPageData[]): FeedItem[] {
  const seen = new Set<string>()
  const items: FeedItem[] = []
  for (const page of pages) {
    for (const item of page.items) {
      const key = feedItemKey(item)
      if (seen.has(key)) continue
      seen.add(key)
      items.push(item)
    }
  }
  return items
}
