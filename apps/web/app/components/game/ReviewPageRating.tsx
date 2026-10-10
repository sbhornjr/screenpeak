"use client"

import Link from "next/link"
import Image from "next/image"
import { parseDbTimestamp } from "@/lib/dates"
import { displayCoverUrl } from "@/lib/catalog/images"

export default function Rating({ slug, name, cover, released, developer, rating, createdAt } : 
    { slug: string, name: string, cover: string, released: string, developer?: string | null, rating: number, createdAt: string}
) {

    const scoreColor = (score: number) => score >= 8 ? 'var(--color-good)' : score >= 6 ? 'var(--color-mid)' : 'var(--color-bad)'
    const image = displayCoverUrl(cover, 'small')

    return (
        <Link href={`/games/${slug}`}
            className="flex items-center gap-3 px-3 py-2 rounded-[3px]
                hover:bg-(--color-surface-light)/50 transition-colors duration-200 group">
            <div className="relative w-8 aspect-3/4 shrink-0 rounded-[3px] overflow-hidden bg-(--color-surface-light)">
                {image
                    ? <Image src={image} alt={name} fill className="object-cover" sizes="32px" />
                    : null}
            </div>
            <div className="flex-1 min-w-0 flex items-center gap-2">
                <span className="text-sm font-semibold text-(--color-text) group-hover:text-(--color-accent)
                    transition-colors duration-200 truncate font-(family-name:--font-display)">
                    {name}
                </span>
                {released && (
                    <span className="text-xs text-(--color-muted) shrink-0">
                        {new Date(released).getFullYear()}
                    </span>
                )}
                    {developer && (
                    <span className="text-xs text-(--color-muted) shrink-0 hidden sm:block">
                        · {developer}
                    </span>
                )}
            </div>
            <div className="flex items-center gap-3 shrink-0">
                <span className="text-sm font-bold font-mono"
                style={{ color: scoreColor(rating) }}>
                {rating}<span className="text-xs text-(--color-muted) font-normal">/10</span>
                </span>
                <span className="text-xs text-(--color-muted)">{parseDbTimestamp(createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
            </div>
        </Link>
    )
}