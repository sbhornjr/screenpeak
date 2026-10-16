// GET /api/v1/feed?offset=
//
// The signed-in player's activity. Signed out, `items` is empty and `viewer`
// is null — there is no public feed. Covers are display-ready thumbs.
import type { FeedItem } from '../types'

export type FeedPageData = {
    items: FeedItem[]
    viewer: { id: string } | null
}
