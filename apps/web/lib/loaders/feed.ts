import 'server-only'
import { FEED_PAGE_SIZE } from '@screenpeak/shared/constants'
import type { FeedPageData } from '@screenpeak/shared/api/feed'
import type { FeedItem } from '@screenpeak/shared/types'
import { getFeed } from '@/lib/queries/feed'
import { cover, covers, num, text } from '@/lib/loaders/shape'

/** Signed out: an empty feed. The query is not run, so nobody else's activity is returned. */
export async function loadFeed(viewerId: string | null, offset: number): Promise<FeedPageData> {
    if (!viewerId) return { items: [], viewer: null }

    const rows = await getFeed(viewerId, FEED_PAGE_SIZE, offset)
    return {
        items: rows.map(shapeFeedItem),
        viewer: { id: viewerId },
    }
}

// Field by field. get_feed still selects game_metacritic_score; it must not leave this function.
function shapeFeedItem(row: FeedItem & { game_metacritic_score?: unknown }): FeedItem {
    return {
        activity_type: String(row.activity_type ?? ''),
        created_at: text(row.created_at) ?? '',
        actor_id: String(row.actor_id ?? ''),
        actor_username: String(row.actor_username ?? ''),
        actor_avatar_url: text(row.actor_avatar_url),
        game_id: row.game_id == null ? null : String(row.game_id),
        game_name: text(row.game_name),
        game_slug: text(row.game_slug),
        game_cover_image_url: cover(row.game_cover_image_url, 'small'),
        game_released: text(row.game_released),
        game_developer: text(row.game_developer),
        game_avg_rating: num(row.game_avg_rating),
        viewer_game_rating: num(row.viewer_game_rating),
        list_cover_urls: covers(row.list_cover_urls, 'small'),
        list_id: row.list_id == null ? null : String(row.list_id),
        list_name: text(row.list_name),
        list_description: text(row.list_description),
        list_owner_username: text(row.list_owner_username),
        list_game_count: row.list_game_count == null ? null : num(row.list_game_count),
        list_last_activity: text(row.list_last_activity),
        list_like_count: row.list_like_count == null ? null : num(row.list_like_count),
        viewer_liked_list: row.viewer_liked_list == null ? null : !!row.viewer_liked_list,
        rating: num(row.rating),
        review: text(row.review),
        review_created_at: text(row.review_created_at),
        review_updated_at: text(row.review_updated_at),
        library_status: text(row.library_status),
        library_game_count: row.library_game_count == null ? null : num(row.library_game_count),
        library_cover_urls: covers(row.library_cover_urls, 'small'),
        library_game_names: Array.isArray(row.library_game_names) ? row.library_game_names.map(name => String(name)) : null,
    }
}
