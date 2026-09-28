'use server'

import { createClient } from '@/lib/supabase-server'
import { getViewer } from '@/lib/queries/user-auth'
import { getFeed } from '@/lib/queries/feed'
import { FEED_PAGE_SIZE } from '@screenpeak/shared/constants'
import type { FeedItem } from '@screenpeak/shared/types'

/** Fetch the next page of the signed-in viewer's activity feed. */
export async function fetchFeedPage(offset: number): Promise<FeedItem[]> {
    const supabase = await createClient()
    const viewer = await getViewer(supabase)
    if (!viewer) return []
    return getFeed(viewer.id, FEED_PAGE_SIZE, offset)
}
