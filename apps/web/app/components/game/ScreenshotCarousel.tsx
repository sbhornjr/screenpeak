'use client'

import Image from 'next/image'
import { useState } from 'react'
import { ChevronLeft, ChevronRight } from "lucide-react"
import { displayLandscapeUrl } from "@/lib/catalog/images"

const arrowBtn = `absolute top-1/2 -translate-y-1/2 grid place-items-center size-9 rounded-full
    bg-black/55 text-white backdrop-blur-[2px] border border-white/20
    hover:bg-black/80 transition-colors duration-200
    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent)`

export default function ScreenshotCarousel({ screenshots }: { screenshots: string[] }) {
    const frames = screenshots.map(displayLandscapeUrl).filter((url): url is string => url != null)
    const [index, setIndex] = useState(0)
    if (frames.length === 0) return null

    const go = (next: number) => setIndex((next + frames.length) % frames.length)

    return (
        <div>
            <div className="relative aspect-video w-full overflow-hidden rounded-[6px] border border-(--color-border) bg-(--color-surface)">
                <a href={frames[index]} target="_blank" rel="noopener noreferrer" aria-label="Open screenshot full size" className="absolute inset-0 block">
                    <Image
                        key={frames[index]}
                        src={frames[index]}
                        alt={`Screenshot ${index + 1} of ${frames.length}`}
                        fill
                        sizes="(max-width: 768px) 100vw, 768px"
                        className="object-cover"
                    />
                </a>

                {frames.length > 1 && (
                    <>
                        <button type="button" onClick={() => go(index - 1)} aria-label="Previous screenshot" className={`left-2 ${arrowBtn}`}>
                            <ChevronLeft size={18} aria-hidden />
                        </button>
                        <button type="button" onClick={() => go(index + 1)} aria-label="Next screenshot" className={`right-2 ${arrowBtn}`}>
                            <ChevronRight size={18} aria-hidden />
                        </button>
                    </>
                )}
            </div>

            <div className="flex items-center justify-between mt-2 font-mono text-[0.625rem] uppercase tracking-[0.18em] text-(--color-muted)">
                <span className="tabular-nums">{index + 1} / {frames.length}</span>
                {frames.length > 1 && frames.length <= 12 && (
                    <div className="flex gap-1.5">
                        {frames.map((_, i) => (
                            <button
                                key={i}
                                type="button"
                                onClick={() => setIndex(i)}
                                aria-label={`Go to screenshot ${i + 1}`}
                                aria-current={i === index}
                                className={`h-1.5 rounded-full transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent)
                                    ${i === index ? 'w-5 bg-(--color-accent)' : 'w-1.5 bg-(--color-border) hover:bg-(--color-muted)'}`}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
