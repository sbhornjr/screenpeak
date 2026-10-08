"use client"

import Link from "next/link"
import CoverFan from "@/app/components/lists/CoverFan"
import { Heart } from "lucide-react"

export default function FeedListPreview({ listId, listName, listDescription, listOwnerUsername, listGameCount, listLikeCount, listCoverUrls } :
    { listId: string | null, listName: string | null, listDescription: string | null, listOwnerUsername: string | null, listGameCount: number | null, listLikeCount: number | null, listCoverUrls: string[] | null }) {

    return (
        <Link href={`/user/${listOwnerUsername}/lists/${listId}`}
            className="flex flex-col gap-2 p-2 rounded-[3px] hover:bg-(--color-surface-light)/50 transition-colors duration-200 group">
            <div className="flex items-start justify-between gap-4 mb-3">
                <div className="min-w-0 flex-1">
                    <p className="font-bold text-base text-(--color-text) group-hover:text-(--color-accent)
                        transition-colors duration-200 font-(family-name:--font-display)">
                        {listName}
                    </p>
                    {listDescription && (
                        <p className="text-sm text-(--color-muted) mt-1 line-clamp-2">
                            {listDescription}
                        </p>
                    )}
                </div>
                <div className="flex items-center gap-3 text-sm text-(--color-muted) shrink-0">
                    <span className="inline-flex items-center gap-1"><Heart size={13} aria-hidden />{listLikeCount ?? 0}<span className="sr-only">likes</span></span>
                    <span>· {listGameCount ?? 0} games</span>
                </div>
            </div>
            {listCoverUrls && listCoverUrls.length > 0 && (
                <CoverFan covers={listCoverUrls.slice(0, 5).map((url, i) => ({ key: String(i), src: url }))} />
            )}
        </Link>
    )
}