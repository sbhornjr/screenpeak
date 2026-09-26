'use client'

import { useState, useRef, useEffect } from 'react'

const clampClass: Record<number, string> = {
    3: 'line-clamp-3',
    4: 'line-clamp-4',
    5: 'line-clamp-5',
    6: 'line-clamp-6',
    8: 'line-clamp-8',
}

export default function ExpandableText({ text, lines = 6, className = "text-sm text-(--color-muted) leading-relaxed" } : 
    { text: string, lines?: number, className?: string }) {
    const [expanded, setExpanded] = useState(false)
    const [isClamped, setIsClamped] = useState(false)
    const textRef = useRef<HTMLParagraphElement>(null)

    useEffect(() => {
        const el = textRef.current
        if (!el) return
        setIsClamped(el.scrollHeight > el.clientHeight)
    }, [text])

    return (
        <div>
            <p ref={textRef} className={`${className} ${!expanded ? (clampClass[lines] ?? 'line-clamp-6') : ''}`}>
                {text}
            </p>
            {isClamped && 
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="text-xs text-(--color-accent) hover:text-(--color-accent-hover) transition-colors 
                    duration-200 mt-1 font-semibold"
                >
                    {expanded ? 'Show less' : 'Read more'}
                </button>
            }
        </div>
    )
}