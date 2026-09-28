"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import LikeButton from "./LikeListButton"
import CoverFan from "./CoverFan"
import { GameCover } from "@screenpeak/shared/types"
import { toggleListPinned } from "@/app/list-actions"
import { parseDbTimestamp } from "@/lib/dates"
import { Pin } from "lucide-react"

export default function ListPreview({ listId, listName, gameCovers, isPinnable, isLikable, description, lastUpdated, username, listCount, isPinned, likeCount, userHasLiked, activeUserId, fullLength } :
    { listId: number, listName: string, gameCovers: GameCover[] | undefined, isPinnable: boolean, isLikable: boolean, description: string | null, lastUpdated: string, username: string, listCount: number, isPinned?: boolean, likeCount: number, userHasLiked: boolean, activeUserId: string | undefined, fullLength: boolean }) {
    const [isPinnedNow, setIsPinnedNow] = useState<boolean | null | undefined>(isPinned)
    const router = useRouter()

    async function handlePinChange() {
        const { isPinned: newPinned, error } = await toggleListPinned(listId, !isPinnedNow)
        if (error) return // leave the pin state as it was — nothing changed server-side
        setIsPinnedNow(newPinned)
        router.refresh()
    }

    const updated = parseDbTimestamp(lastUpdated)
    const covers = gameCovers?.filter(g => g.coverImageUrl) ?? []

    return (
        <div className={`relative flex flex-col sm:flex-row gap-4 sm:gap-5 border border-(--color-border) rounded-[3px] p-4 min-w-0 overflow-hidden hover:border-(--color-accent)/50 transition-colors duration-200 group ${fullLength ? "" : "w-full"}`}>
            <Link
                href={`/user/${username}/lists/${listId}`}
                className="absolute inset-0 rounded-[3px] z-0"
                aria-label={listName}
            />

            {/* Left: the folio of covers — fixed width (a full 5-fan) so every
                title in a stack of lists starts at the same x, however many
                covers the list has. */}
            <div className="shrink-0 w-full sm:w-[21rem] flex">
                {covers.length > 0 ? (
                    <CoverFan size="lg" covers={covers.map(g => ({
                        key: g.slug ?? '',
                        src: g.coverImageUrl!,
                        alt: g.slug ?? '',
                        href: `/games/${g.slug ?? ''}`,
                    }))} />
                ) : (
                    <div className="w-24 h-36 rounded-[3px] border-2 border-dashed border-(--color-border)
                        flex items-center justify-center">
                        <span className="text-(--color-muted) text-[10px] uppercase tracking-[0.15em]
                            font-mono text-center px-2 leading-relaxed">
                            No games<br />yet
                        </span>
                    </div>
                )}
            </div>

            {/* Right: meta + controls, title, description — fills the width */}
            <div className="flex-1 min-w-0 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 text-xs text-(--color-muted) min-w-0">
                        <Link href={`/user/${username}`} className="font-semibold hover:text-(--color-accent)
                            transition-colors duration-200 truncate relative z-10">{username}</Link>
                        <span aria-hidden="true">&middot;</span>
                        <span className="font-mono whitespace-nowrap">Updated {updated.getMonth() + 1}/{updated.getDate()}/{updated.getFullYear()}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 relative z-10">
                        {isLikable && (
                            <LikeButton listId={String(listId)} initialLiked={userHasLiked} initialCount={likeCount} userId={activeUserId} />
                        )}
                        {isPinnable && (
                            <button
                                onClick={(e) => { e.stopPropagation(); handlePinChange() }}
                                className="shrink-0 w-9 h-9 rounded-[3px] border flex items-center justify-center
                                    transition-colors duration-200 group/pin
                                    border-(--color-border) hover:border-(--color-accent)
                                    bg-transparent hover:bg-(--color-accent)/10"
                                title={isPinnedNow ? 'Unpin list' : 'Pin list'}
                            >
                                <Pin size={16} aria-hidden fill={isPinnedNow ? "currentColor" : "none"}
                                    className={`transition-colors duration-200 group-hover/pin:text-(--color-accent) ${isPinnedNow ? "text-(--color-accent)" : "text-(--color-muted)"}`} />
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex-1 flex flex-col justify-center gap-1.5 max-w-prose">
                    <h2 className="text-2xl font-(family-name:--font-display) text-(--color-text) min-w-0">
                        <span className="line-clamp-1 break-words">{listName} <span className="text-(--color-muted) text-lg">({listCount})</span></span>
                    </h2>
                    {description && <p className="text-sm text-(--color-muted) line-clamp-3 leading-relaxed">{description}</p>}
                </div>
            </div>
        </div>
    )
}
