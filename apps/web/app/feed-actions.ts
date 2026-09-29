'use server'

import { getOptionalUser } from '@/lib/auth'
import { getFeed } from '@/lib/queries/feed'
import { FEED_PAGE_SIZE } from '@screenpeak/shared/constants'
import type { FeedItem } from '@screenpeak/shared/types'

/** Fetch the next page of the signed-in viewer's activity feed. */
export async function fetchFeedPage(offset: number): Promise<FeedItem[]> {
    const viewer = await getOptionalUser()
    if (!viewer) return []
    return getFeed(viewer.id, FEED_PAGE_SIZE, offset)
}
