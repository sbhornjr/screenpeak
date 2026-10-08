"use client"

import Image from "next/image"
import Link from "next/link"
import ExpandableText from "../util/ExpandableText"
import Seal from "@/app/components/game/Seal"

export default function FeedReview({ gameSlug, gameName, gameCoverImageUrl, rating, review } :
    { gameSlug: string | null, gameName: string | null, gameCoverImageUrl: string | null, rating: number | null, review: string | null }) {

    return (
        <div className="flex gap-4 p-3 rounded-[3px] hover:bg-(--color-surface-light)/50 transition-colors duration-200 group">
            <Link href={`/games/${gameSlug}`}
                className="relative w-20 h-28 shrink-0 rounded-[3px] overflow-hidden">
                {gameCoverImageUrl ? (
                    <Image src={gameCoverImageUrl} alt={gameName!}
                        fill className="object-cover" sizes="80px" />
                ) : (
                    <div className="w-full h-full bg-(--color-surface-light) rounded-[3px]" />
                )}
                {rating && <Seal score={rating} side="right" size="sm" />}
            </Link>
            <div className="flex flex-col gap-1 min-w-0 flex-1">
                <Link href={`/games/${gameSlug}`}
                    className="font-bold text-base text-(--color-text) hover:text-(--color-accent) transition-colors duration-200 font-(family-name:--font-display)">
                    {gameName}
                </Link>
                {review && (
                    <ExpandableText text={review} className="text-sm text-(--color-muted) leading-relaxed" lines={3} />
                )}
            </div>
        </div>
    )
}