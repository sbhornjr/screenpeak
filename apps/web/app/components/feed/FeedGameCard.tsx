"use client"

import Image from "next/image"
import Link from "next/link"
import Seal from "@/app/components/game/Seal"

export default function FeedGameCard({ gameSlug, gameName, gameCoverImageUrl, gameReleased, gameDeveloper, userRating, avgRating } :
    { gameSlug: string | null, gameName: string | null, gameCoverImageUrl: string | null, gameReleased: string | null, gameDeveloper: string | null, userRating: number | null, avgRating: number | null }) {

    return (
        <Link href={`/games/${gameSlug}`}
            className="flex gap-4 p-3 rounded-[3px] hover:bg-(--color-surface-light)/50 transition-colors duration-200 group">

            <div className="relative w-20 h-28 shrink-0 rounded-[3px] overflow-hidden">
                {gameCoverImageUrl ? (
                    <Image src={gameCoverImageUrl} alt={gameName ? gameName : "Game Cover"}
                        fill className="object-cover" sizes="80px" />
                ) : (
                    <div className="w-full h-full bg-(--color-surface-light) flex items-center justify-center overflow-hidden">
                        <div className="absolute inset-0 opacity-[0.07]"
                            style={{ backgroundImage: 'repeating-linear-gradient(135deg, var(--color-muted) 0, var(--color-muted) 1px, transparent 1px, transparent 8px)' }} />
                        <span className="relative text-(--color-muted) text-[8px] uppercase tracking-[0.15em] font-mono">No Cover</span>
                    </div>
                )}
                {/* One tag only — the cover is 80px wide and the feed line already
                    states the rating. Community score, then the viewer's own.
                    No score means no tag. */}
                {avgRating ? (
                    <Seal label="SP" score={avgRating} side="right" size="sm" />
                ) : userRating ? (
                    <Seal label="You" score={userRating} side="right" size="sm" />
                ) : null}
            </div>

            <div className="flex flex-col justify-center gap-1 flex-1 min-w-0">
                <p className="font-bold text-base text-(--color-text) group-hover:text-(--color-accent)
                    transition-colors duration-200 font-(family-name:--font-display)">
                    {gameName}
                </p>
                <p className="text-sm text-(--color-muted) font-(family-name:--font-mono)">
                    {gameReleased && new Date(gameReleased).getFullYear()}
                    {gameDeveloper && ` · ${gameDeveloper}`}
                </p>
            </div>
        </Link>
    )
}