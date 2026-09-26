"use client"

import Link from 'next/link';
import { ChevronLeft, ChevronRight } from "lucide-react"

export default function Pagination({ page, maxPages, params, url }: { page: number, maxPages: number, params: Record<string, string>, url: string }) {

    function getPageNumbers(current: number, total: number): (number | null)[] {
        if (total <= 7) {
            return Array.from({ length: total }, (_, i) => i + 1)
        }

        const window = 2
        let start = Math.max(2, current - window)
        let end = Math.min(total - 1, current + window)

        // Keep the middle run a consistent width even when current sits near an end,
        // so page 1 shows 1 2 3 4 5 6 … 51 rather than the jarring 1 2 … 51.
        if (current - window < 2) end = Math.min(total - 1, end + (2 - (current - window)))
        if (current + window > total - 1) start = Math.max(2, start - ((current + window) - (total - 1)))

        const pages: (number | null)[] = [1]
        if (start > 2) pages.push(null)
        for (let i = start; i <= end; i++) pages.push(i)
        if (end < total - 1) pages.push(null)
        pages.push(total)
        return pages
    }

    function hrefFor(newPage: number) {
        const p = new URLSearchParams(params)
        p.set('page', String(newPage))
        return `/${url}?${p.toString()}`
    }

    const cell = "inline-flex items-center justify-center min-h-11 min-w-11 px-2 rounded-[3px] text-sm transition-colors duration-200"
    const arrow = `${cell} text-(--color-muted) hover:text-(--color-text) hover:bg-(--color-surface-light)`
    const arrowOff = `${cell} text-(--color-border)`

    return (
        <div className="flex flex-row flex-wrap gap-0.5 items-center justify-center">
            {page > 1
                ? <Link href={hrefFor(page - 1)} aria-label="Previous page" className={arrow}><ChevronLeft size={16} aria-hidden /></Link>
                : <span className={arrowOff} aria-hidden="true"><ChevronLeft size={16} /></span>
            }
            {getPageNumbers(page, maxPages).map((n, i) =>
                n === null
                    ? <span key={`ellipsis-${i}`} className="text-(--color-muted) px-1 select-none">…</span>
                    : <Link
                        key={n}
                        href={hrefFor(n)}
                        aria-current={n === page ? "page" : undefined}
                        className={`${cell} font-semibold tabular-nums
                        ${n === page
                            ? 'bg-(--color-accent) text-(--color-bg)'
                            : 'text-(--color-muted) hover:text-(--color-text) hover:bg-(--color-surface-light)'}`}
                    >
                        {n}
                    </Link>
            )}
            {page < maxPages
                ? <Link href={hrefFor(page + 1)} aria-label="Next page" className={arrow}><ChevronRight size={16} aria-hidden /></Link>
                : <span className={arrowOff} aria-hidden="true"><ChevronRight size={16} /></span>
            }
        </div>
    )
}
