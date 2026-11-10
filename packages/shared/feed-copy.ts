// Copy both apps show on the activity feed. Dependency-free so the phone
// bundle can import it.
import { parseDbTimestamp } from './dates'
import type { FeedItem } from './types'

export const FEED_EMPTY = {
    title: 'Your feed is quiet',
    description: 'Follow other players and their ratings, reviews, and lists will show up here.',
    actionLabel: 'Find people to follow',
} as const

/** What the player did, without their name: each app renders the name as a profile link. */
export function feedActivityPhrase(item: FeedItem): string {
    switch (item.activity_type) {
        case 'library_add': {
            const status = item.library_status
            const target = status === 'playing' ? 'currently playing list'
                : status === 'completed' ? 'completed list'
                : status === 'abandoned' ? 'abandoned list'
                : status === 'backlog' ? 'backlog'
                : (status ?? 'library')
            return `added ${item.game_name} to their ${target}`
        }
        case 'review':
            return `reviewed ${item.game_name}`
        case 'rating':
            return `rated ${item.game_name} a ${item.rating}/10`
        case 'list_created':
            return `created the list "${item.list_name}"`
        case 'list_liked':
            return `liked "${item.list_name}" by ${item.list_owner_username}`
        case 'library_add_batch':
            return `added ${item.library_game_count} games to their library`
        default:
            return ''
    }
}

/** Minutes, hours, or days ago; a week or older is the short date. */
export function timeAgo(date: string, now = Date.now()): string {
    const at = parseDbTimestamp(date)
    const seconds = Math.floor((now - at.getTime()) / 1000)
    if (seconds < 60) return 'just now'
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`
    return at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
