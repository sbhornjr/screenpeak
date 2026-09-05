"use client"

import { useState } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase-browser"
import { useRouter } from "next/navigation"
import LikeButton from "./LikeListButton"
import CoverFan from "./CoverFan"
import { GameCover } from "@/types"
import { setListPinned } from "@/lib/queries/list"

export default function ListPreview({ listId, listName, gameCovers, isPinnable, isLikable, description, lastUpdated, username, listCount, isPinned, likeCount, userHasLiked, activeUserId, fullLength } : 
    { listId: number, listName: string, gameCovers: GameCover[] | undefined, isPinnable: boolean, isLikable: boolean, description: string | null, lastUpdated: string, username: string, listCount: number, isPinned?: boolean, likeCount: number, userHasLiked: boolean, activeUserId: string | undefined, fullLength: boolean }) {
    const [isPinnedNow, setIsPinnedNow] = useState(isPinned)
    const router = useRouter()

    async function handlePinChange() {
        const supabase = createClient()
        const { isPinned: newPinned, error } = await setListPinned(supabase, listId, !isPinnedNow)
        if (error) return // leave the pin state as it was — nothing changed server-side
        setIsPinnedNow(newPinned)
        router.refresh()
    }

    return (
        <div className={`flex flex-col relative border border-(--color-border) rounded-[3px] p-4 min-w-0 overflow-hidden hover:border-(--color-accent)/50 transition-all duration-200 group ${fullLength ? "" : "w-full"}`}>
            <Link
                href={`/user/${username}/lists/${listId}`}
                className="absolute inset-0 rounded-[3px] z-0"
                aria-label={listName}
            />
            <div className="flex flex-row justify-between mb-3 px-2 py-1">
                <Link href={`/user/${username}`} className="text-sm font-semibold text-(--color-muted) hover:text-(--color-accent)
                    transition-colors duration-200 block relative z-10">{username}</Link>
                <p className="text-xs text-(--color-muted) font-mono">Updated {new Date(lastUpdated).getMonth() + 1}/{new Date(lastUpdated).getDate()}/{new Date(lastUpdated).getFullYear()}</p>
            </div>
            <div className="flex flex-col mb-4 px-2 py-1 gap-1">
                <h2 className="text-2xl font-(family-name:--font-display) text-(--color-text) min-w-0">
                    <span className="line-clamp-1 break-words">{listName} <span className="text-(--color-muted) text-lg">({listCount})</span></span>
                </h2>
                {description && <p className="text-sm text-(--color-muted) line-clamp-2">{description}</p>}
            </div>
            <div className="flex flex-row mb-2 px-2 py-2 gap-2 items-center">
                <div className="min-w-0 flex-1 overflow-hidden">
                {gameCovers && gameCovers.length > 0 ? (
                    <CoverFan size="lg" covers={gameCovers.filter(g => g.coverImageUrl).map(g => ({
                        key: g.slug ?? '',
                        src: g.coverImageUrl!,
                        alt: g.slug ?? '',
                        href: `/games/${g.slug ?? ''}`,
                    }))} />
                ) : (
                    <div className="w-28 h-40 rounded-[3px] border-2 border-dashed border-(--color-border)
                        flex items-center justify-center shrink-0">
                        <span className="text-(--color-muted) text-[10px] uppercase tracking-[0.15em]
                            font-mono text-center px-2 leading-relaxed">
                            No games<br />yet
                        </span>
                    </div>
                )}
                </div>
                <div className="flex flex-col gap-2 shrink-0 items-end justify-center relative z-10">
                    {isLikable && (
                        <LikeButton listId={String(listId)} initialLiked={userHasLiked} initialCount={likeCount} userId={activeUserId} />
                    )}
                    {isPinnable && (
                        <button
                            onClick={async (e) => {
                                e.stopPropagation() 
                                handlePinChange()
                            }}
                            className="relative z-10 shrink-0 w-10 h-10 rounded-[3px] border
                                flex items-center justify-center self-center
                                transition-all duration-200
                                group/pin ml-auto
                                border-(--color-border) hover:border-(--color-accent)
                                bg-transparent hover:bg-(--color-accent)/10"
                            title={isPinnedNow ? 'Unpin list' : 'Pin list'}
                        >
                            <svg
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill={isPinnedNow ? 'var(--color-accent)' : 'none'}
                                stroke={isPinnedNow ? 'var(--color-accent)' : 'var(--color-muted)'}
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="transition-all duration-200 group-hover/pin:stroke-(--color-accent)"
                            >
                                <line x1="12" y1="17" x2="12" y2="22"/>
                                <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/>
                            </svg>
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}