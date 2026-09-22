'use client'

import { useState } from 'react'
import { toggleListLike } from '@/app/list-actions'

export default function LikeButton({ listId, initialCount, initialLiked, userId }: {
    listId: string
    initialCount: number
    initialLiked: boolean
    userId: string | null | undefined
}) {
    const [liked, setLiked] = useState(initialLiked)
    const [count, setCount] = useState(initialCount)
    const [loading, setLoading] = useState(false)

    async function handleLike() {
        if (!userId) return
        if (loading) return

        setLoading(true)
        const { error } = await toggleListLike(listId, liked)

        if (!error) {
            setLiked(!liked)
            setCount(c => liked ? c - 1 : c + 1)
        }

        setLoading(false)
    }

    return (
        <button
            onClick={handleLike}
            disabled={loading}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-[3px] border
                text-sm font-semibold transition-all duration-200 z-10
                ${liked
                ? 'border-(--color-accent) text-(--color-accent) bg-(--color-accent)/10'
                : 'border-(--color-border) text-(--color-muted) hover:border-(--color-accent) hover:text-(--color-accent)'}`}
        >
            <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill={liked ? 'var(--color-accent)' : 'none'}
                stroke={liked ? 'var(--color-accent)' : 'currentColor'}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="transition-all duration-200"
            >
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
            {count > 0 && <span>{count}</span>}
        </button>
    )
}
