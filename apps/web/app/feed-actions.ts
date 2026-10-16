'use server'

import { getOptionalUser } from '@/lib/auth'
import { loadFeed } from '@/lib/loaders/feed'
import type { FeedItem } from '@screenpeak/shared/types'

/** Fetch the next page of the signed-in viewer's activity feed. */
export async function fetchFeedPage(offset: number): Promise<FeedItem[]> {
    const viewer = await getOptionalUser()
    const page = await loadFeed(viewer?.id ?? null, offset)
    return page.items
}
