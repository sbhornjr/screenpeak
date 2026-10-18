"use client"

import Link from "next/link"
import Image from "next/image"
import ExpandableText from "../util/ExpandableText"
import { parseDbTimestamp } from "@/lib/dates"
import { displayCoverUrl } from "@/lib/catalog/images"
import { tierColor } from "@/lib/rating-tier"

export default function Review({ slug, name, cover, released, developer, rating, review, createdAt } : 
    { slug: string, name: string, cover: string, released: string, developer?: string | null, rating: number, review: string, createdAt: string}
) {

    const image = displayCoverUrl(cover, 'small')

    return (
        <div className="py-1">
            <Link href={`/games/${slug}`}
                className="flex items-center gap-3 px-3 py-2 rounded-[3px]
                    hover:bg-(--color-surface-light)/50 transition-colors duration-200 group w-full">
                <div className="relative w-16 aspect-3/4 shrink-0 rounded-[3px] overflow-hidden bg-(--color-surface-light)">
                    {image
                        ? <Image src={image} alt={name} fill className="object-cover" sizes="64px" />
                        : <span className="absolute inset-0 grid place-items-center text-(--color-muted) text-[8px] uppercase tracking-[0.12em] font-mono">No Cover</span>}
                </div>
                <div className="flex flex-col gap-1 py-2 w-full">
                    <div className="flex items-center gap-3 py-2 w-full">
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
                        <div className="flex items-center gap-3 shrink-0 ml-auto">
                            <span className="text-sm font-bold font-mono"
                                style={{ color: tierColor(rating) }}>
                                {rating}<span className="text-xs text-(--color-muted) font-normal">/10</span>
                            </span>
                            <span className="text-xs text-(--color-muted)">{parseDbTimestamp(createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                        </div>
                    </div>
                    <ExpandableText text={review} className="text-sm" lines={4} />
                </div>
            </Link>
        </div>
    )
}