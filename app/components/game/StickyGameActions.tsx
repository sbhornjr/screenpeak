'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Renders the game's primary action buttons inline, and — once they scroll out
 * of view — repeats them in a slim bar pinned to the top of the viewport so the
 * "Add to Library" action is always reachable on a long page.
 */
export default function StickyGameActions({ gameName, children }: { gameName: string; children: React.ReactNode }) {
    const sentinel = useRef<HTMLDivElement>(null)
    const [stuck, setStuck] = useState(false)

    useEffect(() => {
        const el = sentinel.current
        if (!el) return
        const io = new IntersectionObserver(
            ([entry]) => setStuck(!entry.isIntersecting && entry.boundingClientRect.top < 0),
            { threshold: 0 },
        )
        io.observe(el)
        return () => io.disconnect()
    }, [])

    return (
        <>
            <div className="flex gap-4 flex-wrap w-full justify-start">{children}</div>
            <div ref={sentinel} aria-hidden="true" className="h-px w-full" />

            <div
                className={`fixed inset-x-0 top-0 z-40 border-b-2 border-(--color-border-bright) bg-(--color-bg)/95 backdrop-blur
                    transition-transform duration-200 motion-reduce:transition-none
                    ${stuck ? 'translate-y-0' : '-translate-y-full pointer-events-none'}`}
            >
                <div className="max-w-5xl mx-auto px-6 md:px-10 py-2 flex items-center gap-4">
                    <span className="font-mono text-[0.6875rem] uppercase tracking-[0.16em] text-(--carbon) truncate">
                        {gameName}
                    </span>
                    <div className="ml-auto flex gap-2 shrink-0">{children}</div>
                </div>
            </div>
        </>
    )
}
