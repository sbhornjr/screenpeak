"use client"

import Link from "next/link"
import FeedGameCard from "@/app/components/feed/FeedGameCard"
import FeedReview from "@/app/components/feed/FeedReview"
import FeedListPreview from "@/app/components/feed/FeedListPreview"
import Avatar from "@/app/components/user/Avatar"
import FeedLibraryBatch from "./FeedLibraryBatch"
import type { FeedItem as FeedItemType } from "@/types"
import { parseDbTimestamp } from "@/lib/dates"

export function timeAgo(date: string): string {
    const seconds = Math.floor((Date.now() - parseDbTimestamp(date).getTime()) / 1000)
    if (seconds < 60) return 'just now'
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`
    return parseDbTimestamp(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// A glyph per activity type so the feed is scannable without reading every line.
function ActivityIcon({ type }: { type: string }) {
    const common = { width: 13, height: 13, viewBox: "0 0 16 16", fill: "none", "aria-hidden": true, className: "text-(--color-muted) shrink-0" } as const
    switch (type) {
        case "rating":
            return <svg {...common}><path d="M8 1.5l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.3 4.2 13.3l.7-4.3-3.1-3 4.3-.6z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>
        case "review":
            return <svg {...common}><path d="M2 3.5h12v7H6l-3 2.5v-2.5H2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>
        case "list_created":
            return <svg {...common}><path d="M5 4h9M5 8h9M5 12h9M2 4h.01M2 8h.01M2 12h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
        case "list_liked":
            return <svg {...common}><path d="M8 13.5S2 10 2 6.2A3.2 3.2 0 018 4.3a3.2 3.2 0 016 1.9C14 10 8 13.5 8 13.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>
        default: // library_add
            return <svg {...common}><path d="M4 2h8v12l-4-2.2L4 14z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>
    }
}

export default function FeedItem({ item }: { item: FeedItemType }) {

    const activity_text = item.activity_type === "library_add" 
        ? `added ${item.game_name} to their ${item.library_status === 'playing' ? 'currently playing' : item.library_status}` 
        : item.activity_type === "review" ? `reviewed ${item.game_name}` 
        : item.activity_type === "rating" ? `rated ${item.game_name} a ${item.rating}/10` 
        : item.activity_type === "list_created" ? `created the list "${item.list_name}"`
        : item.activity_type === "list_liked" ? `liked "${item.list_name}" by ${item.list_owner_username}` 
        : item.activity_type === "library_add_batch" ?  `added ${item.library_game_count} games to their library` : ""

    // List cards drive the row's height; the shorter card types (game card,
    // cover fan, review) centre their content in whatever height the row gets.
    const isListActivity = item.activity_type === "list_created" || item.activity_type === "list_liked"

    return (
        <div className="flex h-full flex-col p-4 bg-(--color-surface) rounded-[3px] border border-(--color-border) hover:border-(--color-accent)/40 transition-colors duration-200">

            <div className="mb-2 flex items-center gap-2">
                <Avatar src={item.actor_avatar_url} alt={item.actor_username} size="sm" bordered />
                <p className="text-sm text-(--color-muted) flex-1 min-w-0">
                    <Link href={`/user/${item.actor_username}`}
                        className="text-(--color-text) font-semibold hover:text-(--color-accent) transition-colors duration-200">
                        {item.actor_username}
                    </Link>
                    {' '}{activity_text}
                    </p>
                <span className="flex items-center gap-1.5 shrink-0 text-xs text-(--color-muted) font-mono">
                    <ActivityIcon type={item.activity_type} />
                    {timeAgo(item.created_at)}
                </span>
            </div>
            <div className={isListActivity ? undefined : "flex flex-1 flex-col justify-center"}>
            {(item.activity_type === "library_add" || item.activity_type === "rating") &&
                <FeedGameCard
                    gameSlug={item.game_slug} 
                    gameName={item.game_name} 
                    gameCoverImageUrl={item.game_cover_image_url} 
                    gameReleased={item.game_released}
                    gameDeveloper={item.game_developer}
                    userRating={item.viewer_game_rating}
                    avgRating={item.game_avg_rating}
                    metacriticScore={item.game_metacritic_score}
                />
            }
            {item.activity_type === "library_add_batch" && 
                <FeedLibraryBatch 
                    gameCoverImageUrls={item.library_cover_urls}
                />
            }
            {item.activity_type === "review" &&
                <FeedReview 
                    gameSlug={item.game_slug}
                    gameName={item.game_name}
                    gameCoverImageUrl={item.game_cover_image_url}
                    rating={item.rating}
                    review={item.review}
                />
            }
            {(item.activity_type === "list_created" || item.activity_type === "list_liked") &&
                <FeedListPreview
                    listId={item.list_id}
                    listOwnerUsername={item.list_owner_username}
                    listName={item.list_name}
                    listDescription={item.list_description}
                    listGameCount={item.list_game_count}
                    listLikeCount={item.list_like_count}
                    listCoverUrls={item.list_cover_urls}
                />
            }
            </div>
        </div>
    )
}