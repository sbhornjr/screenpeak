import type { UserReviewItem, UserReviewsPage, UserReviewsQuery } from '@screenpeak/shared/api/user-reviews'

export const RATINGS_PAGE_SIZE = 20

/** What the screen asks for. The page number comes from scrolling. */
export type RatingsQuery = Pick<UserReviewsQuery, 'filter' | 'sort' | 'order'>

/** The website's default: everything, newest first. */
export const RATINGS_QUERY: RatingsQuery = { filter: 'all', sort: 'date', order: 'desc' }

/** Every loaded page in order. A row a new rating pushed onto the next page shows once. */
export function ratingsItems(pages: UserReviewsPage[]): UserReviewItem[] {
  const seen = new Set<string>()
  const items: UserReviewItem[] = []
  for (const page of pages) {
    for (const item of page.items) {
      if (seen.has(item.game_id)) continue
      seen.add(item.game_id)
      items.push(item)
    }
  }
  return items
}

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

export function ratingsCountLine(counts: UserReviewsPage['counts']): string {
  return [
    count(counts.rating_count, 'rating', 'ratings'),
    count(counts.review_count, 'review', 'reviews'),
    `${counts.total_count} total`,
  ].join(' / ')
}
