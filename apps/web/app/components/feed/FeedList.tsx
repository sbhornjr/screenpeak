'use client'

import { useState, useTransition } from 'react'
import FeedItem from './FeedItem'
import { fetchFeedPage } from '@/app/feed-actions'
import { FEED_PAGE_SIZE } from '@screenpeak/shared/constants'
import type { FeedItem as FeedItemType } from '@screenpeak/shared/types'

function keyFor(item: FeedItemType, i: number) {
    return `${item.activity_type}-${item.actor_id}-${item.game_id ?? item.list_id ?? 'x'}-${item.created_at}-${i}`
}

export default function FeedList({ initialItems }: { initialItems: FeedItemType[] }) {
    const [items, setItems] = useState(initialItems)
    const [done, setDone] = useState(initialItems.length < FEED_PAGE_SIZE)
    const [pending, startTransition] = useTransition()

    function loadMore() {
        startTransition(async () => {
            const next = await fetchFeedPage(items.length)
            setItems((prev) => [...prev, ...next])
            if (next.length < FEED_PAGE_SIZE) setDone(true)
        })
    }

    return (
        <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((item, i) => (
                    <FeedItem key={keyFor(item, i)} item={item} />
                ))}
            </section>

            {!done && (
                <div className="flex justify-center mt-8">
                    <button
                        type="button"
                        onClick={loadMore}
                        disabled={pending}
                        className="px-5 py-2 rounded-[3px] text-sm font-semibold border border-(--color-border)
                            text-(--color-muted) hover:text-(--color-accent) hover:border-(--color-accent)
                            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent)
                            transition-colors duration-200 disabled:opacity-60"
                    >
                        {pending ? 'Loading…' : 'Show more'}
                    </button>
                </div>
            )}
        </>
    )
}
